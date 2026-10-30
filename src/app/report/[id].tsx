import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ComponentProps, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { itemNetCents } from '@/domain/cart';
import { formatBRL } from '@/domain/money';
import { receiptItemNet } from '@/domain/receiptParser';
import { GROUP_LABEL, GROUP_ORDER } from '@/domain/reconciliation';
import type { CartItem, Divergence, ReceiptItem, Resolution } from '@/domain/types';
import { formatQuantity, isWeighed, MILLI } from '@/domain/units';
import { fmtDateTime } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { runConference } from '@/services/conference';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Card, Divider, Loading, Money, Pill, Row, Screen, SEVERITY_ICON, SectionTitle, Sheet, T } from '@/ui/components';
import { colors, space, tone } from '@/ui/theme';

const OVERALL_TEXT = {
  green: { title: 'Nenhuma divergência identificada', text: 'Nos dados analisados, a nota confere. Isso não garante a ausência de erros fora do que foi lido.' },
  yellow: { title: 'Há pontos para revisar', text: 'Encontramos diferenças ou leituras que precisam da sua confirmação.' },
  red: { title: 'Há divergências que merecem atenção', text: 'Algumas diferenças podem significar cobrança indevida. Confira antes de sair do caixa.' },
} as const;

const RESOLUTION_LABEL: Record<Resolution, string> = {
  open: 'Pendente',
  confirmed_ok: 'Confirmado por você',
  flag_cashier: 'Verificar no caixa',
  dismissed: 'Ignorado',
};

