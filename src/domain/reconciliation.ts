/**
 * Motor de conferência.
 *
 * Cenário A (carrinho × nota): associa itens por código de barras, associação manual
 * ou descrição; compara quantidades, preços, descontos e totais.
 * Cenário B (somente nota): analisa a estrutura interna do cupom (linhas repetidas,
 * quantidades incomuns, contas que não fecham, itens ilegíveis).
 *
 * Todos os cálculos são determinísticos e em centavos. As cores indicam nível de atenção,
 * não confirmação de erro ou fraude.
 */
import { cartTotals, itemNetCents, sameGtin } from './cart';
import { Cents, formatBRL, formatSignedBRL } from './money';
import { descriptionSimilarity, normalizeText, productSimilarity } from './matching';
import { itemNeedsReview, receiptItemNet, validateReceipt } from './receiptParser';
import type {
  CartItem,
  Divergence,
  DivergenceGroup,
  DivergenceKind,
  ItemMatch,
  MatchMethod,
  ParsedReceipt,
  ReceiptItem,
  ReconciliationReport,
  Resolution,
  Severity,
} from './types';
import { extractPackageMeasure, formatQuantity, isWeighed, lineSubtotal, MILLI, samePackage } from './units';

export const DESCRIPTION_MATCH_THRESHOLD = 0.5;
/** Variação de peso tolerada antes de alertar (balança × registro do usuário). */
export const WEIGHT_TOLERANCE_PERCENT = 5;

export interface ReconcileOptions {
  /** receiptItemId → cartItemId definidos pelo usuário. */
  manualMatches?: Record<string, string>;
  /** receiptItemIds que o usuário declarou não corresponder a nenhum item do carrinho. */
  manualUnmatched?: string[];
  /** Resoluções anteriores (chave da divergência → resolução). */
  resolutions?: Record<string, Resolution>;
  now?: string;
}

const GROUP_OF: Record<DivergenceKind, DivergenceGroup> = {
  possible_duplicate: 'duplicates',
  quantity_more: 'quantity',
  quantity_less: 'quantity',
  price_higher: 'price',
  price_lower: 'price',
  not_in_cart: 'not_found',
  not_in_receipt: 'not_found',
  discount: 'discounts',
  total_mismatch: 'review',
  math_mismatch: 'review',
  needs_review: 'review',
  match_uncertain: 'review',
};

export const GROUP_LABEL: Record<DivergenceGroup, string> = {
  ok: 'Itens sem divergência identificada',
  duplicates: 'Possíveis cobranças duplicadas',
  quantity: 'Diferenças de quantidade',
  price: 'Diferenças de preço',
  not_found: 'Itens não localizados',
  discounts: 'Descontos e ajustes',
  review: 'Precisam de revisão manual',
};

export const GROUP_ORDER: DivergenceGroup[] = ['duplicates', 'quantity', 'price', 'not_found', 'discounts', 'review'];

function div(
  kind: DivergenceKind,
  severity: Severity,
  title: string,
  explanation: string,
  cartItemId: string | null,
  receiptItemIds: string[],
  potentialDiffCents: Cents | null,
  resolutions: Record<string, Resolution>,
): Divergence {
  const key = `${kind}:${cartItemId ?? '-'}:${[...receiptItemIds].sort().join(',')}`;
  return {
    key,
    kind,
    group: GROUP_OF[kind],
    severity,
    title,
    explanation,
    cartItemId,
    receiptItemIds,
    potentialDiffCents,
    resolution: resolutions[key] ?? 'open',
  };
}

function cartLabel(c: CartItem) {
  return [c.name, c.packageLabel].filter(Boolean).join(' — ');
}

interface Candidate {
  receiptId: string;
  cartId: string;
  score: number;
  priceConsistent: boolean;
  /** Descrição praticamente idêntica e mesma embalagem declarada nos dois lados. */
  strongDescription: boolean;
}

