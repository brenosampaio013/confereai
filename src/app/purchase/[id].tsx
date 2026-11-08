import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { itemNetCents } from '@/domain/cart';
import { formatBRL } from '@/domain/money';
import { PRICE_SOURCE_LABEL } from '@/domain/types';
import { formatQuantity } from '@/domain/units';
import { fmtDateTime } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Card, Divider, Field, KeyValue, Loading, Money, Row, Screen, SectionTitle, Sheet, T } from '@/ui/components';
import { purchaseStatusPill } from '@/ui/PurchaseRow';
import { colors, space } from '@/ui/theme';
import { showAlert } from '@/lib/dialog';

const EVENT_LABEL: Record<string, string> = {
  scan_new: 'Produto lido',
  scan_technical_repeat: 'Leitura repetida pela câmera ignorada',
  scan_intentional_repeat: 'Produto lido novamente',
  manual_entry: 'Código/produto digitado',
  quantity_increment_confirmed: 'Mais uma unidade confirmada',
  scan_cancelled: 'Leitura cancelada',
  scan_corrected: 'Leitura corrigida',
  item_removed: 'Item removido',
  quantity_changed: 'Quantidade alterada',
};

export default function PurchaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, bump, version } = useApp();
  const [storeOpen, setStoreOpen] = useState(false);
  const [store, setStore] = useState('');
  const [showEvents, setShowEvents] = useState(false);
  const { data } = useLoad(async () => {
    const s = await repo.getPurchaseSummary(id);
    if (!s) return null;
    const items = await repo.listCartItems(id);
    const receiptId = await repo.getLatestReceiptId(id);
    const events = await repo.listScanEvents(id);
    return { s, items, receiptId, events };
  }, [id, version]);

  if (data === undefined) return <Loading />;
  if (data === null) return <Screen><Banner t="yellow" title="Compra não encontrada">Ela pode ter sido excluída.</Banner></Screen>;
  const { s, items, receiptId, events } = data;
  const p = s.purchase;

  const del = () => {
    showAlert('Excluir esta compra?', 'Os produtos, a leitura do cupom e o relatório desta compra serão excluídos deste aparelho e da nuvem (se sincronizados). Os produtos cadastrados continuam disponíveis.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await repo.deletePurchase(id);
          bump();
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="title" style={{ flex: 1 }}>{p.storeName || (p.mode === 'cart' ? 'Compra' : 'Conferência de nota')}</T>
          <Button title="Editar" kind="ghost" compact onPress={() => { setStore(p.storeName ?? ''); setStoreOpen(true); }} />
        </Row>
        {purchaseStatusPill(s)}
        <KeyValue label="Início" value={fmtDateTime(p.startedAt)} />
        {p.mode === 'cart' ? <KeyValue label="Total registrado" value={formatBRL(s.cartTotalCents)} /> : null}
        <KeyValue label="Total da nota" value={s.receiptTotalCents != null ? formatBRL(s.receiptTotalCents) : 'Nota não conferida'} strong />
      </Card>

      {s.latestReportId ? (
        <Button title="Ver relatório da conferência" icon="shield-checkmark-outline" onPress={() => router.push(`/report/${s.latestReportId}`)} />
      ) : null}
      {receiptId ? (
        <Button title={s.receiptStatus === 'draft' ? 'Continuar revisão do cupom' : 'Ver leitura do cupom'} icon="document-text-outline" kind="secondary" onPress={() => router.push(`/receipt/${receiptId}`)} />
      ) : p.mode === 'cart' ? (
        <Button title="Conferir a nota desta compra" icon="receipt-outline" kind="confirm" onPress={() => router.push({ pathname: '/receipt/capture', params: { purchaseId: id } })} />
      ) : null}

      {p.mode === 'cart' ? (
        <>
          <SectionTitle>Produtos registrados ({items.length})</SectionTitle>
          <Card style={{ paddingVertical: space.xs }}>
            {items.length === 0 ? <T color={colors.textMuted} style={{ paddingVertical: space.md }}>Nenhum produto.</T> : null}
            {items.map((it, i) => (
              <View key={it.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable onPress={() => router.push(`/item/${it.id}`)} style={{ flexDirection: 'row', paddingVertical: space.md, gap: space.md, alignItems: 'center' }} accessibilityRole="button" accessibilityLabel={`Editar ${it.name}`}>
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong" numberOfLines={1}>{it.name}</T>
                    <T v="small" color={colors.textMuted}>{formatQuantity(it.quantityMilli, it.saleUnit)} × {formatBRL(it.unitPriceCents)} · {PRICE_SOURCE_LABEL[it.priceSource]}</T>
                  </View>
                  <Money cents={itemNetCents(it)} />
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {events.length ? (
        <>
          <SectionTitle action={<Button title={showEvents ? 'Ocultar' : 'Mostrar'} kind="ghost" compact onPress={() => setShowEvents(!showEvents)} />}>Registro de leituras ({events.length})</SectionTitle>
          {showEvents ? (
            <Card>
              {events.map((e, i) => (
                <View key={`${e.created_at}-${i}`}>
                  <T v="small" style={{ fontWeight: '600' }}>{EVENT_LABEL[e.type] ?? e.type}</T>
                  <T v="small" color={colors.textMuted}>{fmtDateTime(e.created_at)}{e.barcode ? ` · ${e.barcode}` : ''}{e.detail ? ` · ${e.detail}` : ''}</T>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <Button title="Excluir compra" icon="trash-outline" kind="danger" onPress={del} />

      <Sheet visible={storeOpen} onClose={() => setStoreOpen(false)} title="Estabelecimento">
        <Field label="Nome do supermercado" value={store} onChangeText={setStore} autoCapitalize="words" autoFocus />
        <Button title="Salvar" icon="checkmark" kind="confirm" onPress={async () => { await repo.updatePurchase(id, { storeName: store.trim() || null }); setStoreOpen(false); bump(); }} />
      </Sheet>
    </Screen>
  );
}