async function loadAll(repo: ReturnType<typeof useApp>['repo'], id: string) {
  const report = await repo.getReport(id);
  if (!report) return null;
  const receipt = await repo.getReceipt(report.receiptId);
  const purchase = await repo.getPurchase(report.purchaseId);
  const cart = purchase?.mode === 'cart' ? await repo.listCartItems(report.purchaseId) : [];
  return { report, receipt, purchase, cart };
}

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, bump, version } = useApp();
  const { data, reload } = useLoad(() => loadAll(repo, id), [id, version]);
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ d: Divergence; kind: 'cart' | 'receipt' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOk, setShowOk] = useState(false);

  if (data === undefined) return <Loading />;
  if (data === null || !data.receipt) return <Screen><Banner t="yellow" title="Relatório não encontrado" /></Screen>;

  const { report, receipt, purchase, cart } = data;
  const cartById = new Map(cart.map((c) => [c.id, c]));
  const recById = new Map(receipt.parsed.items.map((r) => [r.id, r]));
  const pending = report.divergences.filter((d) => d.severity !== 'green' && (d.resolution === 'open' || d.resolution === 'flag_cashier'));

  const rerun = async () => {
    setBusy(true);
    try {
      await runConference(repo, report.receiptId);
      bump();
      reload();
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (d: Divergence & { id?: string }, r: Resolution) => {
    if (!('id' in d) || !d.id) return;
    await repo.setResolution(d.id, r);
    bump();
    reload();
  };

  const finish = async () => {
    await repo.updatePurchase(report.purchaseId, { status: 'closed' });
    bump();
    router.dismissTo(`/purchase/${report.purchaseId}`);
  };

  return (
    <Screen
      footer={
        <Row>
          <Button title="Reconferir" icon="refresh" kind="secondary" onPress={rerun} loading={busy} style={{ flex: 1 }} />
          <Button title="Concluir" icon="checkmark-done" kind="confirm" onPress={finish} style={{ flex: 1 }} />
        </Row>
      }
    >
      <View style={[styles.hero, { backgroundColor: tone[report.overall].bg }]}>
        <Row>
          <Ionicons name={SEVERITY_ICON[report.overall]} size={30} color={tone[report.overall].solid} />
          <View style={{ flex: 1 }}>
            <T v="heading" color={tone[report.overall].fg}>{OVERALL_TEXT[report.overall].title}</T>
            <T v="small" color={tone[report.overall].fg}>{OVERALL_TEXT[report.overall].text}</T>
          </View>
        </Row>
        {!report.complete ? <Pill label="Conferência incompleta: a leitura do cupom tem pendências" t="yellow" icon="alert-circle" /> : null}
      </View>

      <Card>
        {report.scenario === 'cart_vs_receipt' ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <T color={colors.textMuted}>Total registrado</T>
              <Money cents={report.cartTotalCents} />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <T color={colors.textMuted}>Total da nota</T>
              <Money cents={report.receiptTotalCents} />
            </Row>
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="bodyStrong">Diferença calculada</T>
              <Money cents={report.differenceCents} signed color={report.differenceCents && report.differenceCents > 0 ? colors.redText : colors.text} />
            </Row>
            <T v="small" color={colors.textMuted}>Diferença = total da nota − total registrado. Valor positivo indica que a nota está acima do que você registrou.</T>
          </>
        ) : (
          <Row style={{ justifyContent: 'space-between' }}>
            <T color={colors.textMuted}>Total da nota</T>
            <Money cents={report.receiptTotalCents} />
          </Row>
        )}
        <Row style={{ gap: space.lg }}>
          <Stat label="Itens conferidos" value={String(report.itemsChecked)} />
          <Stat label="Para revisar" value={String(pending.length)} color={pending.length ? colors.yellowText : colors.greenText} />
        </Row>
        <T v="small" color={colors.textFaint}>Gerado em {fmtDateTime(report.generatedAt)}</T>
      </Card>

      {report.limitations.map((l) => (
        <Banner key={l} t="navy" icon="information-circle-outline">{l}</Banner>
      ))}

      {GROUP_ORDER.map((g) => {
        const items = report.divergences.filter((d) => d.group === g);
        if (!items.length) return null;
        return (
          <View key={g} style={{ gap: space.sm }}>
            <SectionTitle>{`${GROUP_LABEL[g]} (${items.length})`}</SectionTitle>
            {items.map((d) => (
              <DivergenceCard
                key={d.id}
                d={d}
                expanded={open === d.id}
                onToggle={() => setOpen(open === d.id ? null : d.id)}
                cart={d.cartItemId ? cartById.get(d.cartItemId) ?? null : null}
                lines={d.receiptItemIds.map((rid) => recById.get(rid)).filter((x): x is ReceiptItem => !!x)}
                actions={actionsFor(d, {
                  repo,
                  cart,
                  cartById,
                  recById,
                  purchaseMode: purchase?.mode ?? 'receipt_only',
                  receiptId: report.receiptId,
                  rerun,
                  resolve,
                  openPicker: (kind) => setPicker({ d, kind }),
                })}
              />
            ))}
          </View>
        );
      })}

      <SectionTitle>{`${GROUP_LABEL.ok} (${report.scenario === 'cart_vs_receipt' ? report.okCartItemIds.length : report.okReceiptItemIds.length})`}</SectionTitle>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="small" color={colors.textMuted}>Itens em que quantidade e preço conferem.</T>
          <Button title={showOk ? 'Ocultar' : 'Mostrar'} kind="ghost" compact onPress={() => setShowOk(!showOk)} />
        </Row>
        {showOk
          ? (report.scenario === 'cart_vs_receipt'
              ? report.okCartItemIds.map((cid) => cartById.get(cid)).filter((c): c is CartItem => !!c).map((c) => ({ key: c.id, name: c.name, q: formatQuantity(c.quantityMilli, c.saleUnit), v: itemNetCents(c) }))
              : report.okReceiptItemIds.map((rid) => recById.get(rid)).filter((r): r is ReceiptItem => !!r).map((r) => ({ key: r.id, name: r.description, q: r.quantityMilli != null ? formatQuantity(r.quantityMilli, r.unit) : '?', v: receiptItemNet(r) }))
            ).map((x) => (
              <Row key={x.key} style={{ justifyContent: 'space-between' }}>
                <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                <T v="small" style={{ flex: 1 }} numberOfLines={1}>{x.name} · {x.q}</T>
                <Money cents={x.v} v="small" />
              </Row>
            ))
          : null}
      </Card>

      <Button title="Revisar leitura do cupom" icon="document-text-outline" kind="secondary" onPress={() => router.push(`/receipt/${report.receiptId}`)} />

      <Sheet visible={!!picker} onClose={() => setPicker(null)} title={picker?.kind === 'cart' ? 'Associar a um item do carrinho' : 'Associar a uma linha da nota'}>
        {picker?.kind === 'cart'
          ? cart.map((c) => (
              <Card key={c.id} onPress={async () => {
                for (const rid of picker.d.receiptItemIds) await repo.setManualMatch(rid, c.id);
                setPicker(null);
                await rerun();
              }}>
                <T v="bodyStrong">{c.name}</T>
                <T v="small" color={colors.textMuted}>{formatQuantity(c.quantityMilli, c.saleUnit)} × {formatBRL(c.unitPriceCents)}</T>
              </Card>
            ))
          : null}
        {picker?.kind === 'receipt'
          ? receipt.parsed.items.map((r) => (
              <Card key={r.id} onPress={async () => {
                await repo.setManualMatch(r.id, picker.d.cartItemId!);
                setPicker(null);
                await rerun();
              }}>
                <T v="bodyStrong">{r.description}</T>
                <T v="small" color={colors.textMuted}>{r.quantityMilli != null ? formatQuantity(r.quantityMilli, r.unit) : '?'} · {formatBRL(receiptItemNet(r) ?? 0)}</T>
              </Card>
            ))
          : null}
      </Sheet>
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T v="title" color={color}>{value}</T>
      <T v="small" color={colors.textMuted}>{label}</T>
    </View>
  );
}

