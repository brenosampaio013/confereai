/**
 * Interpretação determinística do texto extraído por OCR de cupons fiscais brasileiros
 * (DANFE NFC-e, CF-e SAT e cupons de ECF). Nenhum valor é inventado: campos ilegíveis
 * ficam nulos e são sinalizados para revisão.
 */
import { Cents, parseBRL, sumCents } from './money';
import type { FieldIssue, ParsedReceipt, ReceiptItem, ReceiptTotals } from './types';
import { acceptableSubtotals, MILLI, normalizeReceiptUnit, QuantityMilli } from './units';
import { isValidCnpj } from './fiscal';

export const LOW_CONFIDENCE = 0.75;

const PRICE = String.raw`\d{1,3}(?:\.\d{3})*[.,]\d{2}|\d+[.,]\d{2}`;
const UNIT_PRICE = String.raw`\d{1,3}(?:\.\d{3})*[.,]\d{2,3}|\d+[.,]\d{2,3}`;
const QTY = String.raw`\d{1,5}(?:[.,]\d{1,4})?`;
const UNIT = String.raw`UN|UND|UNID|KG|G|GR|L|LT|ML|PC|PCT|CX|FD|BD|DZ|SC|BJ|FR|GF|LA|PT|EMB|PAR`;
// Tokens fiscais que podem aparecer entre o preço unitário e o total no layout ECF/SAT.
const TAX = String.raw`(?:\s+(?:[A-Z]?\d{1,2}[.,]\d{2}%|T\d{2}|F\d?|I\d?|N\d?|FF|II|NN|\(\s*\d+[.,]\d{2}\s*\)))*`;

/** "2 UN X 5,49 10,98", "0,875 KG x 7,99 6,99", "2UN x 5,49 T17,00% 10,98" */
const QTY_LINE_RE = new RegExp(
  String.raw`(?:^|\s)(${QTY})\s*(${UNIT})?\s*[X×*]\s*(${UNIT_PRICE})${TAX}\s+(${PRICE})\s*[A-Z]?\s*$`,
  'i',
);
/** Layout da consulta SEFAZ: "Qtde.:2 UN: UN Vl. Unit.: 5,49 Vl. Total 10,98" */
const SEFAZ_QTY_RE = new RegExp(
  String.raw`QTDE\.?\s*:?\s*(${QTY})\s*UN\.?\s*:?\s*([A-Z]{1,5})\s*VL\.?\s*UNIT\.?\s*:?\s*(${UNIT_PRICE})\s*VL\.?\s*TOTAL\s*:?\s*(${PRICE})`,
  'i',
);
/** Sem preço unitário: "1 UN 28,99" (alguns layouts resumidos). */
const QTY_NO_UNIT_PRICE_RE = new RegExp(String.raw`(?:^|\s)(${QTY})\s*(${UNIT})\s+(${PRICE})\s*$`, 'i');

const ITEM_HEADER_RE = /^(\d{1,4})\s+(?:(\d{4,14}|[A-Z]{0,3}\d{3,13})\s+)?([A-Z0-9].*)$/i;
const SEFAZ_CODE_RE = /^(.*?)\s*\(\s*C[OÓ]DIGO\s*:?\s*([A-Z0-9]+)\s*\)\s*$/i;

const STOP_ITEMS_RE =
  /(QTD\.?\s*(TOTAL\s*)?(DE\s*)?ITENS|VALOR\s+TOTAL|VALOR\s+A\s+PAGAR|SUB\s?-?TOTAL|^TOTAL\b|FORMA\s+(DE\s+)?PAGAMENTO|TOTAL\s+R\$)/i;
