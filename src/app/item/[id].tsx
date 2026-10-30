import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { validateItem } from '@/domain/cart';
import { centsToInput, formatBRL, parseBRL } from '@/domain/money';
import { PRICE_SOURCE_LABEL, type CartItem } from '@/domain/types';
import { formatQuantity, lineSubtotal, MILLI, parseQuantity, quantityToInput } from '@/domain/units';
import { fmtDateTime } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Card, Divider, Field, KeyValue, Loading, Money, Row, Screen, SectionTitle, Stepper, T } from '@/ui/components';
import { colors } from '@/ui/theme';

const FIELD_LABEL: Record<string, string> = {
  name: 'Nome',
  quantityMilli: 'Quantidade',
  unitPriceCents: 'Preço',
  discountCents: 'Desconto',
  priceSource: 'Origem do preço',
  saleUnit: 'Unidade de venda',
  promoNote: 'Promoção',
  productId: 'Produto',
};

export default function EditItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, bump } = useApp();
  const [item, setItem] = useState<CartItem | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [units, setUnits] = useState(1);
  const [weight, setWeight] = useState('');
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [promoNote, setPromoNote] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const { data: log } = useLoad(() => repo.listEditLog('cart_item', id), [id]);

  useEffect(() => {
    repo.getCartItem(id).then((it) => {
      setItem(it);
      if (!it) return;
      setName(it.name);
      setUnits(Math.max(1, Math.round(it.quantityMilli / MILLI)));
      setWeight(quantityToInput(it.quantityMilli, it.saleUnit));
      setPrice(centsToInput(it.unitPriceCents));
      setDiscount(it.discountCents ? centsToInput(it.discountCents) : '');
      setPromoNote(it.promoNote ?? '');
    });
  }, [id, repo]);

  if (item === undefined) return <Loading />;
  if (item === null) {
    return (
      <Screen>
        <Banner t="yellow" title="Item não encontrado">Ele pode ter sido removido.</Banner>
      </Screen>
    );
  }

  const quantityMilli = item.saleUnit === 'un' ? units * MILLI : parseQuantity(weight, item.saleUnit) ?? 0;
  const priceCents = parseBRL(price);
  const discountCents = discount ? parseBRL(discount) : 0;

  const save = async () => {
    const errs: string[] = [];
    if (priceCents == null) errs.push('Informe um preço válido.');
    if (discountCents == null) errs.push('Desconto inválido.');
    if (!errs.length) errs.push(...validateItem({ name, quantityMilli, unitPriceCents: priceCents!, discountCents: discountCents!, saleUnit: item.saleUnit }));
    setErrors(errs);
    if (errs.length) return;
    const priceChanged = priceCents !== item.unitPriceCents;
    await repo.updateCartItem(item.id, {
      name,
      quantityMilli,
      unitPriceCents: priceCents!,
      discountCents: discountCents!,
      promoNote: promoNote.trim() || null,
      priceSource: priceChanged ? 'manual' : item.priceSource,
    });
    if (quantityMilli !== item.quantityMilli) {
      await repo.logScanEvent({ purchaseId: item.purchaseId, type: 'quantity_changed', barcode: item.barcode, cartItemId: item.id, detail: `${item.quantityMilli} → ${quantityMilli}` });
    }
    bump();
    router.back();
  };

  const remove = () => {
    Alert.alert('Remover item?', `${item.name} será retirado do carrinho.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await repo.removeCartItem(item.id);
          await repo.logScanEvent({ purchaseId: item.purchaseId, type: 'item_removed', barcode: item.barcode, detail: item.name });
          bump();
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen
      footer={
        <>
          {priceCents != null && quantityMilli > 0 ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <T color={colors.textMuted}>Subtotal</T>
              <Money cents={Math.max(0, lineSubtotal(priceCents, quantityMilli) - (discountCents ?? 0))} />
            </Row>
          ) : null}
          <Button title="Salvar alterações" icon="checkmark" kind="confirm" onPress={save} />
        </>
      }
    >
      <Card>
        <Field label="Nome" value={name} onChangeText={setName} />
        {item.barcode ? <T v="small" color={colors.textFaint}>Código {item.barcode}</T> : null}
        <KeyValue label="Origem do preço" value={PRICE_SOURCE_LABEL[item.priceSource]} />
        <KeyValue label="Registrado em" value={fmtDateTime(item.createdAt)} />
        {item.productId ? <Button title="Histórico de preços do produto" icon="trending-up-outline" kind="secondary" compact onPress={() => router.push(`/product/${item.productId}`)} /> : null}
      </Card>
      <Card>
        {item.saleUnit === 'un' ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">Quantidade</T>
            <Stepper label={`${units} un`} onMinus={() => (units > 1 ? setUnits(units - 1) : remove())} onPlus={() => setUnits(units + 1)} minusIcon={units > 1 ? 'remove' : 'trash-outline'} />
          </Row>
        ) : (
          <Field label={item.saleUnit === 'kg' ? 'Peso (kg)' : 'Volume (L)'} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix={item.saleUnit === 'kg' ? 'kg' : 'L'} />
        )}
        <Field label={item.saleUnit === 'un' ? 'Preço por unidade' : item.saleUnit === 'kg' ? 'Preço por quilo' : 'Preço por litro'} value={price} onChangeText={setPrice} keyboardType="decimal-pad" prefix="R$" />
        <Field label="Desconto no item" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" prefix="R$" placeholder="0,00" />
        <Field label="Condições da promoção" value={promoNote} onChangeText={setPromoNote} placeholder="Opcional" />
      </Card>
      {errors.length ? (
        <Banner t="red" icon="alert-circle" title="Confira os dados">
          {errors.map((e) => <T key={e} v="small" color={colors.redText}>• {e}</T>)}
        </Banner>
      ) : null}
      <Button title="Remover do carrinho" icon="trash-outline" kind="danger" onPress={remove} />

      {log && log.length ? (
        <>
          <SectionTitle>Histórico de alterações</SectionTitle>
          <Card>
            {log.map((l, i) => (
              <View key={`${l.created_at}-${i}`} style={{ gap: 2 }}>
                {i > 0 ? <Divider /> : null}
                <T v="small" style={{ fontWeight: '600' }}>{FIELD_LABEL[l.field] ?? l.field} · {fmtDateTime(l.created_at)}</T>
                <T v="small" color={colors.textMuted}>{describe(l.field, l.old_value, item.saleUnit)} → {describe(l.field, l.new_value, item.saleUnit)}</T>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function describe(field: string, v: string | null, unit: CartItem['saleUnit']) {
  if (v == null || v === '') return '—';
  if (field === 'unitPriceCents' || field === 'discountCents') return formatBRL(Number(v));
  if (field === 'quantityMilli') return formatQuantity(Number(v), unit);
  if (field === 'priceSource') return PRICE_SOURCE_LABEL[v as keyof typeof PRICE_SOURCE_LABEL] ?? v;
  return v;
}