interface ActionCtx {
  repo: ReturnType<typeof useApp>['repo'];
  cart: CartItem[];
  cartById: Map<string, CartItem>;
  recById: Map<string, ReceiptItem>;
  purchaseMode: 'cart' | 'receipt_only';
  receiptId: string;
  rerun: () => Promise<void>;
  resolve: (d: Divergence, r: Resolution) => Promise<void>;
  openPicker: (kind: 'cart' | 'receipt') => void;
}

type Action = { title: string; icon?: ComponentProps<typeof Button>['icon']; kind?: ComponentProps<typeof Button>['kind']; run: () => void | Promise<void> };

function actionsFor(d: Divergence, ctx: ActionCtx): Action[] {
  const lines = d.receiptItemIds.map((id) => ctx.recById.get(id)).filter((x): x is ReceiptItem => !!x);
  const c = d.cartItemId ? ctx.cartById.get(d.cartItemId) : undefined;
  const flag: Action = { title: 'Marcar para verificar no caixa', icon: 'flag-outline', kind: 'secondary', run: () => ctx.resolve(d, 'flag_cashier') };
  const ok: Action = { title: 'Está correto', icon: 'checkmark', kind: 'secondary', run: () => ctx.resolve(d, 'confirmed_ok') };
  const reviewReceipt: Action = { title: 'Revisar leitura', icon: 'document-text-outline', kind: 'secondary', run: () => router.push(`/receipt/${ctx.receiptId}`) };
  const dismiss: Action = { title: 'Ignorar', kind: 'ghost', run: () => ctx.resolve(d, 'dismissed') };

  switch (d.kind) {
    case 'quantity_more':
    case 'quantity_less':
    case 'possible_duplicate': {
      if (!c) return [ok, flag, reviewReceipt];
      const rq = lines.reduce((a, l) => a + (l.quantityMilli ?? 0), 0);
      const qtyText = formatQuantity(rq, c.saleUnit);
      return [
        {
          title: `Confirmar que comprei ${qtyText}`,
          icon: 'checkmark-circle-outline',
          kind: 'confirm',
          run: async () => {
            await ctx.repo.updateCartItem(c.id, { quantityMilli: rq });
            await ctx.rerun();
          },
        },
        { title: 'Revisar quantidade', icon: 'create-outline', kind: 'secondary', run: () => router.push(`/item/${c.id}`) },
        flag,
      ];
    }
    case 'price_higher':
    case 'price_lower':
      return [
        ...(c ? [{ title: 'Corrigir preço registrado', icon: 'create-outline', kind: 'secondary', run: () => router.push(`/item/${c.id}`) } as Action] : []),
        flag,
        ok,
      ];
    case 'not_in_cart': {
      const out: Action[] = [];
      if (ctx.purchaseMode === 'cart' && ctx.cart.length) out.push({ title: 'Associar a item do carrinho', icon: 'link-outline', kind: 'secondary', run: () => ctx.openPicker('cart') });
      if (ctx.purchaseMode === 'cart' && lines[0] && lines[0].quantityMilli != null && lines[0].totalCents != null) {
        const l = lines[0];
        out.push({
          title: 'Adicionar ao carrinho',
          icon: 'add-circle-outline',
          kind: 'secondary',
          run: async () => {
            const purchaseId = ctx.cart[0]?.purchaseId;
            if (!purchaseId) return;
            const unitPrice = l.unitPriceCents ?? Math.round((l.totalCents! * MILLI) / l.quantityMilli!);
            const item = await ctx.repo.addCartItem({
              purchaseId,
              productId: null,
              barcode: l.code && /^\d{8,14}$/.test(l.code) ? l.code : null,
              name: l.description,
              brand: null,
              packageLabel: null,
              saleUnit: l.unit,
              quantityMilli: l.quantityMilli!,
              unitPriceCents: unitPrice,
              discountCents: l.discountCents,
              priceSource: 'receipt',
              addedVia: 'manual',
            });
            await ctx.repo.setManualMatch(l.id, item.id);
            await ctx.rerun();
          },
        });
      }
      out.push(flag, dismiss);
      return out;
    }
    case 'not_in_receipt':
      return [
        { title: 'Associar a uma linha da nota', icon: 'link-outline', kind: 'secondary', run: () => ctx.openPicker('receipt') },
        reviewReceipt,
        flag,
        ok,
      ];
    case 'match_uncertain':
      return [
        {
          title: 'São o mesmo produto',
          icon: 'checkmark-circle-outline',
          kind: 'confirm',
          run: async () => {
            for (const id of d.receiptItemIds) await ctx.repo.setManualMatch(id, d.cartItemId!);
            await ctx.rerun();
          },
        },
        {
          title: 'Não são o mesmo produto',
          icon: 'close-circle-outline',
          kind: 'secondary',
          run: async () => {
            for (const id of d.receiptItemIds) await ctx.repo.setManualMatch(id, 'none');
            await ctx.rerun();
          },
        },
      ];
    case 'discount':
      return d.severity === 'green' ? [] : [ok, flag];
    default:
      return [reviewReceipt, ok, dismiss];
  }
}