const NOISE_RE =
  /(CNPJ|CPF|INSCRI[CÇ][AÃ]O|I\.?E\.?:|ENDERE|DOCUMENTO\s+AUXILIAR|DANFE|NFC-?E|EXTRATO|CUPOM\s+FISCAL|^C[OÓ]D(IGO)?\.?\s+DESCRI|DESCRI[CÇ][AÃ]O\s+QT|^ITEM\s+C[OÓ]D|CONSUMIDOR|PROTOCOLO|CHAVE\s+DE\s+ACESSO|CONSULTE|TRIBUTOS|LEI\s+FEDERAL|SAT\s+N|^-{3,}|^={3,}|^\*{3,})/i;

const DISCOUNT_RE = new RegExp(
  String.raw`^(?:DESC(?:ONTO)?\.?|DESC\.?\s+S\/|RATEIO\s+DESC)(?:\s+(?:S\/\s*)?(?:ITEM|IT\.?)\s*(\d{1,4}))?[^\d-]*(-?\s?(?:${PRICE})-?)\s*$`,
  'i',
);
const SURCHARGE_RE = new RegExp(
  String.raw`^(?:ACR[EÉ]SC(?:IMO)?\.?)(?:\s+(?:S\/\s*)?(?:ITEM|IT\.?)\s*(\d{1,4}))?[^\d]*\+?\s?(${PRICE})\s*$`,
  'i',
);
const CANCEL_RE = /CANCELAD[OA]|CANCELAMENTO/i;

let idCounter = 0;
function tmpId(part: number) {
  idCounter += 1;
  return `r${part}-${idCounter}`;
}

