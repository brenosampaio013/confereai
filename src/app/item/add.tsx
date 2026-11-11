import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { validateItem } from '@/domain/cart';
import { centsToInput, formatBRL, formatSignedBRL, parseBRL } from '@/domain/money';
import { compareWithLastPrice, PriceComparison } from '@/domain/priceHistory';
import type { PriceSource, Product } from '@/domain/types';
import { extractPackageMeasure, formatPackageMeasure, isWeighed, lineSubtotal, MILLI, parseQuantity, SaleUnit } from '@/domain/units';
import { persistProductPhoto } from '@/lib/files';
import { fmtDate } from '@/lib/format';
import { newId } from '@/lib/id';
import { lookupPublicProduct, ProductSuggestion } from '@/services/productLookup';
import { useApp } from '@/state/AppContext';
import { handoff } from '@/state/handoff';
import { Banner, Button, Card, Field, Loading, Money, Pill, Row, Screen, Segmented, Stepper, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';
import { showAlert } from '@/lib/dialog';
import { budgetMessage, budgetStatus } from '@/domain/budget';
import { StoreChoice, StoreSheet } from '@/ui/StoreSheet';

export default function AddItem() {
  const params = useLocalSearchParams<{ barcode?: string; via?: string; newLine?: string; capture?: string }>();
  const barcode = params.barcode && /^\d{6,14}$/.test(params.barcode) ? params.barcode : null;
  const via = params.via === 'manual' ? 'manual' : 'scan';
  const { repo, ensureActivePurchase, bump, active, budget, thresholds } = useApp();

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [suggestion, setSuggestion] = useState<ProductSuggestion | null>(null);
  const [editingProduct, setEditingProduct] = useState(false);
  const [usedSuggestion, setUsedSuggestion] = useState<'open_food_facts' | 'community' | null>(null);
  const [priceOnlyStore, setPriceOnlyStore] = useState<StoreChoice>({ name: null, locationId: null });

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [pkg, setPkg] = useState('');
  const [saleUnit, setSaleUnit] = useState<SaleUnit>('un');
  const [units, setUnits] = useState(1);
  const [weight, setWeight] = useState('');
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [promoNote, setPromoNote] = useState('');
  const [priceSource, setPriceSource] = useState<PriceSource>('manual');
  const [photo, setPhoto] = useState<string | null>(null);
  const [comparison, setComparison] = useState<PriceComparison | null>(null);
  const [labelInfo, setLabelInfo] = useState<string[]>([]);
  const [promoOption, setPromoOption] = useState<{ cents: number; conditions: string[] } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [regularCents, setRegularCents] = useState<number | null>(null);
  const [fromPhoto, setFromPhoto] = useState<{ association: string; uncertain: string[] } | null>(null);
  const [priceOnlyOpen, setPriceOnlyOpen] = useState(false);
  const ownToken = useRef(newId()).current;
  // Vindo da tela de foto do produto, o resultado chega pelo token recebido na rota.
  const labelToken = params.capture ?? ownToken;

  useEffect(() => {
    (async () => {
      const p = barcode ? await repo.getProductByBarcode(barcode) : null;
      if (p) {
        setProduct(p);
        setName(p.name);
        setBrand(p.brand ?? '');
        setPkg(p.packageAmount && p.packageUnit ? formatPackageMeasure({ amount: p.packageAmount, unit: p.packageUnit }) : '');
        setSaleUnit(p.saleUnit);
        setPhoto(p.imageUri);
        const history = await repo.listPriceHistory(p.id);
        const purchase = await repo.getActivePurchase();
        const last = history.find((h) => h.saleUnit === p.saleUnit && h.purchaseId !== purchase?.id);
        if (last) setComparison(compareWithLastPrice(history, p.id, p.saleUnit, last.unitPriceCents, { excludePurchaseId: purchase?.id }));
      } else {
        setEditingProduct(true);
        if (barcode) {
          const s = await lookupPublicProduct(barcode);
          if (s) setSuggestion(s);
        }
      }
      setLoading(false);
    })();
  }, [barcode, repo]);

  // Resultado da leitura de etiqueta (tela /label)
  useFocusEffect(
    useCallback(() => {
      const r = handoff.takeLabel(labelToken);
      if (!r) return;
      const notes: string[] = [...r.notes];
      const source: PriceSource = 'association' in r ? 'photo_ai' : 'label_ocr';
      if ('association' in r) {
        setFromPhoto({ association: r.association, uncertain: r.uncertain });
        const shot = handoff.takePhoto(labelToken);
        if (shot && !photo) setPhoto(shot);
        if (!brand && r.brand) setBrand(r.brand);
      }
      if (r.soldByWeight) setSaleUnit(r.referencePrice?.per === 'l' ? 'l' : 'kg');
      if (r.soldByWeight && r.referencePrice) {
        setPrice(centsToInput(r.referencePrice.cents));
        setPriceSource(source);
      } else if (r.regularPriceCents != null) {
        setPrice(centsToInput(r.regularPriceCents));
        setPriceSource(source);
      } else if (r.promoPriceCents != null) {
        setPrice(centsToInput(r.promoPriceCents));
        setPriceSource(source);
      }
      setRegularCents(null);
      if (r.promoPriceCents != null && r.regularPriceCents != null) setPromoOption({ cents: r.promoPriceCents, conditions: r.promoConditions });
      if (r.referencePrice && !r.soldByWeight) {
        notes.push(`Preço de referência: ${formatBRL(r.referencePrice.cents)} por ${r.referencePrice.per === 'l' ? 'litro' : r.referencePrice.per}.`);
      }
      if (!name && r.productName) setName(titleCase(r.productName));
      if (!pkg && r.packageMeasure) setPkg(formatPackageMeasure(r.packageMeasure));
      setLabelInfo(notes);
    }, [labelToken, name, pkg, brand, photo]),
  );

  const applySuggestion = () => {
    if (!suggestion) return;
    setName(suggestion.name);
    setBrand(suggestion.brand ?? '');
    if (suggestion.packageMeasure) setPkg(formatPackageMeasure(suggestion.packageMeasure));
    setUsedSuggestion(suggestion.source);
    setSuggestion(null);
  };

  const quantityMilli = useMemo(() => {
    if (saleUnit === 'un') return units * MILLI;
    return parseQuantity(weight, saleUnit) ?? 0;
  }, [saleUnit, units, weight]);
  const priceCents = parseBRL(price);
  const discountCents = discount ? parseBRL(discount) : 0;
  const subtotal = priceCents != null && quantityMilli > 0 ? lineSubtotal(priceCents, quantityMilli) - (discountCents ?? 0) : null;
  const diffVsLast = comparison && priceCents != null ? priceCents - comparison.previous.unitPriceCents : null;

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert('Câmera indisponível', 'Permita o acesso à câmera nas configurações para fotografar a embalagem.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!r.canceled && r.assets[0]) setPhoto(r.assets[0].uri);
  };

  /** Valida o formulário e garante o cadastro do produto (reaproveita um igual sem código de barras). */
  const prepare = async (): Promise<Product | null> => {
    const errs: string[] = [];
    if (priceCents == null) errs.push('Informe o preço (ex.: 5,49).');
    if (discount && discountCents == null) errs.push('Desconto inválido.');
    const candidate = {
      name,
      quantityMilli,
      unitPriceCents: priceCents ?? -1,
      discountCents: discountCents ?? 0,
      saleUnit,
    };
    errs.push(...validateItem(candidate).filter((e) => !(priceCents == null && e.includes('preço'))));
    setErrors(errs);
    if (errs.length) return null;
    const measure = extractPackageMeasure(pkg);
    let prod = product;
    if (!prod && !barcode) prod = await repo.findProductByIdentity(name.trim(), brand.trim() || null, measure?.amount ?? null, measure?.unit ?? null, saleUnit);
    const productChanged =
      !prod ||
      prod.name !== name.trim() ||
      (prod.brand ?? '') !== brand.trim() ||
      prod.saleUnit !== saleUnit ||
      (prod.imageUri ?? null) !== (photo ?? prod.imageUri ?? null) ||
      (measure?.amount ?? null) !== prod.packageAmount;
    if (productChanged) {
      const imageUri = photo && photo !== prod?.imageUri ? await persistProductPhoto(photo) : photo ?? prod?.imageUri ?? null;
      prod = await repo.saveProduct({
        id: prod?.id,
        barcode: prod?.barcode ?? barcode,
        name: name.trim(),
        brand: brand.trim() || null,
        category: prod?.category ?? null,
        packageAmount: measure?.amount ?? null,
        packageUnit: measure?.unit ?? null,
        saleUnit,
        imageUri,
        source: prod?.source ?? (usedSuggestion ?? 'user'),
      });
    }
    return prod;
  };

  const effectiveRegular = regularCents != null && priceCents != null && regularCents > priceCents ? regularCents : null;

  const save = async () => {
    setSaving(true);
    try {
      const prod = await prepare();
      if (!prod) return;
      const purchase = await ensureActivePurchase();
      const item = await repo.addCartItem({
        purchaseId: purchase.id,
        productId: prod.id,
        barcode: prod.barcode ?? barcode,
        name: name.trim(),
        brand: brand.trim() || null,
        packageLabel: pkg.trim() || null,
        saleUnit,
        quantityMilli,
        unitPriceCents: priceCents!,
        discountCents: discountCents ?? 0,
        priceSource,
        regularPriceCents: effectiveRegular,
        promoNote: promoNote.trim() || null,
        addedVia: via,
      });
      if (!barcode) await repo.logScanEvent({ purchaseId: purchase.id, type: 'manual_entry', cartItemId: item.id, detail: fromPhoto ? 'Produto identificado por foto' : 'Produto sem código adicionado manualmente' });
      bump();
      router.back();
    } catch (e) {
      showAlert('Não foi possível salvar', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  /** Guarda só o preço visto (histórico de preços), sem colocar o produto no carrinho. */
  const savePriceOnly = async (store: StoreChoice) => {
    setPriceOnlyOpen(false);
    setSaving(true);
    try {
      const prod = await prepare();
      if (!prod) return;
      await repo.recordPriceObservation({
        productId: prod.id,
        storeName: store.name,
        storeLocationId: store.locationId,
        saleUnit,
        unitPriceCents: priceCents!,
        regularPriceCents: effectiveRegular,
        promo: !!promoNote.trim() || effectiveRegular != null,
        source: priceSource,
      });
      if (store.name) await repo.setSetting('last_store', JSON.stringify(store));
      bump();
      router.replace(`/product/${prod.id}`);
    } catch (e) {
      showAlert('Não foi possível salvar', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const openPriceOnly = async () => {
    if (priceCents == null || !name.trim()) {
      setErrors(['Informe o nome do produto e o preço antes de registrar.']);
      return;
    }
    let initial: StoreChoice = { name: active?.storeName ?? null, locationId: active?.storeLocationId ?? null };
    if (!initial.name) {
      try {
        const last = await repo.getSetting('last_store');
        if (last) initial = JSON.parse(last) as StoreChoice;
      } catch {
        // preferência antiga ilegível: começa em branco
      }
    }
    setPriceOnlyStore(initial);
    setPriceOnlyOpen(true);
  };

  // Efeito deste item no orçamento, antes de adicionar.
  const budgetAfter = budget && subtotal != null && subtotal >= 0 ? budgetStatus(budget.budgetCents, budget.spentCents + subtotal, thresholds) : null;

  if (loading) return <Loading text="Buscando produto…" />;

  return (
    <Screen
      footer={
        <>
          {subtotal != null && subtotal >= 0 ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <T color={colors.textMuted}>Subtotal do item</T>
              <Money cents={subtotal} />
            </Row>
          ) : null}
          {budgetAfter && budgetAfter.level !== 'ok' ? (
            <T v="small" color={budgetAfter.level === 'attention' || budgetAfter.level === 'near' ? colors.yellowText : colors.redText}>
              Com este item: {budgetMessage(budgetAfter)}
            </T>
          ) : null}
          <Button title="Adicionar ao carrinho" icon="checkmark" kind="confirm" onPress={save} loading={saving} />
          <Row>
            <Button title="Só registrar o preço" icon="pricetag-outline" kind="secondary" compact onPress={openPriceOnly} style={{ flex: 1 }} />
            <Button title="Cancelar" kind="ghost" compact onPress={() => router.back()} style={{ flex: 1 }} />
          </Row>
        </>
      }
    >
      {fromPhoto ? (
        <Banner t={fromPhoto.association === 'match' ? 'navy' : 'yellow'} icon="sparkles-outline" title="Dados lidos da foto — confira antes de salvar">
          {fromPhoto.association === 'match' ? 'A etiqueta parece ser deste produto.' : 'Não foi possível confirmar que a etiqueta é deste produto.'}
          {fromPhoto.uncertain.length ? ` Leitura incerta em: ${fromPhoto.uncertain.join(', ')}.` : ''}
        </Banner>
      ) : null}
      {product && !editingProduct ? (
        <Card>
          <Row style={{ alignItems: 'flex-start' }}>
            {photo ? <Image source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: 10 }} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <Pill label="Produto encontrado no seu cadastro" t="green" icon="checkmark-circle" />
              <T v="heading" style={{ marginTop: 6 }}>{product.name}</T>
              <T color={colors.textMuted}>{[product.brand, pkg].filter(Boolean).join(' · ') || 'Sem marca/embalagem informadas'}</T>
              {barcode ? <T v="small" color={colors.textFaint}>Código {barcode}</T> : null}
            </View>
          </Row>
          <Button title="Corrigir dados do produto" icon="create-outline" kind="secondary" compact onPress={() => setEditingProduct(true)} />
        </Card>
      ) : (
        <View style={{ gap: space.md }}>
          {!product ? (
            <Banner t="yellow" icon="help-circle-outline" title={barcode ? 'Produto ainda não cadastrado' : 'Cadastro manual'}>
              {barcode
                ? `O código ${barcode} não está no seu cadastro. Informe os dados da embalagem; o código ficará associado ao produto quando você confirmar.`
                : 'Informe os dados do produto.'}
            </Banner>
          ) : null}
          {suggestion ? (
            <Card>
              <T v="caption" color={colors.textMuted} style={{ textTransform: 'uppercase' }}>{suggestion.source === 'community' ? 'Sugestão da comunidade do Confere Aí' : 'Sugestão da base pública Open Food Facts'}</T>
              <T v="bodyStrong">{suggestion.name}</T>
              <T v="small" color={colors.textMuted}>{[suggestion.brand, suggestion.quantityText].filter(Boolean).join(' · ')}</T>
              <T v="small" color={colors.textMuted}>Base colaborativa: confira se corresponde à embalagem em mãos.</T>
              <Row>
                <Button title="Usar sugestão" kind="secondary" compact onPress={applySuggestion} style={{ flex: 1 }} />
                <Button title="Ignorar" kind="ghost" compact onPress={() => setSuggestion(null)} style={{ flex: 1 }} />
              </Row>
            </Card>
          ) : null}
          <Field label="Nome do produto" value={name} onChangeText={setName} placeholder="Ex.: Arroz branco tipo 1" autoCapitalize="sentences" />
          <Field label="Marca (opcional)" value={brand} onChangeText={setBrand} placeholder="Ex.: Marca do produto" autoCapitalize="words" />
          <Field label="Peso ou volume da embalagem" value={pkg} onChangeText={setPkg} placeholder="Ex.: 5 kg, 900 ml, 12 un" hint="Embalagens de tamanhos diferentes são tratadas como produtos diferentes." />
          <Row>
            {photo ? <Image source={{ uri: photo }} style={{ width: 52, height: 52, borderRadius: 10 }} /> : null}
            <Button title={photo ? 'Trocar foto da embalagem' : 'Fotografar embalagem (opcional)'} icon="camera-outline" kind="secondary" compact onPress={takePhoto} style={{ flex: 1 }} />
          </Row>
        </View>
      )}

      <Segmented
        label="Como é vendido"
        value={saleUnit}
        onChange={(v) => setSaleUnit(v)}
        options={[
          { value: 'un', label: 'Por unidade' },
          { value: 'kg', label: 'Por quilo' },
          { value: 'l', label: 'Por litro' },
        ]}
      />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="heading">Preço</T>
          <Button title="Ler etiqueta" icon="pricetag-outline" kind="secondary" compact onPress={() => router.push({ pathname: '/label', params: { token: labelToken } })} />
        </Row>
        <Field
          label={saleUnit === 'un' ? 'Preço por unidade' : saleUnit === 'kg' ? 'Preço por quilo (R$/kg)' : 'Preço por litro (R$/L)'}
          value={price}
          onChangeText={(s) => {
            setPrice(s);
            setPriceSource('manual');
            setRegularCents(null);
          }}
          keyboardType="decimal-pad"
          prefix="R$"
          placeholder="0,00"
          testID="price-input"
        />
        {priceSource !== 'manual' ? <Pill label={priceSource === 'label_ocr' ? 'Preço lido da etiqueta (confira)' : priceSource === 'photo_ai' ? 'Preço lido da foto (confira)' : 'Preço anterior reconfirmado'} t="navy" icon="information-circle-outline" /> : null}
        {effectiveRegular != null ? <Pill label={`Promoção: preço normal ${formatBRL(effectiveRegular)}`} t="green" icon="pricetags-outline" /> : null}
        {promoOption ? (
          <Banner t="yellow" icon="pricetags-outline" title={`Preço promocional na etiqueta: ${formatBRL(promoOption.cents)}`}>
            <T v="small" color={colors.yellowText}>
              {promoOption.conditions.length ? `Condições: ${promoOption.conditions.join('; ')}. ` : 'Nenhuma condição foi lida. '}
              Use o preço promocional apenas se você atende às condições da oferta.
            </T>
            <Button
              title="Usar preço promocional"
              kind="secondary"
              compact
              onPress={() => {
                setRegularCents(priceCents);
                setPrice(centsToInput(promoOption.cents));
                setPriceSource(fromPhoto ? 'photo_ai' : 'label_ocr');
                setPromoNote(promoOption.conditions.join('; ') || 'Preço promocional da etiqueta');
                setPromoOption(null);
              }}
            />
          </Banner>
        ) : null}
        {labelInfo.map((n) => (
          <T key={n} v="small" color={colors.textMuted}>• {n}</T>
        ))}
        {comparison ? (
          <View style={{ gap: 6, paddingTop: space.sm }}>
            <T v="small" color={colors.textMuted}>
              Último preço registrado: {formatBRL(comparison.previous.unitPriceCents)} em {fmtDate(comparison.previous.recordedAt)}
              {comparison.previous.storeName ? ` (${comparison.previous.storeName})` : ''}.
            </T>
            {diffVsLast != null && diffVsLast !== 0 ? (
              <Pill label={`Variação em relação ao último registro: ${formatSignedBRL(diffVsLast)}`} t={diffVsLast > 0 ? 'yellow' : 'green'} />
            ) : null}
            {!price ? (
              <Button
                title={`Confirmar preço anterior (${formatBRL(comparison.previous.unitPriceCents)})`}
                kind="secondary"
                compact
                onPress={() => {
                  setPrice(centsToInput(comparison.previous.unitPriceCents));
                  setPriceSource('previous');
                }}
              />
            ) : null}
            <T v="small" color={colors.textFaint}>Só confirme se o preço da etiqueta hoje for o mesmo.</T>
          </View>
        ) : null}
      </Card>

      <Card>
        <T v="heading">Quantidade</T>
        {saleUnit === 'un' ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <T color={colors.textMuted}>Unidades</T>
            <Stepper label={`${units} un`} onMinus={() => setUnits((u) => Math.max(1, u - 1))} onPlus={() => setUnits((u) => u + 1)} />
          </Row>
        ) : (
          <Field
            label={saleUnit === 'kg' ? 'Peso (kg)' : 'Volume (L)'}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder={saleUnit === 'kg' ? 'Ex.: 1,250' : 'Ex.: 0,500'}
            suffix={saleUnit === 'kg' ? 'kg' : 'L'}
            hint="Use o peso da etiqueta da balança. O valor final depende da pesagem no caixa."
          />
        )}
        <Field label="Desconto no item (opcional)" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" prefix="R$" placeholder="0,00" hint="Valor total de desconto deste item, se houver." />
        {discount || promoNote ? <Field label="Condições da promoção" value={promoNote} onChangeText={setPromoNote} placeholder="Ex.: leve 3 pague 2, cartão fidelidade" /> : null}
      </Card>

      {isWeighed(saleUnit) && pkg ? (
        <Banner t="navy" icon="scale-outline">Produto vendido por peso: o preço informado deve ser o preço por quilo/litro, não o da embalagem.</Banner>
      ) : null}

      {errors.length ? (
        <Banner t="red" icon="alert-circle" title="Confira os dados">
          {errors.map((e) => (
            <T key={e} v="small" color={colors.redText}>• {e}</T>
          ))}
        </Banner>
      ) : null}
      <StoreSheet visible={priceOnlyOpen} onClose={() => setPriceOnlyOpen(false)} initial={priceOnlyStore} onSave={savePriceOnly} />
    </Screen>
  );
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
