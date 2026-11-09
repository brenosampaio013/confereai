import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import CartScreen from '@/screens/CartScreen';
import HistoryScreen from '@/screens/HistoryScreen';
import { Segmented } from '@/ui/components';
import { colors, space } from '@/ui/theme';

/** Aba Compras: compra em andamento (carrinho) e histórico, no mesmo lugar. */
export default function Purchases() {
  const params = useLocalSearchParams<{ view?: string }>();
  return <PurchasesView key={params.view ?? 'cart'} initial={params.view === 'history' ? 'history' : 'cart'} />;
}

function PurchasesView({ initial }: { initial: 'cart' | 'history' }) {
  const [view, setView] = useState<'cart' | 'history'>(initial);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.bg }}>
        <Segmented value={view} onChange={setView} options={[{ value: 'cart', label: 'Compra atual' }, { value: 'history', label: 'Histórico' }]} />
      </View>
      {view === 'cart' ? <CartScreen /> : <HistoryScreen />}
    </View>
  );
}
