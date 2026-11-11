import { useState } from 'react';
import { View } from 'react-native';
import { comparePurchases } from '@/domain/finance';
import { formatBRL, formatSignedBRL } from '@/domain/money';
import { fmtDate, plural } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Card, Divider, KeyValue, Loading, Pill, Row, Screen, SectionTitle, Sheet, T } from '@/ui/components';
import { colors } from '@/ui/theme';

/** Compara duas compras: totais e preço unitário dos produtos que aparecem nas duas. */
export default function CompareScreen() {
  const { repo, version } = useApp();
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);
  const { data: all } = useLoad(async () => (await repo.listPurchaseSummaries(500)).filter((s) => s.purchase.mode === 'cart' && s.itemCount > 0), [version]);
  // Por padrão: as duas compras mais recentes (A = anterior, B = mais recente).
  const a = aId ?? all?.[1]?.purchase.id ?? null;
  const b = bId ?? all?.[0]?.purchase.id ?? null;
  const { data: cmp } = useLoad(async () => (a && b ? comparePurchases(await repo.listCartItems(a), await repo.listCartItems(b)) : null), [a, b, version]);

  if (!all) return <Loading />;
  if (all.length < 2) return <Screen><Banner t="navy" title="Faltam compras para comparar">São necessárias pelo menos duas compras com produtos registrados.</Banner></Screen>;
  const sa = all.find((s) => s.purchase.id === a)!;
  const sb = all.find((s) => s.purchase.id === b)!;
  const label = (s: typeof sa) => `${fmtDate(s.purchase.startedAt)}${s.purchase.storeName ? ` · ${s.purchase.storeName}` : ''}`;
  const totalDiff = sb.finalTotalCents - sa.finalTotalCents;

  return (
    <Screen>
      <Card>
        <KeyValue label="Compra A" value={<Button title={label(sa)} kind="ghost" compact onPress={() => setPicking('a')} />} />
        <KeyValue label="Compra B" value={<Button title={label(sb)} kind="ghost" compact onPress={() => setPicking('b')} />} />
      </Card>
      {a === b ? <Banner t="yellow" title="Escolha duas compras diferentes" /> : null}
      <Card>
        <KeyValue label={`Total A (${plural(sa.itemCount, 'item', 'itens')})`} value={formatBRL(sa.finalTotalCents)} />
        <KeyValue label={`Total B (${plural(sb.itemCount, 'item', 'itens')})`} value={formatBRL(sb.finalTotalCents)} />
        <KeyValue label="Diferença (B − A)" value={formatSignedBRL(totalDiff)} strong />
        <T v="caption" color={colors.textMuted}>Os totais dependem do que foi comprado em cada vez. A comparação de preços abaixo considera só os produtos iguais.</T>
      </Card>

      <SectionTitle>Produtos nas duas compras ({cmp?.common.length ?? 0})</SectionTitle>
      <Card>
        {!cmp ? <T color={colors.textMuted}>Calculando…</T> : null}
        {cmp && cmp.common.length === 0 ? <T color={colors.textMuted}>Nenhum produto igual nas duas compras.</T> : null}
        {cmp?.common.map((c, i) => (
          <View key={`${c.name}-${i}`} style={{ gap: 4 }}>
            {i > 0 ? <Divider /> : null}
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>{c.name}</T>
              {c.diffCents !== 0 ? <Pill label={formatSignedBRL(c.diffCents)} t={c.diffCents > 0 ? 'yellow' : 'green'} /> : <Pill label="Mesmo preço" t="neutral" />}
            </Row>
            <T v="small" color={colors.textMuted}>A: {formatBRL(c.priceA)} · B: {formatBRL(c.priceB)} {c.saleUnit === 'un' ? 'por unidade' : `por ${c.saleUnit}`}</T>
          </View>
        ))}
        {cmp && cmp.common.length > 1 ? (
          <>
            <Divider />
            <KeyValue label="Soma das diferenças de preço unitário" value={formatSignedBRL(cmp.commonDiffCents)} strong />
          </>
        ) : null}
      </Card>
      {cmp && (cmp.onlyA.length || cmp.onlyB.length) ? (
        <Card>
          <T v="small" color={colors.textMuted}>Só na compra A ({cmp.onlyA.length}): {cmp.onlyA.join(', ') || '—'}</T>
          <T v="small" color={colors.textMuted}>Só na compra B ({cmp.onlyB.length}): {cmp.onlyB.join(', ') || '—'}</T>
        </Card>
      ) : null}

      <Sheet visible={!!picking} onClose={() => setPicking(null)} title={picking === 'a' ? 'Escolher a compra A' : 'Escolher a compra B'}>
        {all.map((s) => (
          <Button
            key={s.purchase.id}
            title={`${label(s)} — ${formatBRL(s.finalTotalCents)}`}
            kind={(picking === 'a' ? a : b) === s.purchase.id ? 'primary' : 'secondary'}
            compact
            onPress={() => {
              if (picking === 'a') setAId(s.purchase.id);
              else setBId(s.purchase.id);
              setPicking(null);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}
