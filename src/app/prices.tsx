import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { normalizeText } from '@/domain/matching';
import { formatBRL } from '@/domain/money';
import { ageLabel, freshness } from '@/domain/priceHistory';
import { formatPackageMeasure } from '@/domain/units';
import { plural } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { useApp } from '@/state/AppContext';
import { Button, Card, Divider, EmptyState, Field, Loading, Pill, Row, Screen, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

/** Produtos com preço registrado: último preço, idade do registro e acesso à comparação por supermercado. */
export default function PricesScreen() {
  const { repo, version } = useApp();
  const [query, setQuery] = useState('');
  const { data } = useLoad(() => repo.listProductPrices(), [version]);
  if (!data) return <Loading />;
  const q = normalizeText(query);
  const list = data.filter((r) => !q || normalizeText(`${r.product.name} ${r.product.brand ?? ''} ${r.product.barcode ?? ''}`).includes(q));
  const now = new Date();
  return (
    <Screen>
      <Row>
        <Button title="Fotografar produto e preço" icon="camera-outline" onPress={() => router.push('/capture')} style={{ flex: 1 }} />
      </Row>
      <Button title="Ver resumo de gastos" icon="stats-chart-outline" kind="secondary" compact onPress={() => router.push({ pathname: '/purchases', params: { view: 'summary' } })} />
      {data.length ? <Field label="Buscar produto" value={query} onChangeText={setQuery} placeholder="Nome, marca ou código de barras" /> : null}
      <Card style={{ paddingVertical: space.xs }}>
        {list.length === 0 ? (
          <EmptyState
            icon="pricetags-outline"
            title={data.length ? 'Nenhum produto encontrado' : 'Nenhum preço registrado ainda'}
            text={data.length ? 'Tente outro termo.' : 'Os preços entram aqui quando você escaneia ou fotografa um produto e informa o preço.'}
          />
        ) : null}
        {list.map((r, i) => {
          const last = r.last!;
          const f = freshness(last.recordedAt, now);
          const measure = r.product.packageAmount && r.product.packageUnit ? formatPackageMeasure({ amount: r.product.packageAmount, unit: r.product.packageUnit }) : null;
          return (
            <View key={r.product.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable onPress={() => router.push(`/product/${r.product.id}`)} accessibilityRole="button" accessibilityLabel={`Ver preços de ${r.product.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <T v="bodyStrong" numberOfLines={2}>{r.product.name}</T>
                  <T v="small" color={colors.textMuted} numberOfLines={1}>{[r.product.brand, measure, last.storeName ?? 'Supermercado não informado'].filter(Boolean).join(' · ')}</T>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Pill label={f === 'old' ? `Preço antigo · ${ageLabel(last.recordedAt, now)}` : `Registrado ${ageLabel(last.recordedAt, now)}`} t={f === 'old' ? 'yellow' : f === 'current' ? 'green' : 'neutral'} />
                    {r.storeCount > 1 ? <Pill label={plural(r.storeCount, 'supermercado', 'supermercados')} t="navy" /> : null}
                  </Row>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T v="bodyStrong" color={f === 'old' ? colors.textMuted : colors.text}>{formatBRL(last.unitPriceCents)}</T>
                  <T v="caption" color={colors.textMuted}>/{last.saleUnit === 'un' ? 'un' : last.saleUnit}</T>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </Pressable>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
