import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { adjustQuantity, itemNetCents, quantityStep } from '@/domain/cart';
import { formatBRL } from '@/domain/money';
import { PRICE_SOURCE_LABEL, type CartItem } from '@/domain/types';
import { formatQuantity, isWeighed } from '@/domain/units';
import { fmtTime, plural } from '@/lib/format';
import { useApp } from '@/state/AppContext';
import { Button, Card, Divider, EmptyState, Field, Money, Pill, Row, Screen, Sheet, Stepper, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';
import { useState } from 'react';

export default function CartScreen() {
  const { repo, active, cart, totals, bump } = useApp();
  const [storeOpen, setStoreOpen] = useState(false);
  const [store, setStore] = useState('');

  if (!active) {
    return (
      <Screen>
        <EmptyState
          icon="cart-outline"
          title="Nenhuma compra em andamento"
          text="Inicie uma compra para registrar os produtos enquanto passa pelo supermercado."
          action={
            <Button
              title="Nova compra"
              icon="add-circle"
              onPress={async () => {
                await repo.startPurchase('cart');
                bump();
                router.push('/scan');
              }}
              style={{ alignSelf: 'stretch', marginTop: space.md }}
            />
          }
        />
      </Screen>
    );
  }

  const change = async (item: CartItem, dir: 1 | -1) => {
    const next = adjustQuantity(item, dir * quantityStep(item));
    if (next == null) {
      Alert.alert('Remover item?', `${item.name} será retirado do carrinho.`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            await repo.removeCartItem(item.id);
            await repo.logScanEvent({ purchaseId: item.purchaseId, type: 'item_removed', barcode: item.barcode, detail: item.name });
            bump();
          },
        },
      ]);
      return;
    }
    await repo.updateCartItem(item.id, { quantityMilli: next });
    await repo.logScanEvent({ purchaseId: item.purchaseId, type: 'quantity_changed', barcode: item.barcode, cartItemId: item.id, detail: `${item.quantityMilli} → ${next}` });
    bump();
  };

  const finish = () => {
    Alert.alert('Encerrar compra sem conferir a nota?', 'A compra fica salva no histórico e você pode conferir a nota depois.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Encerrar',
        onPress: async () => {
          await repo.updatePurchase(active.id, { status: 'closed' });
          bump();
          router.navigate('/');
        },
      },
    ]);
  };

  return (
    <Screen
      footer={
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <T v="caption" color={colors.textMuted} style={{ textTransform: 'uppercase' }}>Total registrado</T>
              <T v="small" color={colors.textMuted}>
                {plural(totals.lineCount, 'item', 'itens')}
                {totals.discountCents ? ` · descontos ${formatBRL(totals.discountCents)}` : ''}
              </T>
            </View>
            <Money cents={totals.totalCents} v="title" />
          </Row>
          <Row>
            <Button title="Escanear" icon="barcode-outline" kind="secondary" onPress={() => router.push('/scan')} style={{ flex: 1 }} />
            <Button title="Conferir nota" icon="receipt-outline" kind="confirm" onPress={() => router.push({ pathname: '/receipt/capture', params: { purchaseId: active.id } })} style={{ flex: 1 }} disabled={!cart.length} />
          </Row>
        </>
      }
    >
      <Card onPress={() => { setStore(active.storeName ?? ''); setStoreOpen(true); }} accessibilityLabel="Informar estabelecimento">
        <Row>
          <Ionicons name="storefront-outline" size={22} color={colors.navy} />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">{active.storeName || 'Informar o estabelecimento'}</T>
            <T v="small" color={colors.textMuted}>Ajuda a comparar preços entre supermercados</T>
          </View>
          <Ionicons name="create-outline" size={18} color={colors.textFaint} />
        </Row>
      </Card>

      {cart.length === 0 ? (
        <EmptyState icon="barcode-outline" title="Carrinho vazio" text="Escaneie o código de barras dos produtos ou adicione manualmente." />
      ) : (
        <Card style={{ paddingVertical: space.xs }}>
          {cart.map((item, i) => (
            <View key={item.id}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.item}>
                <Pressable style={{ flex: 1, gap: 3 }} onPress={() => router.push(`/item/${item.id}`)} accessibilityRole="button" accessibilityLabel={`Editar ${item.name}`}>
                  <T v="bodyStrong" numberOfLines={2}>{item.name}</T>
                  <T v="small" color={colors.textMuted}>
                    {[item.brand, item.packageLabel].filter(Boolean).join(' · ')}
                    {item.brand || item.packageLabel ? ' · ' : ''}
                    {formatBRL(item.unitPriceCents)}
                    {isWeighed(item.saleUnit) ? (item.saleUnit === 'kg' ? '/kg' : '/L') : ' cada'}
                  </T>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Pill label={PRICE_SOURCE_LABEL[item.priceSource]} t="neutral" />
                    {item.discountCents ? <Pill label={`Desconto ${formatBRL(item.discountCents)}`} t="green" /> : null}
                    <T v="small" color={colors.textFaint}>{fmtTime(item.createdAt)}</T>
                  </Row>
                </Pressable>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Money cents={itemNetCents(item)} />
                  {isWeighed(item.saleUnit) ? (
                    <Button title={formatQuantity(item.quantityMilli, item.saleUnit)} kind="secondary" compact onPress={() => router.push(`/item/${item.id}`)} />
                  ) : (
                    <Stepper
                      label={formatQuantity(item.quantityMilli, item.saleUnit)}
                      onMinus={() => change(item, -1)}
                      onPlus={() => change(item, 1)}
                      minusIcon={item.quantityMilli <= 1000 ? 'trash-outline' : 'remove'}
                    />
                  )}
                </View>
              </View>
            </View>
          ))}
        </Card>
      )}

      <Row>
        <Button title="Item sem código" icon="create-outline" kind="secondary" compact onPress={() => router.push({ pathname: '/item/add', params: { via: 'manual' } })} style={{ flex: 1 }} />
        <Button title="Encerrar" icon="flag-outline" kind="ghost" compact onPress={finish} style={{ flex: 1 }} />
      </Row>

      <Sheet visible={storeOpen} onClose={() => setStoreOpen(false)} title="Estabelecimento">
        <Field label="Nome do supermercado" value={store} onChangeText={setStore} placeholder="Ex.: Mercado do bairro" autoFocus autoCapitalize="words" />
        <Button
          title="Salvar"
          icon="checkmark"
          kind="confirm"
          onPress={async () => {
            await repo.updatePurchase(active.id, { storeName: store.trim() || null });
            setStoreOpen(false);
            bump();
          }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, alignItems: 'center' },
});
