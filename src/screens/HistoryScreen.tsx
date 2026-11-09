import { useState } from 'react';
import { View } from 'react-native';
import { useLoad } from '@/lib/useLoad';
import { useApp } from '@/state/AppContext';
import { Card, Divider, EmptyState, Screen, Segmented } from '@/ui/components';
import { PurchaseRow } from '@/ui/PurchaseRow';
import { space } from '@/ui/theme';

type Filter = 'all' | 'attention' | 'incomplete';

export default function History() {
  const { repo, version } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const { data } = useLoad(() => repo.listPurchaseSummaries(500), [version]);
  const list = (data ?? []).filter((s) => {
    if (filter === 'attention') return s.openDivergences > 0;
    if (filter === 'incomplete') return s.reportComplete === false || s.receiptStatus === 'draft' || (s.purchase.status !== 'active' && s.receiptStatus === 'none');
    return true;
  });
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
      <Card style={{ paddingVertical: space.xs }}>
        {list.length ? (
          list.map((s, i) => (
            <View key={s.purchase.id}>
              {i > 0 ? <Divider /> : null}
              <PurchaseRow s={s} />
            </View>
          ))
        ) : (
          <EmptyState icon="time-outline" title={filter === 'all' ? 'Nenhuma compra salva' : 'Nada por aqui'} text={filter === 'all' ? 'As compras e conferências que você fizer ficam salvas neste aparelho.' : 'Nenhuma compra corresponde ao filtro.'} />
        )}
      </Card>
    </Screen>
  );
}
