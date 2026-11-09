import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, View } from 'react-native';
import {
  addDays, CATEGORIES, CONDITIONS, ConditionType, distanceMeters, emptyDraft, formatDateBR, formatDistance, formatOfferPrice, IMAGE_TYPES,
  ImageType, LOCATION_MESSAGE, localToday, MAX_PHOTOS, parseDateBR, previewLocationStatus, PRODUCT_TYPES, PromotionDraft, SALE_UNITS,
  STATUS_LABEL, validatePickedImage, validateStep,
} from '@/domain/marketplace';
import { centsToInput, parseBRL } from '@/domain/money';
import type { Product } from '@/domain/types';
import { formatPackageMeasure } from '@/domain/units';
import { isCloudConfigured } from '@/lib/config';
import { showAlert } from '@/lib/dialog';
import { locationPermissionView } from '@/lib/permissions';
import { useForegroundPermissions, watchAccurateFix } from '@/services/location';
import { findSimilar, GpsFix, hasAccount, listStores, MarketplaceError, publishOffer, PublishResult, StoreLocation, suggestStore } from '@/services/marketplace';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Card, Field, IconButton, Loading, Pill, Row, Screen, Segmented, Sheet, T } from '@/ui/components';
import { ImageCropper, Picked } from '@/ui/market/ImageCropper';
import { PickLocationMap, mapAvailable } from '@/ui/market/OffersMap';
import { colors, radius, space, tone } from '@/ui/theme';

const STEPS = ['Produto', 'Fotos', 'Preço', 'Supermercado', 'Localização'] as const;
const STEP_KEYS = ['product', 'photos', 'price', 'store'] as const;

