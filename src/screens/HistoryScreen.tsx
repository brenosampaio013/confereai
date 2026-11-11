import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { monthKey, monthLong } from '@/domain/finance';
import { formatBRL } from '@/domain/money';
import type { PurchaseSummary } from '@/data/repository';
import { useLoad } from '@/lib/useLoad';
import { useApp } from '@/state/AppContext';
import { Button, Card, Divider, EmptyState, Row, Screen, Segmented, T } from '@/ui/components';
import { PurchaseRow } from '@/ui/PurchaseRow';
import { colors, space } from '@/ui/theme';

type Filter = 'all' | 'attention' | 'incomplete';

/** Minhas compras: todas as compras salvas, agrupadas por mês, com o total de cada mês. */
export default function History() {
  const { repo, version } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const { data } = useLoad(() => repo.listPurchaseSummaries(500), [version]);
  const list = (data ?? []).filter((s) => {
    if (filter === 'attention') return s.openDivergences > 0;
    if (filter === 'incomplete') return s.reportComplete === false || s.receiptStatus === 'draft' || (s.purchase.status !== 'active' && s.receiptStatus === 'none');
    return true;
  });
  const groups = new Map<string, PurchaseSummary[]>();
  for (const s of list) {
    const k = monthKey(s.purchase.startedAt);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const comparable = (data ?? []).filter((s) => s.purchase.mode === 'cart' && s.itemCount > 0);
  return (
    <Screen>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Todas' },
          { value: 'attention', label: 'Com pendências' },
          { value: 'incomplete', label: 'Incompletas' },
        ]}
      />
      {comparable.length >= 2 ? <Button title="Comparar duas compras" icon="git-compare-outline" kind="secondary" compact onPress={() => router.push('/compare')} /> : null}
      {list.length === 0 ? (
        <Card>
          <EmptyState icon="time-outline" title={filter === 'all' ? 'Nenhuma compra salva' : 'Nada por aqui'} text={filter === 'all' ? 'Cada compra que você fizer fica salva automaticamente aqui.' : 'Nenhuma compra corresponde ao filtro.'} />
        </Card>
      ) : null}
      {[...groups.entries()].map(([month, items]) => {
        const closed = items.filter((s) => s.purchase.status !== 'active');
        const total = closed.reduce((a, s) => a + s.finalTotalCents, 0);
        return (
          <View key={month} style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="bodyStrong">{cap(monthLong(month))}</T>
              <T v="small" color={colors.textMuted}>{formatBRL(total)}</T>
            </Row>
            <Card style={{ paddingVertical: space.xs }}>
              {items.map((s, i) => (
                <View key={s.purchase.id}>
                  {i > 0 ? <Divider /> : null}
                  <PurchaseRow s={s} />
                </View>
              ))}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
