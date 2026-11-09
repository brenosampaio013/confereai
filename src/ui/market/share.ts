import { Platform, Share } from 'react-native';
import { formatOfferPrice, validityText } from '@/domain/marketplace';
import { config } from '@/lib/config';

export async function shareOffer(o: { id: string; product_name: string; promotional_price_cents: number; sale_unit: string; supermarket_name: string; ends_on: string; starts_on?: string }) {
  const url = `${config.webUrl}/offers/${o.id}`;
  const message = `${o.product_name} por ${formatOfferPrice(o.promotional_price_cents, o.sale_unit)} no ${o.supermarket_name} (${validityText(o.ends_on, o.starts_on).toLowerCase()}). Vi no Confere Aí: ${url}`;
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator | undefined;
    if (nav?.share) {
      await nav.share({ title: 'Oferta no Confere Aí', text: message, url }).catch(() => {});
      return 'shared';
    }
    await nav?.clipboard?.writeText(message);
    return 'copied';
  }
  await Share.share({ message, url });
  return 'shared';
}
