import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { adjustQuantity, itemNetCents, quantityStep } from '@/domain/cart';
import { formatBRL } from '@/domain/money';
import { PRICE_SOURCE_LABEL, type CartItem } from '@/domain/types';
import { formatQuantity, isWeighed } from '@/domain/units';
import { fmtTime, plural } from '@/lib/format';
import { useApp } from '@/state/AppContext';
import { BudgetCard, BudgetSheet } from '@/ui/Budget';
import { Button, Card, Divider, EmptyState, Money, Pill, Row, Screen, Stepper, T } from '@/ui/components';
import { StoreSheet } from '@/ui/StoreSheet';
import { colors, space } from '@/ui/theme';
import { useState } from 'react';
import { showAlert } from '@/lib/dialog';

export default function CartScreen() {
  const { repo, active, cart, totals, bump, budget, thresholds, setThresholds } = useApp();
  const [storeOpen, setStoreOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  if (!active) {
    return (
      <Screen>
        <EmptyState
          icon="cart-outline"
          title="Nenhuma compra em andamento"
          text="Inicie uma compra para registrar os produtos enquanto passa pelo supermercado."
          action={
            <Button title="Nova compra" icon="add-circle" onPress={() => setBudgetOpen(true)} style={{ alignSelf: 'stretch', marginTop: space.md }} />
          }
        />
        <BudgetSheet
          visible={budgetOpen}
          onClose={() => setBudgetOpen(false)}
          initialCents={null}
          thresholds={thresholds}
          startLabel="Começar a compra"
          onSave={async (cents, t) => {
            await setThresholds(t);
            await repo.startPurchase('cart', null, cents);
            setBudgetOpen(false);
            bump();
            router.push('/scan');
          }}
        />
      </Screen>
    );
  }

  const change = async (item: CartItem, dir: 1 | -1) => {
    const next = adjustQuantity(item, dir * quantityStep(item));
    if (next == null) {
      showAlert('Remover item?', `${item.name} será retirado do carrinho.`, [
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
    showAlert('Encerrar compra sem conferir a nota?', 'A compra fica salva em Minhas compras e você pode conferir a nota depois.', [
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
      {budget ? (
        <BudgetCard status={budget} onEdit={() => setBudgetOpen(true)} />
      ) : (
        <Card onPress={() => setBudgetOpen(true)} accessibilityLabel="Definir orçamento da compra">
          <Row>
            <Ionicons name="wallet-outline" size={22} color={colors.navy} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">Definir orçamento</T>
              <T v="small" color={colors.textMuted}>Informe quanto pretende gastar e acompanhe o saldo a cada produto</T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Row>
        </Card>
      )}

      <Card onPress={() => setStoreOpen(true)} accessibilityLabel="Informar estabelecimento">
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
        <Button title="Foto do produto" icon="camera-outline" kind="secondary" compact onPress={() => router.push('/capture')} style={{ flex: 1 }} />
        <Button title="Item sem código" icon="create-outline" kind="secondary" compact onPress={() => router.push({ pathname: '/item/add', params: { via: 'manual' } })} style={{ flex: 1 }} />
      </Row>
      <Row>
        <Button title="Encerrar" icon="flag-outline" kind="ghost" compact onPress={finish} style={{ flex: 1 }} />
      </Row>

      <StoreSheet
        visible={storeOpen}
        onClose={() => setStoreOpen(false)}
        initial={{ name: active.storeName, locationId: active.storeLocationId }}
        onSave={async (c) => {
          await repo.updatePurchase(active.id, { storeName: c.name, storeLocationId: c.locationId });
          setStoreOpen(false);
          bump();
        }}
      />
      <BudgetSheet
        visible={budgetOpen}
        onClose={() => setBudgetOpen(false)}
        initialCents={active.budgetCents}
        thresholds={thresholds}
        onSave={async (cents, t) => {
          await setThresholds(t);
          await repo.updatePurchase(active.id, { budgetCents: cents });
          setBudgetOpen(false);
          bump();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, alignItems: 'center' },
});
