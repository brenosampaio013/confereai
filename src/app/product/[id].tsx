import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { formatBRL, formatSignedBRL } from '@/domain/money';
import { PRICE_SOURCE_LABEL } from '@/domain/types';
import { formatPackageMeasure } from '@/domain/units';
import { fmtDate } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { useApp } from '@/state/AppContext';
import { Banner, Card, Divider, KeyValue, Loading, Pill, Row, Screen, SectionTitle, T } from '@/ui/components';
import { colors } from '@/ui/theme';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, version } = useApp();
  const { data } = useLoad(async () => ({ product: await repo.getProduct(id), history: await repo.listPriceHistory(id) }), [id, version]);
  if (!data) return <Loading />;
  const { product, history } = data;
  if (!product) return <Screen><Banner t="yellow" title="Produto não encontrado" /></Screen>;
  const unit = product.saleUnit === 'un' ? 'unidade' : product.saleUnit === 'kg' ? 'kg' : 'litro';

  return (
    <Screen>
      <Card>
        <Row style={{ alignItems: 'flex-start' }}>
          {product.imageUri ? <Image source={{ uri: product.imageUri }} style={{ width: 64, height: 64, borderRadius: 12 }} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <T v="title">{product.name}</T>
            <T color={colors.textMuted}>{[product.brand, product.packageAmount && product.packageUnit ? formatPackageMeasure({ amount: product.packageAmount, unit: product.packageUnit }) : null].filter(Boolean).join(' · ')}</T>
          </View>
        </Row>
        {product.barcode ? <KeyValue label="Código de barras" value={product.barcode} /> : null}
        <KeyValue label="Vendido por" value={unit} />
        {product.source === 'open_food_facts' ? <Pill label="Dados iniciais da base Open Food Facts, confirmados por você" t="neutral" /> : null}
      </Card>
      <SectionTitle>Preços que você registrou</SectionTitle>
      <T v="small" color={colors.textMuted}>Somente registros deste mesmo produto (mesma marca e embalagem). Não representa a média de mercado.</T>
      <Card>
        {history.length === 0 ? <T color={colors.textMuted}>Nenhum preço registrado.</T> : null}
        {history.map((h, i) => {
          const older = history[i + 1];
          const diff = older && older.saleUnit === h.saleUnit ? h.unitPriceCents - older.unitPriceCents : null;
          return (
            <View key={h.id} style={{ gap: 4 }}>
              {i > 0 ? <Divider /> : null}
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="bodyStrong">{formatBRL(h.unitPriceCents)} / {h.saleUnit === 'un' ? 'un' : h.saleUnit}</T>
                {diff ? <Pill label={formatSignedBRL(diff)} t={diff > 0 ? 'yellow' : 'green'} /> : null}
              </Row>
              <T v="small" color={colors.textMuted}>{fmtDate(h.recordedAt)} · {h.storeName ?? 'Estabelecimento não informado'} · {PRICE_SOURCE_LABEL[h.source]}{h.promo ? ' · promoção' : ''}</T>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
