import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useLoad } from '@/lib/useLoad';
import { searchOffers, setFavorite, OfferRow } from '@/services/marketplace';
import { showAlert } from '@/lib/dialog';
import { Banner, Card, EmptyState, Loading, Screen, T } from '@/ui/components';
import { CategoryStrip } from '@/ui/market/CategoryStrip';
import { OfferCard } from '@/ui/market/OfferCard';
import { shareOffer } from '@/ui/market/share';
import { colors, space } from '@/ui/theme';

export default function StoreOffers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [category, setCategory] = useState<string | null>(null);
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const { data, error } = useLoad(useCallback(() => searchOffers({ locationId: id, category, limit: 100 }), [id, category]), [id, category]);
  if (error) return <Screen><Banner t="red" icon="alert-circle">{error}</Banner></Screen>;
  if (!data) return <Loading />;
  const first = data[0];
  const fav = async (o: OfferRow) => {
    const now = override[o.id] ?? o.favorited;
    try {
      await setFavorite(o.id, !now);
      setOverride({ ...override, [o.id]: !now });
    } catch (e) {
      showAlert('Não foi possível favoritar', e instanceof Error ? e.message : '');
    }
  };
  return (
    <>
      <Stack.Screen options={{ title: first?.supermarket_name ?? 'Ofertas da unidade' }} />
      <Screen padded={false}>
        <View style={{ padding: space.lg, gap: space.md }}>
          {first ? (
            <Card>
              <T v="heading">{first.supermarket_name}</T>
              <T v="small" color={colors.textMuted}>{[first.address, first.neighborhood, `${first.city} - ${first.state}`].filter(Boolean).join(' · ')}</T>
              <T v="small" color={colors.greenText}>{data.length} {data.length === 1 ? 'promoção ativa' : 'promoções ativas'}</T>
            </Card>
          ) : null}
        </View>
        <CategoryStrip value={category} onChange={setCategory} />
        <View style={{ padding: space.lg, gap: space.md }}>
          {data.length === 0 ? <EmptyState icon="pricetags-outline" title="Nenhuma promoção ativa" text="Publique uma oferta desta unidade quando encontrar." /> : null}
          {data.map((o) => <OfferCard key={o.id} o={{ ...o, favorited: override[o.id] ?? o.favorited }} onFavorite={fav} onShare={(x) => shareOffer(x)} wide />)}
        </View>
      </Screen>
    </>
  );
}
