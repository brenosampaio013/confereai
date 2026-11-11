import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import CartScreen from '@/screens/CartScreen';
import HistoryScreen from '@/screens/HistoryScreen';
import SummaryScreen from '@/screens/SummaryScreen';
import { Segmented } from '@/ui/components';
import { colors, space } from '@/ui/theme';

type ViewName = 'cart' | 'history' | 'summary';

/** Aba Compras: compra em andamento (carrinho), Minhas compras e resumo financeiro. */
export default function Purchases() {
  const params = useLocalSearchParams<{ view?: string }>();
  const initial: ViewName = params.view === 'history' || params.view === 'summary' ? params.view : 'cart';
  return <PurchasesView key={initial} initial={initial} />;
}

function PurchasesView({ initial }: { initial: ViewName }) {
  const [view, setView] = useState<ViewName>(initial);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.bg }}>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'cart', label: 'Compra atual' },
            { value: 'history', label: 'Minhas compras' },
            { value: 'summary', label: 'Resumo' },
          ]}
        />
      </View>
      {view === 'cart' ? <CartScreen /> : view === 'history' ? <HistoryScreen /> : <SummaryScreen />}
    </View>
  );
}
