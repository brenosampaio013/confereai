import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { monthKey, monthLong, monthlySeries, shiftMonth, spendByStore, summarizeMonth } from '@/domain/finance';
import { formatBRL, formatSignedBRL } from '@/domain/money';
import { fmtDate, plural } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { useApp } from '@/state/AppContext';
import { BarChart, HBarList } from '@/ui/charts';
import { Button, Card, EmptyState, IconButton, Loading, Row, Screen, SectionTitle, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

/** Resumo financeiro: total do mês, média, maior compra, economia e comparação com o mês anterior. */
export default function SummaryScreen() {
  const { repo, version } = useApp();
  const thisMonth = monthKey(new Date());
  const [month, setMonth] = useState(thisMonth);
  const { data: records } = useLoad(() => repo.listSpendRecords(), [version]);
  if (!records) return <Loading />;
  if (!records.length) {
    return (
      <Screen>
        <EmptyState icon="stats-chart-outline" title="Ainda não há gastos para resumir" text="Quando você encerrar uma compra ou conferir uma nota, o resumo do mês aparece aqui." />
      </Screen>
    );
  }
  const s = summarizeMonth(records, month);
  const series = monthlySeries(records, month, 6);
  const stores = spendByStore(records, month);
  const withBudget = records.filter((r) => monthKey(r.date) === month && r.budgetCents != null);
  const within = withBudget.filter((r) => r.totalCents <= r.budgetCents!).length;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton icon="chevron-back" label="Mês anterior" onPress={() => setMonth(shiftMonth(month, -1))} />
        <T v="heading">{cap(monthLong(month))}</T>
        {month < thisMonth ? <IconButton icon="chevron-forward" label="Próximo mês" onPress={() => setMonth(shiftMonth(month, 1))} /> : <View style={{ width: 40 }} />}
      </Row>

      <Card>
        <T v="caption" color={colors.textMuted} style={{ textTransform: 'uppercase' }}>Total gasto no mês</T>
        <T v="display">{formatBRL(s.totalCents)}</T>
        {s.previousCount > 0 ? (
          <Row gap={6}>
            <Ionicons name={s.diffCents > 0 ? 'arrow-up' : s.diffCents < 0 ? 'arrow-down' : 'remove'} size={16} color={colors.textMuted} />
            <T v="small" color={colors.textMuted} style={{ flex: 1 }}>
              {s.diffCents === 0 ? 'Igual ao' : `${formatSignedBRL(s.diffCents)}${s.diffPercent != null ? ` (${s.diffPercent > 0 ? '+' : ''}${s.diffPercent}%)` : ''} em relação ao`} mês anterior ({formatBRL(s.previousTotalCents)})
            </T>
          </Row>
        ) : (
          <T v="small" color={colors.textMuted}>Sem compras no mês anterior para comparar.</T>
        )}
      </Card>

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Stat label="Compras" value={String(s.count)} />
        <Stat label="Média por compra" value={s.averageCents != null ? formatBRL(s.averageCents) : '—'} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Stat label="Maior compra" value={s.biggest ? formatBRL(s.biggest.totalCents) : '—'} sub={s.biggest ? `${fmtDate(s.biggest.date)}${s.biggest.storeName ? ` · ${s.biggest.storeName}` : ''}` : undefined} onPress={s.biggest ? () => router.push(`/purchase/${s.biggest!.id}`) : undefined} />
        <Stat label="Economia registrada" value={formatBRL(s.savingsCents)} sub="Descontos e promoções informados" />
      </View>
      {withBudget.length ? (
        <Card>
          <Row>
            <Ionicons name="wallet-outline" size={20} color={colors.navy} />
            <T style={{ flex: 1 }}>{within} de {plural(withBudget.length, 'compra com orçamento ficou', 'compras com orçamento ficaram')} dentro do planejado.</T>
          </Row>
        </Card>
      ) : null}

      <SectionTitle>Gasto por mês</SectionTitle>
      <Card>
        <BarChart key={month} accessibilityLabel="Gasto nos últimos seis meses" initialKey={month} data={series.map((p) => ({ key: p.month, label: p.label, valueCents: p.totalCents, detail: plural(p.count, 'compra', 'compras') }))} />
        <T v="caption" color={colors.textMuted}>Toque em um mês para ver o valor.</T>
      </Card>

      <SectionTitle>Gasto por supermercado</SectionTitle>
      <Card>
        {stores.length ? (
          <HBarList data={stores.map((st) => ({ key: st.store, label: st.store, valueCents: st.totalCents, detail: plural(st.count, 'compra', 'compras') }))} />
        ) : (
          <T color={colors.textMuted}>Nenhuma compra neste mês.</T>
        )}
      </Card>

      <Button title="Ver preços por produto" icon="pricetags-outline" kind="secondary" onPress={() => router.push('/prices')} />
      <T v="caption" color={colors.textMuted}>
        Considera compras encerradas ou conferidas. O valor é o total da nota quando ela foi conferida; caso contrário, o total registrado no carrinho.
      </T>
    </Screen>
  );
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function Stat({ label, value, sub, onPress }: { label: string; value: string; sub?: string; onPress?: () => void }) {
  return (
    <Card style={{ flex: 1 }} onPress={onPress} accessibilityLabel={`${label}: ${value}`}>
      <T v="caption" color={colors.textMuted} style={{ textTransform: 'uppercase' }}>{label}</T>
      <T v="heading">{value}</T>
      {sub ? <T v="caption" color={colors.textMuted} numberOfLines={2}>{sub}</T> : null}
    </Card>
  );
}