export default function PublishOffer() {
  const [account, setAccount] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  const [d, setD] = useState<PromotionDraft>(() => emptyDraft());
  const [store, setStore] = useState<StoreLocation | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<PublishResult | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const set = (patch: Partial<PromotionDraft>) => setD((x) => ({ ...x, ...patch }));

  useEffect(() => {
    hasAccount().then(setAccount);
  }, []);

  if (!isCloudConfigured()) {
    return <Screen><Banner t="yellow" icon="cloud-offline-outline" title="Marketplace indisponível">O servidor do Confere Aí ainda não foi configurado neste aplicativo.</Banner></Screen>;
  }
  if (account === null) return <Loading />;
  if (!account) {
    return (
      <Screen>
        <Banner t="navy" icon="person-circle-outline" title="Entre para publicar">
          Publicar ofertas exige uma conta: assim é possível evitar spam e construir a reputação de quem colabora. Para ver as ofertas, a conta não é necessária.
        </Banner>
        <Button title="Entrar ou criar conta" icon="log-in-outline" onPress={() => router.push('/auth')} />
      </Screen>
    );
  }
  if (result) return <PublishedView result={result} />;

  const next = () => {
    const errs = step < 4 ? validateStep(STEP_KEYS[step], d) : [];
    setErrors(errs);
    if (errs.length) return;
    setStep(step + 1);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.stepper}>
        {STEPS.map((s, i) => (
          <Pressable key={s} style={styles.stepItem} onPress={() => i < step && setStep(i)} accessibilityRole="button" accessibilityLabel={`Etapa ${i + 1}: ${s}`} accessibilityState={{ selected: i === step }}>
            <View style={[styles.dot, i <= step && { backgroundColor: i < step ? colors.green : colors.navy, borderColor: i < step ? colors.green : colors.navy }]}>
              {i < step ? <Ionicons name="checkmark" size={14} color={colors.white} /> : <T v="small" color={i === step ? colors.white : colors.textMuted} style={{ fontWeight: '700' }}>{i + 1}</T>}
            </View>
            <T v="small" center color={i === step ? colors.navy : colors.textMuted} style={{ fontSize: 11.5, fontWeight: i === step ? '700' : '500' }} numberOfLines={1}>{s}</T>
          </Pressable>
        ))}
      </View>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {step === 0 ? <ProductStep d={d} set={set} /> : null}
        {step === 1 ? <PhotosStep d={d} set={set} /> : null}
        {step === 2 ? <PriceStep d={d} set={set} /> : null}
        {step === 3 ? <StoreStep d={d} set={set} store={store} setStore={setStore} /> : null}
        {step === 4 && store ? <LocationStep d={d} store={store} onPublished={setResult} /> : null}
        {errors.length ? (
          <Banner t="red" icon="alert-circle" title="Falta pouco">
            {errors.map((e) => <T key={e} v="small" color={colors.redText}>• {e}</T>)}
          </Banner>
        ) : null}
      </ScrollView>
      {step < 4 ? (
        <View style={styles.footer}>
          {step > 0 ? <Button title="Voltar" kind="secondary" onPress={() => { setErrors([]); setStep(step - 1); }} style={{ flex: 1 }} /> : null}
          <Button title="Continuar" icon="arrow-forward" onPress={next} style={{ flex: 2 }} />
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------ Etapa 1 ------------------------------ */

function ProductStep({ d, set }: { d: PromotionDraft; set: (p: Partial<PromotionDraft>) => void }) {
  const { repo } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  useEffect(() => {
    repo.listProducts().then(setProducts);
  }, [repo]);
  const matches = search.trim().length >= 2 ? products.filter((p) => `${p.name} ${p.brand ?? ''}`.toLowerCase().includes(search.toLowerCase())).slice(0, 5) : [];
  return (
    <>
      <T v="title">Qual é o produto?</T>
      {products.length ? (
        <Card>
          <Field label="Buscar nos produtos que você já cadastrou" value={search} onChangeText={setSearch} placeholder="Ex.: arroz" />
          {matches.map((p) => (
            <Button
              key={p.id}
              title={[p.name, p.brand].filter(Boolean).join(' · ')}
              kind="secondary"
              compact
              onPress={() => {
                set({
                  productName: p.name, brand: p.brand ?? '', barcode: p.barcode ?? '',
                  packageLabel: p.packageAmount && p.packageUnit ? formatPackageMeasure({ amount: p.packageAmount, unit: p.packageUnit }) : '',
                  productType: p.saleUnit === 'un' ? 'packaged' : 'weighed', saleUnit: p.saleUnit === 'un' ? 'un' : p.saleUnit === 'kg' ? 'kg' : 'l',
                });
                setSearch('');
              }}
            />
          ))}
        </Card>
      ) : null}
      <Field label="Nome do produto" value={d.productName} onChangeText={(v) => set({ productName: v })} placeholder="Ex.: Acém bovino" autoCapitalize="sentences" />
      <Field label="Marca (opcional)" value={d.brand} onChangeText={(v) => set({ brand: v })} autoCapitalize="words" />
      <View style={{ gap: 6 }}>
        <T v="small" style={{ fontWeight: '600' }}>Categoria</T>
        <View style={styles.wrap}>
          {CATEGORIES.map((c) => (
            <Pressable key={c.id} onPress={() => set({ category: c.id })} style={[styles.choice, d.category === c.id && { backgroundColor: c.color, borderColor: c.color }]} accessibilityRole="radio" accessibilityState={{ selected: d.category === c.id }}>
              <Ionicons name={c.icon as never} size={16} color={d.category === c.id ? colors.white : c.color} />
              <T v="small" color={d.category === c.id ? colors.white : colors.text} style={{ fontWeight: '600' }}>{c.label}</T>
            </Pressable>
          ))}
        </View>
      </View>
      <Field label="Peso ou volume (opcional)" value={d.packageLabel} onChangeText={(v) => set({ packageLabel: v })} placeholder="Ex.: 5 kg, 900 ml, bandeja 1 kg" />
      <Segmented label="Tipo de produto" value={d.productType} onChange={(v) => set({ productType: v })} options={PRODUCT_TYPES.map((p) => ({ value: p.id, label: p.label }))} />
      <Field label="Código de barras (opcional)" value={d.barcode} onChangeText={(v) => set({ barcode: v.replace(/\D/g, '') })} keyboardType="number-pad" />
      <Field label="Observações (opcional)" value={d.description} onChangeText={(v) => set({ description: v })} multiline placeholder="Ex.: na gôndola de carnes embaladas" />
    </>
  );
}

/* ------------------------------ Etapa 2 ------------------------------ */

function PhotosStep({ d, set }: { d: PromotionDraft; set: (p: Partial<PromotionDraft>) => void }) {
  const [nextType, setNextType] = useState<ImageType>(d.photos.length ? 'product' : 'price_tag');
  const [crop, setCrop] = useState<{ index: number; image: Picked } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (camera: boolean) => {
    setProblem(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setProblem(camera ? 'Permita o uso da câmera para fotografar a oferta, ou escolha uma foto da galeria.' : 'Permita o acesso às fotos para escolher uma imagem.');
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, exif: false };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const bad = validatePickedImage({ width: a.width, height: a.height, mimeType: a.mimeType, fileSize: a.fileSize });
    if (bad) return setProblem(bad);
    const photos = [...d.photos, { uri: a.uri, type: nextType, width: a.width, height: a.height }];
    set({ photos });
    setCrop({ index: photos.length - 1, image: { uri: a.uri, width: a.width, height: a.height } });
    setNextType('product');
  };

  return (
    <>
      <T v="title">Fotos da oferta</T>
      <Banner t="navy" icon="camera-outline" title="A foto da etiqueta é a principal evidência">
        Fotografe a etiqueta original de preço (ou a placa/anúncio da oferta) de frente e legível. Você pode adicionar até {MAX_PHOTOS} fotos.
      </Banner>
      <View style={{ gap: 6 }}>
        <T v="small" style={{ fontWeight: '600' }}>O que você vai fotografar agora?</T>
        <View style={styles.wrap}>
          {IMAGE_TYPES.map((t) => (
            <Pressable key={t.id} onPress={() => setNextType(t.id)} style={[styles.choice, nextType === t.id && { backgroundColor: colors.navy, borderColor: colors.navy }]} accessibilityRole="radio" accessibilityState={{ selected: nextType === t.id }}>
              <T v="small" color={nextType === t.id ? colors.white : colors.text} style={{ fontWeight: '600' }}>{t.label}</T>
            </Pressable>
          ))}
        </View>
      </View>
      <Row>
        <Button title="Câmera" icon="camera" onPress={() => pick(true)} disabled={d.photos.length >= MAX_PHOTOS} style={{ flex: 1 }} />
        <Button title="Galeria" icon="images-outline" kind="secondary" onPress={() => pick(false)} disabled={d.photos.length >= MAX_PHOTOS} style={{ flex: 1 }} />
      </Row>
      {problem ? <Banner t="red" icon="alert-circle">{problem}</Banner> : null}
      {d.photos.map((p, i) => (
        <Card key={`${p.uri}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', padding: space.sm }}>
          <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
          <View style={{ flex: 1, gap: 4 }}>
            <T v="bodyStrong">{IMAGE_TYPES.find((t) => t.id === p.type)?.label}</T>
            {IMAGE_TYPES.find((t) => t.id === p.type)?.evidence ? <Pill label="Evidência do preço" t="green" icon="checkmark" /> : null}
            <Row gap={4}>
              {IMAGE_TYPES.map((t) => (
                <Pressable key={t.id} onPress={() => set({ photos: d.photos.map((x, k) => (k === i ? { ...x, type: t.id } : x)) })} hitSlop={4} accessibilityLabel={`Marcar como ${t.label}`}>
                  <View style={[styles.miniDot, p.type === t.id && { backgroundColor: colors.navy }]} />
                </Pressable>
              ))}
            </Row>
          </View>
          <IconButton icon="crop-outline" label="Recortar" onPress={() => setCrop({ index: i, image: p })} size={20} />
          <IconButton icon="trash-outline" label="Remover foto" color={colors.redText} size={20} onPress={() => set({ photos: d.photos.filter((_, k) => k !== i) })} />
        </Card>
      ))}
      <ImageCropper
        key={crop ? `${crop.index}-${crop.image.uri}` : 'none'}
        image={crop?.image ?? null}
        onCancel={() => setCrop(null)}
        onDone={(img) => {
          if (crop) set({ photos: d.photos.map((x, k) => (k === crop.index ? { ...x, ...img } : x)) });
          setCrop(null);
        }}
      />
    </>
  );
}

/* ------------------------------ Etapa 3 ------------------------------ */

function PriceStep({ d, set }: { d: PromotionDraft; set: (p: Partial<PromotionDraft>) => void }) {
  const [promo, setPromo] = useState(d.promoPriceCents ? centsToInput(d.promoPriceCents) : '');
  const [regular, setRegular] = useState(d.regularPriceCents ? centsToInput(d.regularPriceCents) : '');
  const [start, setStart] = useState(formatDateBR(d.startsOn));
  const [end, setEnd] = useState(formatDateBR(d.endsOn));
  const today = localToday();
  const toggle = (c: ConditionType) => {
    if (c === 'any_customer') return set({ conditionTypes: ['any_customer'] });
    const rest = d.conditionTypes.filter((x) => x !== 'any_customer');
    const nextList = rest.includes(c) ? rest.filter((x) => x !== c) : [...rest, c];
    set({ conditionTypes: nextList.length ? nextList : ['any_customer'] });
  };
  return (
    <>
      <T v="title">Preço e condições</T>
      <Field label="Preço promocional" value={promo} onChangeText={(v) => { setPromo(v); set({ promoPriceCents: parseBRL(v) }); }} keyboardType="decimal-pad" prefix="R$" placeholder="0,00" />
      <Segmented label="Unidade de venda" value={d.saleUnit} onChange={(v) => set({ saleUnit: v })} options={SALE_UNITS.map((u) => ({ value: u.id, label: u.label }))} />
      <Field
        label="Preço anterior (opcional)"
        value={regular}
        onChangeText={(v) => { setRegular(v); set({ regularPriceCents: v ? parseBRL(v) : null }); }}
        keyboardType="decimal-pad"
        prefix="R$"
        hint="Só informe se o preço anterior aparece na etiqueta ou no anúncio. O desconto só é exibido depois que a foto for aceita."
      />
      <View style={{ gap: 6 }}>
        <T v="small" style={{ fontWeight: '600' }}>Condições da promoção</T>
        {CONDITIONS.map((c) => {
          const on = d.conditionTypes.includes(c.id);
          return (
            <Pressable key={c.id} onPress={() => toggle(c.id)} style={[styles.condition, on && { borderColor: c.special ? colors.yellow : colors.green, backgroundColor: c.special ? colors.yellowSoft : colors.greenSoft }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? (c.special ? colors.yellowText : colors.greenText) : colors.textFaint} />
              <T style={{ flex: 1 }}>{c.label}</T>
            </Pressable>
          );
        })}
      </View>
      {d.conditionTypes.includes('min_quantity') ? (
        <Field label="Quantidade mínima" value={d.minQuantity ? String(d.minQuantity) : ''} onChangeText={(v) => set({ minQuantity: Number(v.replace(/\D/g, '')) || null })} keyboardType="number-pad" />
      ) : null}
      <Field label={d.conditionTypes.includes('other') ? 'Descreva a condição' : 'Detalhes das condições (opcional)'} value={d.conditions} onChangeText={(v) => set({ conditions: v })} multiline placeholder="Ex.: válido no cartão da loja, limite de 2 por cliente" />
      <Row>
        <View style={{ flex: 1 }}>
          <Field label="Início" value={start} onChangeText={(v) => { setStart(v); const p = parseDateBR(v); if (p) set({ startsOn: p }); }} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Encerramento" value={end} onChangeText={(v) => { setEnd(v); const p = parseDateBR(v); if (p) set({ endsOn: p }); }} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
        </View>
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        {[['Só hoje', 0], ['3 dias', 2], ['1 semana', 6], ['15 dias', 14]].map(([label, n]) => (
          <Button key={label as string} title={label as string} kind="secondary" compact onPress={() => { const e = addDays(today, n as number); setEnd(formatDateBR(e)); setStart(formatDateBR(today)); set({ startsOn: today, endsOn: e }); }} />
        ))}
      </Row>
      <T v="small" color={colors.textMuted}>Use a validade informada na etiqueta ou no anúncio. Se não houver, escolha um prazo curto.</T>
    </>
  );
}

/* ------------------------------ Etapa 4 ------------------------------ */

function StoreStep({ d, set, store, setStore }: { d: PromotionDraft; set: (p: Partial<PromotionDraft>) => void; store: StoreLocation | null; setStore: (s: StoreLocation | null) => void }) {
  const [perm] = useForegroundPermissions();
  const [q, setQ] = useState('');
  const [list, setList] = useState<StoreLocation[] | null>(null);
  const [pos, setPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [similar, setSimilar] = useState<Awaited<ReturnType<typeof findSimilar>>>([]);

  useEffect(() => {
    if (!perm?.granted) return;
    let stop: (() => void) | null = null;
    watchAccurateFix((p) => p.fix && setPos({ latitude: p.fix.latitude, longitude: p.fix.longitude }), { targetAccuracyM: 200, timeoutMs: 8000 }).then((s) => (stop = s));
    return () => stop?.();
  }, [perm?.granted]);

  useEffect(() => {
    const t = setTimeout(() => {
      listStores({ query: q, latitude: pos?.latitude, longitude: pos?.longitude }).then(setList).catch(() => setList([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q, pos]);

  useEffect(() => {
    if (store) findSimilar(store.location_id, d.productName, d.brand, d.packageLabel).then(setSimilar).catch(() => setSimilar([]));
  }, [store, d.productName, d.brand, d.packageLabel]);

  const choose = (s: StoreLocation) => {
    setStore(s);
    set({ locationId: s.location_id });
  };

  return (
    <>
      <T v="title">Em qual supermercado?</T>
      <Field label="Buscar supermercado" value={q} onChangeText={setQ} placeholder="Nome, rua ou bairro" />
      {pos ? <Pill label="Lojas mais próximas primeiro" t="green" icon="navigate" /> : null}
      {list === null ? <T color={colors.textMuted}>Carregando…</T> : null}
      {list?.map((s) => {
        const on = store?.location_id === s.location_id;
        return (
          <Pressable key={s.location_id} onPress={() => choose(s)} style={[styles.store, on && { borderColor: colors.green, backgroundColor: colors.greenSoft }]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
            {s.logo_url ? <Image source={{ uri: s.logo_url }} style={styles.logo} contentFit="contain" /> : <View style={[styles.logo, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navySoft }]}><Ionicons name="storefront-outline" size={20} color={colors.navy} /></View>}
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyStrong">{s.name}</T>
              <T v="small" color={colors.textMuted}>{[s.address, s.neighborhood].filter(Boolean).join(' · ')}</T>
              <T v="small" color={colors.textMuted}>{s.city} - {s.state}{s.distance_km != null ? ` · ${formatDistance(s.distance_km)}` : ''}</T>
              {s.status === 'pending' ? <Pill label="Sugestão em análise" t="yellow" /> : null}
            </View>
            {on ? <Ionicons name="checkmark-circle" size={24} color={colors.green} /> : null}
          </Pressable>
        );
      })}
      {list && !list.length ? <T color={colors.textMuted}>Nenhum supermercado encontrado.</T> : null}
      <Button title="Não encontrei: sugerir estabelecimento" icon="add" kind="ghost" onPress={() => setSuggesting(true)} />
      {store ? (
        <Card>
          <T v="caption" color={colors.textMuted}>UNIDADE SELECIONADA</T>
          <T v="bodyStrong">{store.name}</T>
          <T v="small" color={colors.textMuted}>{store.address}, {store.city} - {store.state}</T>
          {mapAvailable ? <PickLocationMap value={{ latitude: store.latitude, longitude: store.longitude }} onChange={() => {}} center={null} /> : null}
          {store.status === 'pending' ? <Banner t="yellow" icon="time-outline">Esta unidade ainda será analisada pela moderação. Até lá, a oferta fica aguardando análise.</Banner> : null}
        </Card>
      ) : null}
      {similar.length ? (
        <Banner t="yellow" icon="copy-outline" title="Já existe uma oferta parecida nesta unidade">
          {similar.map((s) => (
            <Pressable key={s.id} onPress={() => router.push({ pathname: '/offers/[id]', params: { id: s.id, action: 'confirm' } })} accessibilityRole="button">
              <T v="small" color={colors.yellowText} style={{ textDecorationLine: 'underline' }}>
                {s.product_name} — {formatOfferPrice(s.promotional_price_cents, s.sale_unit)} (até {formatDateBR(s.ends_on)}). Toque para confirmar ou adicionar foto nela.
              </T>
            </Pressable>
          ))}
          <T v="small" color={colors.yellowText}>Se o preço, as condições ou a validade forem diferentes, continue normalmente.</T>
        </Banner>
      ) : null}
      <SuggestStoreSheet
        visible={suggesting}
        onClose={() => setSuggesting(false)}
        pos={pos}
        onCreated={async (locationId) => {
          setSuggesting(false);
          const l = await listStores({ latitude: pos?.latitude, longitude: pos?.longitude });
          const s = l.find((x) => x.location_id === locationId);
          if (s) choose(s);
        }}
      />
    </>
  );
}

function SuggestStoreSheet({ visible, onClose, onCreated, pos }: { visible: boolean; onClose: () => void; onCreated: (locationId: string) => void; pos: { latitude: number; longitude: number } | null }) {
  const [f, setF] = useState({ name: '', cnpj: '', address: '', neighborhood: '', city: '', state: '' });
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (f.name.trim().length < 2 || f.address.trim().length < 5 || f.city.trim().length < 2 || !/^[A-Z]{2}$/.test(f.state)) return setError('Preencha nome, endereço, cidade e UF.');
    if (!point) return setError('Informe a localização do estabelecimento.');
    setBusy(true);
    try {
      const r = await suggestStore({ ...f, cnpj: f.cnpj || undefined, latitude: point.latitude, longitude: point.longitude });
      if (r.existing) showAlert('Estabelecimento já cadastrado', 'Encontramos esta unidade no cadastro e ela foi selecionada.');
      onCreated(r.location_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Sugerir estabelecimento">
      <T v="small" color={colors.textMuted}>A sugestão passa por análise da moderação antes de aparecer para todos. Unidades já cadastradas no mesmo local não são duplicadas.</T>
      <Field label="Nome do supermercado" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} autoCapitalize="words" />
      <Field label="CNPJ (opcional)" value={f.cnpj} onChangeText={(v) => setF({ ...f, cnpj: v })} keyboardType="number-pad" hint="Aparece no cupom fiscal." />
      <Field label="Endereço" value={f.address} onChangeText={(v) => setF({ ...f, address: v })} placeholder="Rua e número" autoCapitalize="words" />
      <Field label="Bairro" value={f.neighborhood} onChangeText={(v) => setF({ ...f, neighborhood: v })} autoCapitalize="words" />
      <Row>
        <View style={{ flex: 3 }}><Field label="Cidade" value={f.city} onChangeText={(v) => setF({ ...f, city: v })} autoCapitalize="words" /></View>
        <View style={{ flex: 1 }}><Field label="UF" value={f.state} onChangeText={(v) => setF({ ...f, state: v.toUpperCase().slice(0, 2) })} autoCapitalize="characters" /></View>
      </Row>
      <T v="small" style={{ fontWeight: '600' }}>Localização do estabelecimento</T>
      {pos ? <Button title="Estou no estabelecimento: usar minha localização" icon="navigate" kind="secondary" onPress={() => setPoint(pos)} /> : null}
      {mapAvailable ? <><T v="small" color={colors.textMuted}>Ou toque no mapa sobre a entrada da loja:</T><PickLocationMap value={point} onChange={setPoint} center={pos} /></> : null}
      {!pos && !mapAvailable ? <Banner t="yellow" icon="navigate-outline">Ative a localização e esteja no estabelecimento para informar onde ele fica.</Banner> : null}
      {point ? <Pill label="Localização definida" t="green" icon="checkmark" /> : null}
      {error ? <Banner t="red" icon="alert-circle">{error}</Banner> : null}
      <Button title="Enviar sugestão" icon="send" kind="confirm" onPress={submit} loading={busy} />
    </Sheet>
  );
}

/* ------------------------------ Etapa 5 ------------------------------ */

function LocationStep({ d, store, onPublished }: { d: PromotionDraft; store: StoreLocation; onPublished: (r: PublishResult) => void }) {
  const [perm, request] = useForegroundPermissions();
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [reading, setReading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const view = locationPermissionView(perm);

  const read = async () => {
    setGpsError(null);
    setReading(true);
    stopRef.current?.();
    stopRef.current = await watchAccurateFix((p) => {
      if (p.fix) setFix(p.fix);
      if (p.done) {
        setReading(false);
        if (p.error) setGpsError(p.error);
      }
    }, { targetAccuracyM: 25, timeoutMs: 30_000 });
  };
  useEffect(() => {
    // Inicia a leitura do GPS (sistema externo) assim que a permissão é concedida.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (perm?.granted) void read();
    return () => stopRef.current?.();
  }, [perm?.granted]);

  const dist = fix ? distanceMeters(fix.latitude, fix.longitude, store.latitude, store.longitude) : null;
  const preview = fix && dist != null ? previewLocationStatus(dist, fix.accuracy) : 'unavailable';
  const msg = LOCATION_MESSAGE[preview];

  const publish = async (withLocation: boolean) => {
    setError(null);
    // A posição precisa ser recente: o servidor recusa leituras com mais de 5 minutos.
    const gps = withLocation && fix && Date.now() - new Date(fix.capturedAt).getTime() < 240_000 ? fix : null;
    if (withLocation && !gps) {
      setError('A leitura de localização ficou antiga. Toque em "Ler localização novamente".');
      return;
    }
    try {
      const r = await publishOffer(d, gps, setBusy);
      onPublished(r);
    } catch (e) {
      setError(e instanceof MarketplaceError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <T v="title">Onde você encontrou a oferta</T>
      <Card>
        <T v="caption" color={colors.textMuted}>RESUMO</T>
        <T v="bodyStrong">{d.productName}{d.brand ? ` · ${d.brand}` : ''}</T>
        <T v="heading" color={colors.greenText}>{formatOfferPrice(d.promoPriceCents ?? 0, d.saleUnit)}</T>
        <T v="small" color={colors.textMuted}>{store.name} · {store.address}</T>
        <T v="small" color={colors.textMuted}>{d.photos.length} {d.photos.length === 1 ? 'foto' : 'fotos'} · válida até {formatDateBR(d.endsOn)}</T>
      </Card>

      {view.kind === 'request' ? (
        <Banner t="navy" icon="navigate-outline" title="Por que pedimos a localização">
          <T v="small" color={colors.navy}>{view.message}</T>
          <Button title="Permitir localização" icon="navigate" compact onPress={() => request()} />
        </Banner>
      ) : null}
      {view.kind === 'blocked' ? <Banner t="yellow" icon="navigate-outline" title="Localização desativada">{view.message}</Banner> : null}

      {perm?.granted ? (
        <View style={[styles.locBox, { backgroundColor: tone[msg.tone].bg }]}>
          <Row>
            <Ionicons name={preview === 'compatible' ? 'checkmark-circle' : preview === 'far' ? 'warning' : 'locate-outline'} size={24} color={tone[msg.tone].solid} />
            <T v="bodyStrong" color={tone[msg.tone].fg} style={{ flex: 1 }}>{reading && preview !== 'compatible' ? 'Lendo a localização…' : msg.title}</T>
          </Row>
          {fix ? (
            <T v="small" color={tone[msg.tone].fg}>
              Distância até a unidade: cerca de {Math.round(dist ?? 0)} m · precisão do GPS: {Math.round(fix.accuracy)} m
            </T>
          ) : null}
          <T v="small" color={tone[msg.tone].fg}>{msg.text}</T>
          {gpsError ? <T v="small" color={colors.redText}>{gpsError}</T> : null}
          <Row>
            <Button title={reading ? 'Aguardando mais precisão…' : 'Ler localização novamente'} icon="refresh" kind="secondary" compact onPress={read} disabled={reading} style={{ flex: 1 }} />
          </Row>
          <T v="small" color={colors.textMuted}>A verificação final é feita pelo servidor. Guardamos só a distância e a precisão, não suas coordenadas.</T>
        </View>
      ) : null}

      {error ? <Banner t="red" icon="alert-circle" title="Não foi possível publicar">{error}</Banner> : null}
      {busy ? <Banner t="navy" icon="cloud-upload-outline">{busy}</Banner> : null}

      {perm?.granted && fix ? (
        <Button title="Publicar promoção" icon="send" kind="confirm" onPress={() => publish(true)} loading={!!busy} disabled={reading && preview !== 'compatible'} />
      ) : null}
      <Button
        title={perm?.granted ? 'Publicar sem localização (vai para análise)' : 'Publicar sem localização'}
        kind={perm?.granted && fix ? 'ghost' : 'primary'}
        onPress={() => publish(false)}
        loading={!!busy && !(perm?.granted && fix)}
      />
      <T v="small" color={colors.textMuted}>A localização ajuda, mas não comprova sozinha que a oferta existe: fotos, confirmações de outras pessoas e a moderação também contam.</T>
    </>
  );
}

function PublishedView({ result }: { result: PublishResult }) {
  if (result.kind === 'duplicate') {
    return (
      <Screen>
        <Banner t="yellow" icon="copy-outline" title="Esta oferta já foi publicada">
          Outra pessoa já publicou a mesma oferta (mesmo produto, preço, unidade, condições e validade). Em vez de duplicar, confirme a oferta existente: isso aumenta a confiança dela para todos.
        </Banner>
        <Button title="Confirmar a oferta existente" icon="checkmark-done" kind="confirm" onPress={() => router.replace({ pathname: '/offers/[id]', params: { id: result.duplicateOf, action: 'confirm' } })} />
        <Button title="Voltar às ofertas" kind="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }
  const visible = !['pending_review', 'draft'].includes(result.status);
  const msg = LOCATION_MESSAGE[result.locationStatus];
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: visible ? colors.greenSoft : colors.yellowSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={visible ? 'checkmark' : 'time-outline'} size={40} color={visible ? colors.green : colors.yellowText} />
        </View>
        <T v="title" center>{visible ? 'Oferta publicada!' : 'Oferta enviada para análise'}</T>
        <T center color={colors.textMuted}>
          {visible ? 'Ela já aparece para as pessoas da sua região. Obrigado por ajudar a comunidade a economizar.' : 'Ela aparecerá para todos depois da análise da moderação.'}
        </T>
        <Pill label={STATUS_LABEL[result.status]} t={visible ? 'green' : 'yellow'} />
      </View>
      <Card>
        <T v="bodyStrong">{msg.title}</T>
        {result.distanceM != null ? <T v="small" color={colors.textMuted}>Distância registrada: {result.distanceM} m · precisão {result.accuracyM} m</T> : null}
        <T v="small" color={colors.textMuted}>{msg.text}</T>
      </Card>
      <Button title="Ver a publicação" icon="eye-outline" onPress={() => router.replace(`/offers/${result.id}`)} />
      <Button title="Publicar outra oferta" icon="add" kind="secondary" onPress={() => router.replace('/offers/publish')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', paddingHorizontal: space.sm, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: space.sm, padding: space.lg, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, marginRight: space.sm, backgroundColor: colors.border },
  miniDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.navy },
  condition: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  store: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  logo: { width: 44, height: 44, borderRadius: radius.sm },
  locBox: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
});
