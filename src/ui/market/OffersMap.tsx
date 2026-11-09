import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform, Pressable, View } from 'react-native';
import { formatOfferPrice } from '@/domain/marketplace';
import { Banner, Card, Row, T } from '../components';
import { colors, space } from '../theme';
import type { OffersMapProps, PickLocationMapProps } from './mapTypes';

/**
 * Versão para o app nativo: o mapa interativo (MapLibre nativo) exige um build de
 * desenvolvimento próprio. Aqui as unidades aparecem em lista, com atalho para o app de mapas.
 */
export function OffersMap({ stores, onSelect }: OffersMapProps) {
  const openMaps = (lat: number, lng: number, label: string) => {
    const q = encodeURIComponent(label);
    const url = Platform.OS === 'ios' ? `http://maps.apple.com/?ll=${lat},${lng}&q=${q}` : `geo:${lat},${lng}?q=${lat},${lng}(${q})`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`));
  };
  return (
    <View style={{ gap: space.sm }}>
      <Banner t="navy" icon="map-outline">O mapa interativo está disponível na versão web. Aqui, as unidades com ofertas aparecem em lista.</Banner>
      {stores.map((s) => (
        <Card key={s.location_id} onPress={() => onSelect(s)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">{s.supermarket_name}</T>
              <T v="small" color={colors.textMuted}>{[s.address, s.neighborhood].filter(Boolean).join(' · ')}</T>
              <T v="small" color={colors.greenText}>{s.active_offers} {s.active_offers === 1 ? 'oferta ativa' : 'ofertas ativas'}{s.top_offers?.[0] ? ` · ${s.top_offers[0].product_name} ${formatOfferPrice(s.top_offers[0].promotional_price_cents, s.top_offers[0].sale_unit)}` : ''}</T>
            </View>
            <Pressable onPress={() => openMaps(s.latitude, s.longitude, s.supermarket_name)} accessibilityLabel="Abrir no app de mapas" hitSlop={8}>
              <Ionicons name="navigate-outline" size={22} color={colors.navy} />
            </Pressable>
          </Row>
        </Card>
      ))}
    </View>
  );
}

export function PickLocationMap(_: PickLocationMapProps) {
  return null;
}

export const mapAvailable = false;