/** Associa linhas do cupom a itens do carrinho. Várias linhas podem apontar para o mesmo item. */
export function matchItems(cart: readonly CartItem[], receipt: readonly ReceiptItem[], opts: ReconcileOptions = {}): ItemMatch[] {
  const assigned = new Map<string, { cartId: string; method: MatchMethod; uncertain: boolean }>();
  const manual = opts.manualMatches ?? {};
  const forcedUnmatched = new Set(opts.manualUnmatched ?? []);
  const cartIds = new Set(cart.map((c) => c.id));

  // 1) associações manuais
  for (const r of receipt) {
    const cid = manual[r.id];
    if (cid && cartIds.has(cid)) assigned.set(r.id, { cartId: cid, method: 'manual', uncertain: false });
  }
  // 2) código de barras
  for (const r of receipt) {
    if (assigned.has(r.id) || forcedUnmatched.has(r.id) || !r.code) continue;
    const c = cart.find((ci) => ci.barcode && sameGtin(ci.barcode, r.code!));
    if (c) assigned.set(r.id, { cartId: c.id, method: 'barcode', uncertain: false });
  }
  // 3) descrição: primeiro um-para-um pelos melhores pares
  const remaining = receipt.filter((r) => !assigned.has(r.id) && !forcedUnmatched.has(r.id));
  const candidates: Candidate[] = [];
  for (const r of remaining) {
    for (const c of cart) {
      if (isWeighed(c.saleUnit) !== isWeighed(r.unit) && r.quantityMilli != null && r.quantityMilli % MILLI !== 0) continue;
      const score = productSimilarity(`${c.name} ${c.brand ?? ''}`, r.description, c.packageLabel);
      if (score < DESCRIPTION_MATCH_THRESHOLD) continue;
      const priceConsistent = r.unitPriceCents != null && Math.abs(r.unitPriceCents - c.unitPriceCents) <= 1;
      const cartText = `${c.name} ${c.brand ?? ''}`;
      const strongDescription =
        descriptionSimilarity(cartText, r.description) >= 0.9 &&
        samePackage(extractPackageMeasure(`${cartText} ${c.packageLabel ?? ''}`), extractPackageMeasure(r.description)) === true;
      candidates.push({ receiptId: r.id, cartId: c.id, score: score + (priceConsistent ? 0.15 : 0), priceConsistent, strongDescription });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const cartTakenByDescription = new Set<string>(Array.from(assigned.values()).map((a) => a.cartId));
  const ambiguous = (rid: string, best: Candidate) =>
    candidates.some((o) => o.receiptId === rid && o.cartId !== best.cartId && best.score - o.score < 0.1);

  for (const cand of candidates) {
    if (assigned.has(cand.receiptId) || cartTakenByDescription.has(cand.cartId)) continue;
    // Nome parecido não basta: exige preço coerente, ou descrição quase idêntica com a mesma embalagem.
    const uncertain = (!cand.priceConsistent && !cand.strongDescription) || cand.score < 0.75 || ambiguous(cand.receiptId, cand);
    assigned.set(cand.receiptId, { cartId: cand.cartId, method: 'description', uncertain });
    cartTakenByDescription.add(cand.cartId);
  }
  // 4) linhas adicionais do mesmo produto (ex.: registrado 1x, cobrado em 2 linhas)
  for (const cand of candidates) {
    if (assigned.has(cand.receiptId)) continue;
    if (!cand.priceConsistent || cand.score < 0.8) continue;
    const already = Array.from(assigned.entries()).find(([, a]) => a.cartId === cand.cartId);
    if (already && !ambiguous(cand.receiptId, cand)) {
      assigned.set(cand.receiptId, { cartId: cand.cartId, method: 'description', uncertain: already[1].uncertain });
    }
  }

  const byCart = new Map<string, ItemMatch>();
  for (const r of receipt) {
    const a = assigned.get(r.id);
    if (!a) continue;
    const m = byCart.get(a.cartId);
    if (m) {
      m.receiptItemIds.push(r.id);
      m.uncertain = m.uncertain || a.uncertain;
      if (a.method !== m.method && a.method === 'manual') m.method = 'manual';
    } else {
      byCart.set(a.cartId, { cartItemId: a.cartId, receiptItemIds: [r.id], method: a.method, uncertain: a.uncertain });
    }
  }
  return Array.from(byCart.values());
}

function receiptLabel(r: ReceiptItem) {
  return r.description;
}

/* ------------------------------------------------------------------ */
/* Checagens internas do cupom (usadas nos dois cenários)              */
/* ------------------------------------------------------------------ */

function internalReceiptChecks(receipt: ParsedReceipt, resolutions: Record<string, Resolution>, scenario: 'cart' | 'receipt_only'): Divergence[] {
  const out: Divergence[] = [];
  for (const r of receipt.items) {
    if (r.issues.includes('math_mismatch') && r.quantityMilli != null && r.unitPriceCents != null && r.totalCents != null) {
      const expected = lineSubtotal(r.unitPriceCents, r.quantityMilli);
      out.push(
        div(
          'math_mismatch',
          'yellow',
          'A conta da linha não fecha',
          `Na nota, "${receiptLabel(r)}" aparece com ${formatQuantity(r.quantityMilli, r.unit)} × ${formatBRL(r.unitPriceCents)} = ${formatBRL(expected)}, mas o valor da linha é ${formatBRL(r.totalCents)}. Pode ser erro de leitura da foto; confira no cupom impresso.`,
          null,
          [r.id],
          r.totalCents - expected,
          resolutions,
        ),
      );
    } else if (itemNeedsReview(r)) {
      out.push(
        div(
          'needs_review',
          'yellow',
          'Linha com leitura incompleta',
          `Não foi possível ler com segurança todos os dados de "${receiptLabel(r)}"${r.issues.length ? ` (${describeIssues(r)})` : ''}. Corrija na tela de revisão.`,
          null,
          [r.id],
          null,
          resolutions,
        ),
      );
    }
    if (r.unit === 'un' && r.quantityMilli != null && r.quantityMilli % MILLI !== 0) {
      out.push(
        div('needs_review', 'yellow', 'Quantidade fracionada em item por unidade', `"${receiptLabel(r)}" está como unidade, mas com quantidade ${formatQuantity(r.quantityMilli, 'kg').replace(' kg', '')}. Confira se é um produto pesado.`, null, [r.id], null, resolutions),
      );
    }
  }

  if (scenario === 'receipt_only') {
    // Linhas repetidas: mesmo código (ou descrição) e mesmo preço unitário.
    const groups = new Map<string, ReceiptItem[]>();
    for (const r of receipt.items) {
      if (isWeighed(r.unit)) continue; // itens pesados repetidos costumam ser pesagens diferentes
      const id = r.code ? `c:${r.code.replace(/^0+/, '')}` : `d:${normalizeText(r.description).replace(/[^A-Z0-9]/g, '')}`;
      const k = `${id}|${r.unitPriceCents ?? '?'}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    for (const lines of groups.values()) {
      if (lines.length < 2) continue;
      const totalUnits = lines.reduce((a, l) => a + (l.quantityMilli ?? MILLI), 0) / MILLI;
      const extra = lines.slice(1).map(receiptItemNet);
      const extraSum = extra.every((v): v is number => v != null) ? extra.reduce((a, b) => a + b, 0) : null;
      out.push(
        div(
          'possible_duplicate',
          'yellow',
          'Produto aparece mais de uma vez',
          `"${receiptLabel(lines[0])}" aparece em ${lines.length} linhas da nota, somando ${totalUnits} unidade(s). Isso é normal quando você levou mais de uma unidade. Se você levou menos, a diferença pode ser de até ${extraSum != null ? formatBRL(extraSum) : 'valor não calculável'}.`,
          null,
          lines.map((l) => l.id),
          extraSum,
          resolutions,
        ),
      );
    }
    // Quantidades incomuns
    for (const r of receipt.items) {
      if (r.unit === 'un' && r.quantityMilli != null && r.quantityMilli >= 10 * MILLI) {
        out.push(
          div('quantity_more', 'yellow', 'Quantidade elevada', `"${receiptLabel(r)}" foi cobrado com ${formatQuantity(r.quantityMilli, 'un')}. Confira se corresponde ao que você levou.`, null, [r.id], null, resolutions),
        );
      }
    }
  }

  // Descontos (informativos)
  for (const r of receipt.items) {
    if (r.discountCents > 0) {
      out.push(
        div('discount', 'green', 'Desconto aplicado', `"${receiptLabel(r)}" recebeu desconto de ${formatBRL(r.discountCents)} na nota. O valor final considerado foi ${formatBRL(receiptItemNet(r) ?? 0)}.`, null, [r.id], null, resolutions),
      );
    }
    if (r.surchargeCents > 0) {
      out.push(
        div('discount', 'yellow', 'Acréscimo no item', `"${receiptLabel(r)}" tem acréscimo de ${formatBRL(r.surchargeCents)}. Confira o motivo no cupom.`, null, [r.id], r.surchargeCents, resolutions),
      );
    }
  }
  if (receipt.unassignedDiscountCents > 0) {
    out.push(
      div('discount', 'yellow', 'Desconto sem item identificado', `A nota tem um desconto de ${formatBRL(receipt.unassignedDiscountCents)} que não pôde ser associado a um produto específico. Ele foi considerado no total, mas confira a que item se refere.`, null, [], null, resolutions),
    );
  }

  const v = validateReceipt(receipt);
  if (v.totalDiffCents != null && v.totalDiffCents !== 0) {
    out.push(
      div(
        'total_mismatch',
        'yellow',
        'Total da nota diferente da soma dos itens lidos',
        `A soma dos itens lidos (com descontos e acréscimos) dá ${formatBRL(receipt.totals.totalCents! - v.totalDiffCents)}, mas o total impresso é ${formatBRL(receipt.totals.totalCents!)} (diferença de ${formatSignedBRL(v.totalDiffCents)}). Algum item pode não ter sido lido; revise as fotos.`,
        null,
        [],
        v.totalDiffCents,
        resolutions,
      ),
    );
  }
  return out;
}

function describeIssues(r: ReceiptItem): string {
  const labels: Record<string, string> = {
    missing_quantity: 'quantidade',
    missing_unit_price: 'preço unitário',
    missing_total: 'valor total',
    math_mismatch: 'conta não fecha',
    possible_overlap: 'possível sobreposição de fotos',
    unreadable: 'descrição ilegível',
    ambiguous_discount: 'desconto ambíguo',
  };
  const missing = r.issues.filter((i) => i.startsWith('missing_')).map((i) => labels[i]);
  const other = r.issues.filter((i) => !i.startsWith('missing_')).map((i) => labels[i]);
  return [missing.length ? `faltando ${missing.join(', ')}` : '', ...other].filter(Boolean).join('; ');
}

/* ------------------------------------------------------------------ */
/* Conferência                                                          */
/* ------------------------------------------------------------------ */

export function reconcile(cart: readonly CartItem[] | null, receipt: ParsedReceipt, opts: ReconcileOptions = {}): ReconciliationReport {
  const resolutions = opts.resolutions ?? {};
  const now = opts.now ?? new Date().toISOString();
  const validation = validateReceipt(receipt);
  const scenario = cart && cart.length > 0 ? 'cart_vs_receipt' : 'receipt_only';
  const divergences: Divergence[] = [];
  const limitations: string[] = [
    'As cores indicam o nível de atenção recomendado, não a confirmação de um erro de cobrança.',
  ];
  if (!validation.complete) {
    limitations.push('A leitura do cupom está incompleta. Revise os itens sinalizados antes de tirar conclusões.');
  }

  divergences.push(...internalReceiptChecks(receipt, resolutions, scenario === 'cart_vs_receipt' ? 'cart' : 'receipt_only'));

  let matches: ItemMatch[] = [];
  const okCart: string[] = [];
  const okReceipt: string[] = [];
  const receiptById = new Map(receipt.items.map((r) => [r.id, r]));

  if (scenario === 'cart_vs_receipt' && cart) {
    matches = matchItems(cart, receipt.items, opts);
    const matchedReceipt = new Set(matches.flatMap((m) => m.receiptItemIds));
    const cartById = new Map(cart.map((c) => [c.id, c]));

    for (const m of matches) {
      const c = cartById.get(m.cartItemId)!;
      const lines = m.receiptItemIds.map((id) => receiptById.get(id)!);
      const before = divergences.length;
      compareGroup(c, lines, m, resolutions, divergences);
      const added = divergences.slice(before).filter((d) => d.severity !== 'green');
      if (added.length === 0) {
        okCart.push(c.id);
        okReceipt.push(...m.receiptItemIds);
      }
    }
    for (const c of cart) {
      if (matches.some((m) => m.cartItemId === c.id)) continue;
      divergences.push(
        div(
          'not_in_receipt',
          'yellow',
          `Não localizamos ${c.name} na nota`,
          `"${cartLabel(c)}" (${formatQuantity(c.quantityMilli, c.saleUnit)}, ${formatBRL(itemNetCents(c))}) está no carrinho, mas não foi encontrado no cupom. Antes de concluir que não foi cobrado, confira se a foto pegou todas as linhas ou associe o item manualmente.`,
          c.id,
          [],
          -itemNetCents(c),
          resolutions,
        ),
      );
    }
    for (const r of receipt.items) {
      if (matchedReceipt.has(r.id)) continue;
      const net = receiptItemNet(r);
      divergences.push(
        div(
          'not_in_cart',
          'yellow',
          'Item da nota não registrado no carrinho',
          `Encontramos "${receiptLabel(r)}"${net != null ? ` (${formatBRL(net)})` : ''} na nota, mas ele não foi registrado no carrinho. Pode ter sido esquecido durante o escaneamento, ou a descrição da nota é diferente da cadastrada. Você pode associá-lo a um item do carrinho ou adicioná-lo.`,
          null,
          [r.id],
          net,
          resolutions,
        ),
      );
    }
  } else {
    limitations.push(
      'Não há carrinho registrado para esta compra. Sem ele, não é possível afirmar que um produto foi cobrado indevidamente só porque aparece mais de uma vez na nota: a análise se limita à estrutura do cupom.',
    );
    for (const r of receipt.items) {
      if (!divergences.some((d) => d.severity !== 'green' && d.receiptItemIds.includes(r.id))) okReceipt.push(r.id);
    }
  }

  const cartTotal = scenario === 'cart_vs_receipt' && cart ? cartTotals(cart).totalCents : null;
  const receiptTotal = receipt.totals.totalCents ?? validation.itemsSumCents;
  const open = divergences.filter((d) => d.resolution === 'open' || d.resolution === 'flag_cashier');
  const overall: Severity = open.some((d) => d.severity === 'red') ? 'red' : open.some((d) => d.severity === 'yellow') ? 'yellow' : 'green';

  return {
    scenario,
    overall: !validation.complete && overall === 'green' ? 'yellow' : overall,
    complete: validation.complete,
    cartTotalCents: cartTotal,
    receiptTotalCents: receiptTotal,
    differenceCents: cartTotal != null && receiptTotal != null ? receiptTotal - cartTotal : null,
    itemsChecked: receipt.items.length,
    matches,
    okCartItemIds: okCart,
    okReceiptItemIds: okReceipt,
    divergences,
    limitations,
    generatedAt: now,
  };
}

function compareGroup(c: CartItem, lines: ReceiptItem[], m: ItemMatch, resolutions: Record<string, Resolution>, out: Divergence[]) {
  const ids = lines.map((l) => l.id);
  if (lines.some((l) => l.quantityMilli == null || l.totalCents == null)) {
    // Sem dados suficientes: a divergência de leitura já foi registrada nas checagens internas.
    return;
  }
  const rQty = lines.reduce((a, l) => a + l.quantityMilli!, 0);
  const rGross = lines.reduce((a, l) => a + l.totalCents!, 0);
  const rDiscount = lines.reduce((a, l) => a + l.discountCents, 0);
  const rNet = lines.reduce((a, l) => a + (receiptItemNet(l) ?? 0), 0);
  const rUnitPrices = lines.map((l) => l.unitPriceCents ?? Math.round((l.totalCents! * MILLI) / l.quantityMilli!));
  const rUnit = rUnitPrices[0];

  if (m.uncertain) {
    const priceInfo = Math.abs(rUnit - c.unitPriceCents) > 1 ? ` Se for o mesmo produto, o preço difere em ${formatSignedBRL(rUnit - c.unitPriceCents)} por ${isWeighed(c.saleUnit) ? (c.saleUnit === 'kg' ? 'kg' : 'litro') : 'unidade'}.` : '';
    out.push(
      div(
        'match_uncertain',
        'yellow',
        'Confirme a associação',
        `Associamos "${lines[0].description}" (nota) a "${cartLabel(c)}" (carrinho) apenas pela semelhança da descrição.${priceInfo} Confirme se são o mesmo produto.`,
        c.id,
        ids,
        null,
        resolutions,
      ),
    );
    return;
  }

  const weighed = isWeighed(c.saleUnit);
  // Quantidade
  const qtyDiff = rQty - c.quantityMilli;
  if (weighed) {
    const pct = (Math.abs(qtyDiff) * 100) / Math.max(1, c.quantityMilli);
    if (pct > WEIGHT_TOLERANCE_PERCENT) {
      const impact = lineSubtotal(rUnit, Math.abs(qtyDiff)) * Math.sign(qtyDiff);
      out.push(
        div(
          qtyDiff > 0 ? 'quantity_more' : 'quantity_less',
          'yellow',
          'Peso diferente do registrado',
          `Você registrou ${formatQuantity(c.quantityMilli, c.saleUnit)} de ${c.name}, e a nota indica ${formatQuantity(rQty, c.saleUnit)}. Em produtos pesados o valor depende da balança do caixa; confira a etiqueta de pesagem.`,
          c.id,
          ids,
          impact,
          resolutions,
        ),
      );
    }
  } else if (qtyDiff !== 0) {
    const units = Math.abs(qtyDiff) / MILLI;
    const impact = lineSubtotal(rUnit, Math.abs(qtyDiff)) * Math.sign(qtyDiff);
    if (qtyDiff > 0) {
      const repeated = lines.length > 1;
      out.push(
        div(
          repeated ? 'possible_duplicate' : 'quantity_more',
          'red',
          repeated ? 'Possível cobrança duplicada' : 'Possível divergência de quantidade',
          repeated
            ? `${c.name} aparece em ${lines.length} linhas da nota (${formatQuantity(rQty, 'un')}), mas você registrou ${formatQuantity(c.quantityMilli, 'un')}. Diferença potencial: ${formatBRL(impact)}.`
            : `Você registrou ${formatQuantity(c.quantityMilli, 'un')} de ${c.name}, mas a nota indica ${formatQuantity(rQty, 'un')}. Diferença potencial: ${formatBRL(impact)}.`,
          c.id,
          ids,
          impact,
          resolutions,
        ),
      );
    } else {
      out.push(
        div(
          'quantity_less',
          'yellow',
          'Quantidade menor na nota',
          `Você registrou ${formatQuantity(c.quantityMilli, 'un')} de ${c.name}, mas a nota indica ${formatQuantity(rQty, 'un')} (${units} a menos). Confira se algum item ficou fora da compra ou se o carrinho tem unidades a mais.`,
          c.id,
          ids,
          impact,
          resolutions,
        ),
      );
    }
  }

  // Preço: compara o líquido cobrado com o esperado para a quantidade efetivamente cobrada.
  const expectedNet = Math.max(0, lineSubtotal(c.unitPriceCents, rQty) - Math.min(c.discountCents, lineSubtotal(c.unitPriceCents, rQty)));
  const netDiff = rNet - expectedNet;
  const tolerance = weighed ? 1 : 0;
  const unitDiff = rUnit - c.unitPriceCents;
  const per = weighed ? (c.saleUnit === 'kg' ? 'kg' : 'litro') : 'unidade';
  if (netDiff > tolerance) {
    const discountMissing = Math.abs(unitDiff) <= tolerance && c.discountCents > rDiscount;
    out.push(
      div(
        'price_higher',
        'red',
        discountMissing ? 'Desconto registrado não aparece na nota' : 'Preço diferente do registrado',
        discountMissing
          ? `Você registrou um desconto de ${formatBRL(c.discountCents)} em ${c.name}, mas a nota mostra ${rDiscount ? `apenas ${formatBRL(rDiscount)}` : 'nenhum desconto'}. Verifique as condições da promoção.`
          : `Preço registrado: ${formatBRL(c.unitPriceCents)} por ${per}. Preço cobrado: ${formatBRL(rUnit)}${rDiscount ? ` (com desconto de ${formatBRL(rDiscount)} na nota)` : ''}. Diferença por ${per}: ${formatSignedBRL(unitDiff)}. Verifique se o preço da etiqueta, a promoção e as condições da oferta estavam corretos.`,
        c.id,
        ids,
        netDiff,
        resolutions,
      ),
    );
  } else if (netDiff < -tolerance) {
    // Desconto da nota explica a diferença: o preço bruto confere com o registrado.
    const grossDiff = rGross - lineSubtotal(c.unitPriceCents, rQty);
    if (rDiscount > 0 && Math.abs(grossDiff) <= tolerance) return;
    out.push(
      div(
        'price_lower',
        'yellow',
        'Cobrado menos que o registrado',
        `${c.name} foi cobrado ${formatBRL(rNet)}, abaixo dos ${formatBRL(expectedNet)} esperados pelo preço registrado (${formatSignedBRL(netDiff)}). Pode ser uma promoção aplicada no caixa ou preço registrado incorretamente.`,
        c.id,
        ids,
        netDiff,
        resolutions,
      ),
    );
  }
}

export function severityOfReport(r: ReconciliationReport): Severity {
  return r.overall;
}

export function countOpen(r: ReconciliationReport): number {
  return r.divergences.filter((d) => d.severity !== 'green' && (d.resolution === 'open' || d.resolution === 'flag_cashier')).length;
}