function cleanLine(line: string): string {
  return line
    .replace(/\t/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quantidade "2", "2,000", "0,875" → milésimos. */
export function parseQuantityToken(token: string): QuantityMilli | null {
  const m = /^(\d+)(?:[.,](\d{1,4}))?$/.exec(token.trim());
  if (!m) return null;
  const frac = (m[2] ?? '').padEnd(3, '0');
  // Quatro casas: arredonda a 3 (raro; ex.: 0,8755)
  const milli = Number(m[1]) * MILLI + Number(frac.slice(0, 3)) + (frac.length > 3 && Number(frac[3]) >= 5 ? 1 : 0);
  return milli > 0 ? milli : null;
}

/** Preço unitário com 2 ou 3 casas ("7,99" ou "7,990"). */
export function parseUnitPriceToken(token: string): { cents: Cents; exact: boolean } | null {
  const t = token.trim();
  const m3 = /^(\d{1,3}(?:\.\d{3})*|\d+)[.,](\d{3})$/.exec(t);
  if (m3) {
    const intPart = Number(m3[1].replace(/\./g, ''));
    const milli = Number(m3[2]);
    const cents = intPart * 100 + Math.floor(milli / 10);
    const rem = milli % 10;
    return { cents: cents + (rem >= 5 ? 1 : 0), exact: rem === 0 };
  }
  const c = parseBRL(t);
  return c == null ? null : { cents: c, exact: true };
}

interface Header {
  seq: number | null;
  code: string | null;
  description: string;
  raw: string[];
}

function parseHeader(text: string): Header {
  const raw = [text];
  const sefaz = SEFAZ_CODE_RE.exec(text);
  if (sefaz) return { seq: null, code: sefaz[2], description: sefaz[1].trim(), raw };
  const m = ITEM_HEADER_RE.exec(text);
  if (m && /[A-Z]{2,}/i.test(m[3])) {
    return { seq: Number(m[1]), code: m[2] ?? null, description: m[3].trim(), raw };
  }
  return { seq: null, code: null, description: text.trim(), raw };
}

function looksLikeItemHeader(line: string): boolean {
  if (SEFAZ_CODE_RE.test(line)) return true;
  const m = ITEM_HEADER_RE.exec(line);
  return !!m && /[A-Z]{3,}/i.test(m[3]) && !NOISE_RE.test(line);
}

function buildItem(
  part: number,
  header: Header | null,
  qtyToken: string | null,
  unitToken: string | null,
  unitPriceToken: string | null,
  totalToken: string | null,
  rawLines: string[],
): ReceiptItem {
  const issues: FieldIssue[] = [];
  const quantityMilli = qtyToken ? parseQuantityToken(qtyToken) : null;
  const up = unitPriceToken ? parseUnitPriceToken(unitPriceToken) : null;
  const totalCents = totalToken ? parseBRL(totalToken) : null;
  const unit = normalizeReceiptUnit(unitToken);
  let confidence = 1;

  if (!header || !header.description || !/[A-Z]{2,}/i.test(header.description)) {
    issues.push('unreadable');
    confidence = Math.min(confidence, 0.4);
  }
  if (quantityMilli == null) {
    issues.push('missing_quantity');
    confidence = Math.min(confidence, 0.5);
  }
  if (up == null) {
    issues.push('missing_unit_price');
    confidence = Math.min(confidence, 0.6);
  } else if (!up.exact) {
    confidence = Math.min(confidence, 0.8);
  }
  if (totalCents == null) {
    issues.push('missing_total');
    confidence = Math.min(confidence, 0.5);
  }
  if (quantityMilli != null && up && totalCents != null) {
    // Unidade "G" impressa com quantidade em gramas e preço por kg
    let q = quantityMilli;
    if (unitToken && /^(G|GR)$/i.test(unitToken)) q = Math.round(quantityMilli / MILLI);
    const ok = acceptableSubtotals(up.cents, q);
    const diff = Math.min(...ok.map((v) => Math.abs(v - totalCents)));
    if (diff === 0) {
      // ok
    } else if (diff <= 1) {
      confidence = Math.min(confidence, 0.85);
    } else {
      issues.push('math_mismatch');
      confidence = Math.min(confidence, 0.5);
    }
  }
  let qty = quantityMilli;
  if (qty != null && unitToken && /^(G|GR)$/i.test(unitToken)) qty = Math.round(qty / MILLI);
  if (qty != null && unit === 'l' && unitToken && /^ML$/i.test(unitToken)) qty = Math.round(qty / MILLI);

  return {
    id: tmpId(part),
    seq: header?.seq ?? null,
    code: header?.code ?? null,
    description: header?.description || '(descrição ilegível)',
    quantityMilli: qty,
    unit,
    rawUnit: unitToken ? unitToken.toUpperCase() : null,
    unitPriceCents: up?.cents ?? null,
    totalCents,
    discountCents: 0,
    surchargeCents: 0,
    confidence,
    issues,
    sourcePart: part,
    rawLines,
    userEdited: false,
  };
}

interface PartResult {
  items: ReceiptItem[];
  unassignedDiscountCents: Cents;
  unparsed: string[];
  warnings: string[];
  cancelledSeqs: number[];
}

function amountFromToken(tok: string): Cents | null {
  const c = parseBRL(tok.replace(/\s/g, ''));
  return c == null ? null : Math.abs(c);
}

export function parsePart(lines: readonly string[], part: number): PartResult {
  const items: ReceiptItem[] = [];
  const unparsed: string[] = [];
  const warnings: string[] = [];
  const cancelledSeqs: number[] = [];
  let unassignedDiscount = 0;
  let pending: Header | null = null;
  let stopped = false;

  const flushPendingAsIncomplete = () => {
    if (pending) {
      if (pending.seq != null || pending.code != null) {
        const item = buildItem(part, pending, null, null, null, null, pending.raw);
        items.push(item);
      } else {
        unparsed.push(...pending.raw);
      }
      pending = null;
    }
  };

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    if (stopped) continue;

    if (STOP_ITEMS_RE.test(line) && !QTY_LINE_RE.test(line)) {
      flushPendingAsIncomplete();
      stopped = true;
      continue;
    }

    if (CANCEL_RE.test(line)) {
      const seq = /ITEM\s*(\d{1,4})/i.exec(line)?.[1] ?? /^(\d{1,4})\s/.exec(line)?.[1];
      if (seq) {
        cancelledSeqs.push(Number(seq));
        warnings.push(`O cupom indica o cancelamento do item ${seq.padStart(3, '0')}; ele foi desconsiderado. Confira na nota.`);
      } else {
        warnings.push(`Linha de cancelamento sem item identificável: "${line}". Revise manualmente.`);
        unparsed.push(line);
      }
      continue;
    }

    const disc = DISCOUNT_RE.exec(line);
    if (disc) {
      const amount = amountFromToken(disc[2]);
      if (amount != null) {
        const targetSeq = disc[1] ? Number(disc[1]) : null;
        const target =
          targetSeq != null ? items.find((i) => i.seq === targetSeq) : pending ? null : items[items.length - 1];
        if (target) {
          target.discountCents += amount;
          target.rawLines.push(line);
        } else {
          unassignedDiscount += amount;
          warnings.push(`Desconto de ${disc[2].trim()} sem item associado. Verifique a que produto ele se refere.`);
        }
        continue;
      }
    }
    const sur = SURCHARGE_RE.exec(line);
    if (sur) {
      const amount = amountFromToken(sur[2]);
      const targetSeq = sur[1] ? Number(sur[1]) : null;
      const target = targetSeq != null ? items.find((i) => i.seq === targetSeq) : items[items.length - 1];
      if (amount != null && target) {
        target.surchargeCents += amount;
        target.rawLines.push(line);
        continue;
      }
    }

    const sefaz = SEFAZ_QTY_RE.exec(line);
    const qm = sefaz ?? QTY_LINE_RE.exec(line);
    if (qm) {
      const before = sefaz ? line.slice(0, sefaz.index).trim() : line.slice(0, qm.index).trim();
      let header: Header | null;
      const raw: string[] = [];
      if (before && /[A-Z]{2,}/i.test(before)) {
        flushPendingAsIncomplete();
        header = parseHeader(before);
        raw.push(line);
      } else if (pending) {
        header = pending;
        raw.push(...pending.raw, line);
        pending = null;
      } else {
        header = null;
        raw.push(line);
      }
      items.push(buildItem(part, header, qm[1], qm[2] ?? null, qm[3], qm[4], raw));
      continue;
    }

    const qnu = QTY_NO_UNIT_PRICE_RE.exec(line);
    if (qnu && (pending || /[A-Z]{3,}/i.test(line.slice(0, qnu.index)))) {
      const before = line.slice(0, qnu.index).trim();
      let header: Header | null = null;
      const raw: string[] = [];
      if (before && /[A-Z]{2,}/i.test(before)) {
        flushPendingAsIncomplete();
        header = parseHeader(before);
        raw.push(line);
      } else if (pending) {
        header = pending;
        raw.push(...pending.raw, line);
        pending = null;
      }
      items.push(buildItem(part, header, qnu[1], qnu[2], null, qnu[3], raw));
      continue;
    }

    if (NOISE_RE.test(line)) continue;

    if (looksLikeItemHeader(line)) {
      flushPendingAsIncomplete();
      pending = parseHeader(line);
      continue;
    }

    if (pending && /^[A-Z][A-Z0-9 .,/%-]*$/i.test(line) && !new RegExp(PRICE).test(line)) {
      // Descrição quebrada em duas linhas
      pending.description = `${pending.description} ${line}`.trim();
      pending.raw.push(line);
      continue;
    }

    if (new RegExp(PRICE).test(line) && items.length > 0) unparsed.push(line);
  }
  flushPendingAsIncomplete();

  return { items, unassignedDiscountCents: unassignedDiscount, unparsed, warnings, cancelledSeqs };
}

function signature(i: ReceiptItem): string {
  return [normalizeDesc(i.description), i.totalCents ?? '?', i.quantityMilli ?? '?'].join('|');
}

function normalizeDesc(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Combina itens de várias fotos do mesmo cupom, removendo apenas as repetições
 * causadas por sobreposição quando há evidência clara (mesmo número de item e mesmo
 * conteúdo, ou uma sequência de 2+ linhas idênticas na emenda). Em caso de dúvida,
 * mantém as linhas e marca para revisão.
 */
export function mergeParts(parts: ReceiptItem[][]): { items: ReceiptItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const merged: ReceiptItem[] = [];
  parts.forEach((current, idx) => {
    if (idx === 0) {
      merged.push(...current);
      return;
    }
    const previous = parts[idx - 1];
    let toKeep = [...current];

    // 1) Itens com número sequencial
    const prevBySeq = new Map(previous.filter((i) => i.seq != null).map((i) => [i.seq!, i]));
    toKeep = toKeep.filter((item) => {
      if (item.seq == null) return true;
      const twin = prevBySeq.get(item.seq);
      if (!twin) return true;
      if (signature(twin) === signature(item)) {
        warnings.push(`Item ${String(item.seq).padStart(3, '0')} aparece nas fotos ${idx} e ${idx + 1} (sobreposição) e foi considerado uma única vez.`);
        return false;
      }
      twin.issues.push('possible_overlap');
      item.issues.push('possible_overlap');
      twin.confidence = Math.min(twin.confidence, 0.6);
      item.confidence = Math.min(item.confidence, 0.6);
      warnings.push(`Item ${String(item.seq).padStart(3, '0')} aparece em duas fotos com conteúdos diferentes. Revise.`);
      return true;
    });

    // 2) Itens sem número: procura a maior emenda (sufixo da foto anterior = prefixo da atual)
    const prevNoSeq = previous.filter((i) => i.seq == null);
    const curNoSeq = toKeep.filter((i) => i.seq == null);
    let k = Math.min(prevNoSeq.length, curNoSeq.length);
    for (; k > 0; k--) {
      const suffix = prevNoSeq.slice(prevNoSeq.length - k).map(signature);
      const prefix = curNoSeq.slice(0, k).map(signature);
      if (suffix.every((s, i) => s === prefix[i])) break;
    }
    if (k >= 2) {
      const drop = new Set(curNoSeq.slice(0, k).map((i) => i.id));
      toKeep = toKeep.filter((i) => !drop.has(i.id));
      warnings.push(`${k} linhas repetidas na emenda entre as fotos ${idx} e ${idx + 1} foram consideradas uma única vez.`);
    } else if (k === 1) {
      const a = prevNoSeq[prevNoSeq.length - 1];
      const b = curNoSeq[0];
      a.issues.push('possible_overlap');
      b.issues.push('possible_overlap');
      a.confidence = Math.min(a.confidence, 0.6);
      b.confidence = Math.min(b.confidence, 0.6);
      warnings.push(`"${b.description}" aparece no fim da foto ${idx} e no início da foto ${idx + 1}. Pode ser sobreposição ou duas unidades: revise.`);
    }
    merged.push(...toKeep);
  });
  return { items: merged, warnings };
}

function findAmountAfter(lines: string[], re: RegExp): Cents | null {
  for (const l of lines) {
    if (!re.test(l)) continue;
    const prices = l.match(new RegExp(PRICE, 'g'));
    if (prices && prices.length) {
      const c = parseBRL(prices[prices.length - 1]);
      if (c != null) return Math.abs(c);
    }
  }
  return null;
}

export function parseTotals(lines: string[]): ReceiptTotals {
  const clean = lines.map(cleanLine);
  let itemCount: number | null = null;
  for (const l of clean) {
    const m = /QTD\.?\s*(?:TOTAL\s*)?(?:DE\s*)?ITENS\s*:?\s*(\d{1,4})\b/i.exec(l);
    if (m) {
      itemCount = Number(m[1]);
      break;
    }
  }
  const valorTotal = findAmountAfter(clean, /^VALOR\s+TOTAL(\s+R\$)?\b/i);
  const subtotal = findAmountAfter(clean, /^SUB\s?-?TOTAL/i);
  const discount = findAmountAfter(clean, /^(DESCONTOS?|TOTAL\s+DE\s+DESCONTOS?)\s*(R\$)?\s*[\d-]/i);
  const surcharge = findAmountAfter(clean, /^(ACR[EÉ]SCIMOS?|OUTRAS\s+DESPESAS|FRETE)/i);
  const aPagar = findAmountAfter(clean, /^VALOR\s+A\s+PAGAR/i);
  const totalGeneric = findAmountAfter(clean, /^TOTAL\s*(R\$)?\s*\d/i);

  const sub = valorTotal ?? subtotal;
  let total = aPagar ?? totalGeneric;
  if (total == null && sub != null && (discount != null || surcharge != null)) {
    total = sub - (discount ?? 0) + (surcharge ?? 0);
  } else if (total == null && sub != null && valorTotal != null && discount == null && surcharge == null) {
    total = sub;
  }
  return {
    itemCount,
    subtotalCents: sub,
    discountCents: discount,
    surchargeCents: surcharge,
    totalCents: total,
  };
}

function parseHeaderInfo(lines: string[]) {
  const clean = lines.map(cleanLine).filter(Boolean);
  let cnpj: string | null = null;
  let cnpjIdx = -1;
  for (let i = 0; i < clean.length; i++) {
    if (/CONSUMIDOR/i.test(clean[i])) continue;
    const m = /CNPJ\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}\s*\/?\s*\d{4}\s*-?\s*\d{2})/i.exec(clean[i]);
    if (m) {
      const digits = m[1].replace(/\D/g, '');
      cnpj = digits;
      cnpjIdx = i;
      break;
    }
  }
  let storeName: string | null = null;
  const limit = cnpjIdx >= 0 ? cnpjIdx + 1 : Math.min(4, clean.length);
  for (let i = 0; i < limit; i++) {
    const l = clean[i];
    const withoutCnpj = l.replace(/CNPJ.*$/i, '').trim();
    if (withoutCnpj.length >= 3 && /[A-Z]{3,}/i.test(withoutCnpj) && !/(DOCUMENTO|DANFE|NFC|CUPOM|EXTRATO|SAT)/i.test(withoutCnpj)) {
      storeName = withoutCnpj;
      break;
    }
  }
  let issuedAt: string | null = null;
  const dateLines = [...clean.filter((l) => /EMISS/i.test(l)), ...clean];
  for (const l of dateLines) {
    const m = /(\d{2})\/(\d{2})\/(\d{4})[\sT-]*(\d{2}):(\d{2})(?::(\d{2}))?/.exec(l);
    if (m) {
      const [, d, mo, y, h, mi, s = '00'] = m;
      if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
        issuedAt = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
        break;
      }
    }
  }
  let accessKey: string | null = null;
  for (let i = 0; i < clean.length; i++) {
    const joined = (clean[i] + ' ' + (clean[i + 1] ?? '')).replace(/\D/g, '');
    const single = clean[i].replace(/\D/g, '');
    if (single.length === 44) {
      accessKey = single;
      break;
    }
    if (/CHAVE/i.test(clean[i]) && joined.length >= 44) {
      const m = /\d{44}/.exec(joined);
      if (m) {
        accessKey = m[0];
        break;
      }
    }
  }
  return { storeName, cnpj: cnpj && isValidCnpj(cnpj) ? cnpj : cnpj, cnpjValid: cnpj ? isValidCnpj(cnpj) : null, issuedAt, accessKey };
}

