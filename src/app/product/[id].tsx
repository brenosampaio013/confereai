import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { formatBRL, formatSignedBRL } from '@/domain/money';
import { ageLabel, compareStores, freshness, type Freshness } from '@/domain/priceHistory';
import { PRICE_SOURCE_LABEL } from '@/domain/types';
import { formatPackageMeasure } from '@/domain/units';
import { isCloudConfigured } from '@/lib/config';
import { showAlert } from '@/lib/dialog';
import { fmtDate } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { communityPrices } from '@/services/prices';
import { useApp } from '@/state/AppContext';
import { BarChart, HBarList } from '@/ui/charts';
import { Banner, Button, Card, Divider, KeyValue, Loading, Pill, Row, Screen, SectionTitle, T } from '@/ui/components';
import { colors } from '@/ui/theme';

const FRESH_PILL: Record<Freshness, { label: string; t: 'green' | 'neutral' | 'yellow' }> = {
  current: { label: 'Preço atual', t: 'green' },
  recent: { label: 'Preço recente', t: 'neutral' },
  old: { label: 'Preço antigo', t: 'yellow' },
};

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, version, bump } = useApp();
  const { data } = useLoad(async () => ({ product: await repo.getProduct(id), history: await repo.listPriceHistory(id) }), [id, version]);
  const { data: community, error: communityError } = useLoad(
    async () => (data?.product && isCloudConfigured() ? communityPrices(data.product) : null),
    [id, data?.product?.updatedAt ?? null],
  );
  if (!data) return <Loading />;
  const { product, history } = data;
  if (!product) return <Screen><Banner t="yellow" title="Produto não encontrado" /></Screen>;
  const unit = product.saleUnit === 'un' ? 'unidade' : product.saleUnit === 'kg' ? 'kg' : 'litro';
  const per = product.saleUnit === 'un' ? 'un' : product.saleUnit;
  const now = new Date();
  const cmp = compareStores(history, product.saleUnit, now);
  const evolution = history.filter((h) => h.saleUnit === product.saleUnit).slice(0, 8).reverse();

  const remove = (recordId: string) =>
    showAlert('Excluir este registro de preço?', 'Ele sai do seu histórico. A compra em que foi registrado não é alterada.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await repo.removePriceRecord(recordId); bump(); } },
    ]);

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
        {cmp.latest ? (
          <KeyValue label="Último preço registrado" value={`${formatBRL(cmp.latest.unitPriceCents)} · ${ageLabel(cmp.latest.recordedAt, now)}`} strong />
        ) : null}
        {product.source === 'open_food_facts' ? <Pill label="Dados iniciais da base Open Food Facts, confirmados por você" t="neutral" /> : null}
        {product.source === 'community' ? <Pill label="Dados iniciais da comunidade, confirmados por você" t="neutral" /> : null}
      </Card>

      <SectionTitle>Seus preços por supermercado</SectionTitle>
      {cmp.stores.length === 0 ? (
        <Card><T color={colors.textMuted}>Nenhum preço registrado.</T></Card>
      ) : (
        <Card>
          {cmp.cheapest && cmp.stores.filter((s) => s.freshness !== 'old').length > 1 ? (
            <Banner t="green" icon="trending-down-outline" title={`Mais barato: ${cmp.cheapest.store}`}>
              {formatBRL(cmp.cheapest.last.unitPriceCents)} / {per}, registrado {ageLabel(cmp.cheapest.last.recordedAt, now)}.
              {cmp.spreadCents > 0 ? ` Diferença de ${formatBRL(cmp.spreadCents)} para o mais caro.` : ''}
            </Banner>
          ) : null}
          <HBarList
            data={cmp.stores.map((s) => ({
              key: s.storeLocationId ?? s.store,
              label: s.store,
              valueCents: s.last.unitPriceCents,
              muted: s.freshness === 'old',
              detail: `${FRESH_PILL[s.freshness].label} · ${ageLabel(s.last.recordedAt, now)}${s.last.promo ? ' · promoção' : ''}${s.count > 1 ? ` · ${s.count} registros (de ${formatBRL(s.minCents)} a ${formatBRL(s.maxCents)})` : ''}`,
            }))}
            note="Preços com mais de 30 dias aparecem em cinza e não entram na comparação: eles podem não valer mais."
          />
        </Card>
      )}

      {evolution.length > 1 ? (
        <>
          <SectionTitle>Evolução do preço</SectionTitle>
          <Card>
            <BarChart
              accessibilityLabel="Evolução dos preços registrados"
              data={evolution.map((h) => ({ key: h.id, label: fmtDate(h.recordedAt).slice(0, 5), valueCents: h.unitPriceCents, detail: `${fmtDate(h.recordedAt)} · ${h.storeName ?? 'supermercado não informado'}` }))}
            />
            <T v="caption" color={colors.textMuted}>Últimos {evolution.length} registros, do mais antigo para o mais recente. Toque em uma barra para ver o valor.</T>
          </Card>
        </>
      ) : null}

      {isCloudConfigured() ? (
        <>
          <SectionTitle>Preços informados pela comunidade</SectionTitle>
          <Card>
            {community === undefined && !communityError ? <T color={colors.textMuted}>Consultando…</T> : null}
            {communityError ? <T color={colors.textMuted}>{communityError}</T> : null}
            {community && community.length === 0 ? <T color={colors.textMuted}>Ninguém informou o preço deste produto nos últimos 90 dias.</T> : null}
            {community === null ? <T color={colors.textMuted}>Sem conexão para consultar agora.</T> : null}
            {community?.length ? (
              <HBarList
                data={community.map((c) => {
                  const f = freshness(c.observed_at, now);
                  return {
                    key: c.location_id,
                    label: `${c.supermarket_name} · ${c.neighborhood || c.address}`,
                    valueCents: c.unit_price_cents,
                    muted: f === 'old',
                    detail: `${c.city}/${c.state} · ${FRESH_PILL[f].label.toLowerCase()}, ${ageLabel(c.observed_at, now)}${c.promo ? ' · promoção' : ''} · ${c.reporters <= 1 ? 'informado por 1 pessoa' : `informado por ${c.reporters} pessoas`}`,
                  };
                })}
                note="Informações de outros usuários, sem verificação do Confere Aí. Confira o preço na loja."
              />
            ) : null}
          </Card>
        </>
      ) : null}

      <SectionTitle>Todos os seus registros</SectionTitle>
      <T v="small" color={colors.textMuted}>Somente registros deste mesmo produto (mesma marca e embalagem).</T>
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
                <Row gap={6}>
                  {diff ? <Pill label={formatSignedBRL(diff)} t={diff > 0 ? 'yellow' : 'green'} /> : null}
                  {!h.purchaseId ? <Button title="Excluir" kind="ghost" compact onPress={() => remove(h.id)} /> : null}
                </Row>
              </Row>
              <T v="small" color={colors.textMuted}>
                {fmtDate(h.recordedAt)} · {h.storeName ?? 'Supermercado não informado'} · {PRICE_SOURCE_LABEL[h.source]}
                {h.promo ? ` · promoção${h.regularPriceCents ? ` (normal ${formatBRL(h.regularPriceCents)})` : ''}` : ''}
              </T>
            </View>
          );
        })}
      </Card>
      <Button title="Registrar novo preço deste produto" icon="pricetag-outline" kind="secondary" onPress={() => router.push(product.barcode ? { pathname: '/item/add', params: { barcode: product.barcode, via: 'manual' } } : '/capture')} />
    </Screen>
  );
}