function DivergenceCard({ d, expanded, onToggle, cart, lines, actions }: { d: Divergence & { id: string }; expanded: boolean; onToggle: () => void; cart: CartItem | null; lines: ReceiptItem[]; actions: Action[] }) {
  const resolved = d.resolution === 'confirmed_ok' || d.resolution === 'dismissed';
  const t = d.severity;
  return (
    <Card style={[{ borderLeftWidth: 4, borderLeftColor: tone[t].solid }, resolved && { opacity: 0.7 }]}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }} style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <T v="bodyStrong" style={{ flex: 1 }}>{d.title}</T>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textFaint} />
        </Row>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          <Pill label={t === 'red' ? 'Atenção' : t === 'yellow' ? 'Revisar' : 'Informativo'} t={t} icon={SEVERITY_ICON[t]} />
          {d.resolution !== 'open' ? <Pill label={RESOLUTION_LABEL[d.resolution]} t={d.resolution === 'flag_cashier' ? 'yellow' : 'neutral'} /> : null}
          {d.potentialDiffCents ? <Pill label={`Diferença potencial ${formatBRL(Math.abs(d.potentialDiffCents))}${d.potentialDiffCents < 0 ? ' a menos' : ''}`} t="neutral" /> : null}
        </Row>
        <T v="small" color={colors.textMuted}>{d.explanation}</T>
      </Pressable>
      {expanded ? (
        <View style={{ gap: space.md }}>
          {cart || lines.length ? (
            <View style={styles.compare}>
              <View style={styles.col}>
                <T v="caption" color={colors.textMuted}>CARRINHO</T>
                {cart ? (
                  <>
                    <T v="small" style={{ fontWeight: '600' }}>{cart.name}</T>
                    <T v="small">{formatQuantity(cart.quantityMilli, cart.saleUnit)}</T>
                    <T v="small">{formatBRL(cart.unitPriceCents)}{isWeighed(cart.saleUnit) ? '/kg·L' : ' cada'}</T>
                    {cart.discountCents ? <T v="small">Desconto {formatBRL(cart.discountCents)}</T> : null}
                    <T v="small" style={{ fontWeight: '700' }}>{formatBRL(itemNetCents(cart))}</T>
                  </>
                ) : <T v="small" color={colors.textMuted}>Não registrado</T>}
              </View>
              <View style={[styles.col, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border, paddingLeft: space.md }]}>
                <T v="caption" color={colors.textMuted}>NOTA</T>
                {lines.length ? lines.map((l) => (
                  <View key={l.id} style={{ gap: 1 }}>
                    <T v="small" style={{ fontWeight: '600' }}>{l.description}</T>
                    <T v="small">{l.quantityMilli != null ? formatQuantity(l.quantityMilli, l.unit) : 'qtd ?'} × {l.unitPriceCents != null ? formatBRL(l.unitPriceCents) : '?'}</T>
                    {l.discountCents ? <T v="small">Desconto {formatBRL(l.discountCents)}</T> : null}
                    <T v="small" style={{ fontWeight: '700' }}>{receiptItemNet(l) != null ? formatBRL(receiptItemNet(l)!) : '—'}</T>
                  </View>
                )) : <T v="small" color={colors.textMuted}>Não localizado</T>}
              </View>
            </View>
          ) : null}
          {actions.map((a) => (
            <Button key={a.title} title={a.title} icon={a.icon} kind={a.kind ?? 'secondary'} compact onPress={() => {
              Promise.resolve(a.run()).catch((e) => Alert.alert('Não foi possível concluir', e instanceof Error ? e.message : String(e)));
            }} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 16, padding: space.lg, gap: space.md },
  compare: { flexDirection: 'row', gap: space.md, backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: space.md },
  col: { flex: 1, gap: 3 },
});

