import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatDateBR, formatOfferPrice, LOCATION_MESSAGE, REPUTATION_LABEL } from '@/domain/marketplace';
import { useLoad } from '@/lib/useLoad';
import { myOffers, myReputation } from '@/services/marketplace';
import { Banner, Button, Card, EmptyState, Loading, Pill, Row, Screen, Segmented, T } from '@/ui/components';
import { StatusPill } from '@/ui/market/Badges';
import { RemoteImage } from '@/ui/RemoteImage';
import { colors, radius, space } from '@/ui/theme';

type Filter = 'active' | 'review' | 'ended';

export default function MyOffers() {
  const [filter, setFilter] = useState<Filter>('active');
  const [tick, setTick] = useState(0);
  const { data, error } = useLoad(useCallback(async () => ({ list: await myOffers(), rep: await myReputation() }), []), [tick]);
  if (error) return <Screen><Banner t="red" icon="alert-circle" title="Não foi possível carregar">{error}</Banner><Button title="Tentar de novo" onPress={() => setTick(tick + 1)} /></Screen>;
  if (!data) return <Loading />;
  const list = data.list.filter((o) =>
    filter === 'active' ? ['published', 'partially_verified', 'community_confirmed', 'contested'].includes(o.status)
      : filter === 'review' ? ['pending_review', 'draft'].includes(o.status) : ['expired', 'removed'].includes(o.status));
  return (
    <Screen>
      {data.rep ? (
        <Card>
          <T v="caption" color={colors.textMuted}>SUA PARTICIPAÇÃO</T>
          <T v="heading">{REPUTATION_LABEL[data.rep.level]}</T>
          <T v="small" color={colors.textMuted}>{data.rep.published} publicadas · {data.rep.confirmed} confirmadas pela comunidade ou moderação</T>
          <T v="small" color={colors.textMuted}>A reputação cresce com ofertas confirmadas e preços corretos, não com a quantidade de publicações.</T>
        </Card>
      ) : null}
      <Segmented value={filter} onChange={setFilter} options={[{ value: 'active', label: 'Ativas' }, { value: 'review', label: 'Em análise' }, { value: 'ended', label: 'Encerradas' }]} />
      {list.length === 0 ? (
        <EmptyState icon="albums-outline" title="Nada por aqui" text="As ofertas que você publicar aparecem nesta lista." action={<Button title="Publicar promoção" icon="add-circle" kind="confirm" onPress={() => router.push('/offers/publish')} style={{ alignSelf: 'stretch', marginTop: space.md }} />} />
      ) : null}
      {list.map((o) => (
        <Pressable key={o.id} onPress={() => router.push(`/offers/${o.id}`)} style={styles.row} accessibilityRole="button" accessibilityLabel={o.product_name}>
          <RemoteImage path={o.cover_image_path} style={styles.thumb} />
          <View style={{ flex: 1, gap: 3 }}>
            <T v="bodyStrong" numberOfLines={1}>{o.product_name}</T>
            <T v="small" color={colors.textMuted}>{formatOfferPrice(o.promotional_price_cents, o.sale_unit)} · {o.supermarket_name}</T>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              <StatusPill status={o.status} />
              {o.location_status !== 'compatible' ? <Pill label={LOCATION_MESSAGE[o.location_status].title} t="neutral" /> : null}
              {o.open_reports ? <Pill label={`${o.open_reports} denúncia(s) em análise`} t="yellow" /> : null}
            </Row>
            <T v="small" color={colors.textFaint}>{o.independent_confirmations} confirmações · até {formatDateBR(o.ends_on)}</T>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, padding: space.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
});
