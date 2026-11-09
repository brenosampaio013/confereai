import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { categoryLabel, conditionLabel, formatDistance, formatOfferPrice, relativeTime, validityText } from '@/domain/marketplace';
import type { OfferRow } from '@/services/marketplace';
import { IconButton, Pill, T } from '../components';
import { RemoteImage } from '../RemoteImage';
import { colors, radius, shadow, space } from '../theme';
import { VerificationBadges } from './Badges';

export function OfferCard({ o, onFavorite, onShare, wide }: { o: OfferRow; onFavorite: (o: OfferRow) => void; onShare: (o: OfferRow) => void; wide?: boolean }) {
  const special = o.condition_types.filter((c) => c !== 'any_customer');
  const dist = formatDistance(o.distance_km);
  return (
    <Pressable
      onPress={() => router.push(`/offers/${o.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${o.product_name}, ${formatOfferPrice(o.promotional_price_cents, o.sale_unit)}, ${o.supermarket_name}`}
      style={({ pressed }) => [styles.card, shadow, wide && styles.wide, pressed && { opacity: 0.9 }]}
    >
      <View>
        <RemoteImage path={o.cover_image_path} style={styles.photo} />
        <View style={styles.pricePill}>
          <T v="heading" color={colors.white} style={{ fontVariant: ['tabular-nums'] }}>{formatOfferPrice(o.promotional_price_cents, o.sale_unit)}</T>
        </View>
        {o.status === 'contested' ? <View style={styles.contested}><Pill label="Contestada" t="yellow" icon="alert-circle" /></View> : null}
      </View>
      <View style={styles.body}>
        <T v="caption" color={colors.textMuted} style={{ textTransform: 'uppercase' }} numberOfLines={1}>{categoryLabel(o.category)}</T>
        <T v="bodyStrong" numberOfLines={2}>{o.product_name}</T>
        <T v="small" color={colors.textMuted} numberOfLines={1}>{[o.brand, o.package_label].filter(Boolean).join(' · ') || ' '}</T>
        <View style={styles.row}>
          <Ionicons name="storefront-outline" size={14} color={colors.navy} />
          <T v="small" style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>{o.supermarket_name}</T>
        </View>
        <T v="small" color={colors.textMuted} numberOfLines={1}>
          {[o.neighborhood || o.address, dist ? `a ${dist}` : null].filter(Boolean).join(' · ')}
        </T>
        {special.length ? <Pill label={conditionLabel(special[0], o.min_quantity) + (special.length > 1 ? ` +${special.length - 1}` : '')} t="yellow" icon="information-circle-outline" /> : null}
        <VerificationBadges flags={o} compact />
        <T v="small" color={colors.textMuted}>
          {o.independent_confirmations ? `${o.independent_confirmations} ${o.independent_confirmations === 1 ? 'confirmação' : 'confirmações'} · ` : 'Sem confirmações · '}
          {relativeTime(o.created_at)}
        </T>
        <T v="small" color={colors.textFaint}>{validityText(o.ends_on, o.starts_on)}</T>
        <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 2 }]}>
          <IconButton icon={o.favorited ? 'heart' : 'heart-outline'} label={o.favorited ? 'Remover dos favoritos' : 'Favoritar'} color={o.favorited ? colors.red : colors.navy} size={20} onPress={() => onFavorite(o)} />
          <IconButton icon="share-social-outline" label="Compartilhar" size={20} onPress={() => onShare(o)} />
          <IconButton icon="checkmark-done-outline" label="Confirmar ou contestar" size={20} onPress={() => router.push({ pathname: '/offers/[id]', params: { id: o.id, action: 'confirm' } })} />
          <IconButton icon="flag-outline" label="Denunciar" size={20} onPress={() => router.push({ pathname: '/offers/[id]', params: { id: o.id, action: 'report' } })} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 236, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  wide: { width: '100%' },
  photo: { width: '100%', height: 150, backgroundColor: colors.navySoft },
  pricePill: { position: 'absolute', left: space.sm, bottom: space.sm, backgroundColor: colors.green, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  contested: { position: 'absolute', right: space.sm, top: space.sm },
  body: { padding: space.md, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