/**
 * Interpreta o texto de uma ou mais fotos do mesmo cupom.
 * @param parts linhas de texto de cada foto, na ordem em que o cupom foi fotografado.
 */
export function parseReceipt(parts: string[][]): ParsedReceipt {
  idCounter = 0;
  const partResults = parts.map((lines, idx) => parsePart(lines, idx));
  const { items: mergedItems, warnings: mergeWarnings } = mergeParts(partResults.map((p) => p.items));
  const cancelled = new Set(partResults.flatMap((p) => p.cancelledSeqs));
  const items = mergedItems.filter((i) => i.seq == null || !cancelled.has(i.seq));
  const allLines = parts.flat();
  const header = parseHeaderInfo(parts[0] ?? []);
  const totals = parseTotals(allLines);
  const warnings = [...partResults.flatMap((p) => p.warnings), ...mergeWarnings];
  if (header.cnpj && header.cnpjValid === false) warnings.push('O CNPJ lido não é válido; pode haver erro de leitura.');

  return {
    storeName: header.storeName,
    cnpj: header.cnpj,
    issuedAt: header.issuedAt,
    accessKey: header.accessKey,
    items,
    unassignedDiscountCents: partResults.reduce((a, p) => a + p.unassignedDiscountCents, 0),
    totals,
    unparsedLines: partResults.flatMap((p) => p.unparsed),
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Validação do cupom                                                  */
/* ------------------------------------------------------------------ */

export function receiptItemNet(i: ReceiptItem): Cents | null {
  if (i.totalCents == null) return null;
  return i.totalCents - i.discountCents + i.surchargeCents;
}

export interface ReceiptValidation {
  complete: boolean;
  problems: string[];
  itemsSumCents: Cents | null;
  /** Soma dos itens − descontos + acréscimos comparada ao total impresso. */
  totalDiffCents: Cents | null;
  lowConfidenceItemIds: string[];
}

export function itemNeedsReview(i: ReceiptItem): boolean {
  if (i.userEdited) return i.quantityMilli == null || i.totalCents == null;
  return i.confidence < LOW_CONFIDENCE || i.issues.length > 0;
}

export function validateReceipt(r: ParsedReceipt): ReceiptValidation {
  const problems: string[] = [];
  if (r.items.length === 0) problems.push('Nenhum produto foi identificado no cupom.');
  const lowConfidenceItemIds = r.items.filter(itemNeedsReview).map((i) => i.id);
  if (lowConfidenceItemIds.length) {
    problems.push(`${lowConfidenceItemIds.length} ${lowConfidenceItemIds.length === 1 ? 'item precisa' : 'itens precisam'} de revisão manual.`);
  }
  const nets = r.items.map(receiptItemNet);
  const itemsSum = nets.every((n): n is number => n != null) ? sumCents(nets) : null;
  let totalDiff: Cents | null = null;
  if (r.totals.totalCents == null) {
    problems.push('O valor total da nota não foi identificado.');
  } else if (itemsSum != null) {
    // Desconto geral impresso nos totais, quando maior que os descontos já atribuídos aos itens
    const itemDiscounts = r.items.reduce((a, i) => a + i.discountCents, 0);
    const itemSurcharges = r.items.reduce((a, i) => a + i.surchargeCents, 0);
    const generalDiscount = Math.max(r.unassignedDiscountCents, (r.totals.discountCents ?? 0) - itemDiscounts);
    const generalSurcharge = Math.max(0, (r.totals.surchargeCents ?? 0) - itemSurcharges);
    const expected = itemsSum - generalDiscount + generalSurcharge;
    totalDiff = r.totals.totalCents - expected;
    if (totalDiff !== 0) {
      problems.push('A soma dos itens lidos não corresponde ao total da nota. Algum item pode não ter sido lido corretamente.');
    }
  }
  if (r.totals.itemCount != null && r.items.length > 0 && r.totals.itemCount !== r.items.length) {
    problems.push(`A nota informa ${r.totals.itemCount} itens, mas ${r.items.length} foram identificados.`);
  }
  return {
    complete: problems.length === 0,
    problems,
    itemsSumCents: itemsSum,
    totalDiffCents: totalDiff,
    lowConfidenceItemIds,
  };
}
