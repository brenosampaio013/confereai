import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { categoryLabel, formatOfferPrice } from '@/domain/marketplace';
import { parseBRL } from '@/domain/money';
import { isCloudConfigured } from '@/lib/config';
import { showAlert } from '@/lib/dialog';
import { currentPosition, useForegroundPermissions } from '@/services/location';
import { listCities, listStores, mapStores, MapStore, MarketplaceError, OfferRow, searchOffers, setFavorite, StoreLocation } from '@/services/marketplace';
import { useApp } from '@/state/AppContext';
import { Banner, Button, EmptyState, Field, IconButton, Pill, Row, Segmented, Sheet, T } from '@/ui/components';
import { CategoryStrip } from '@/ui/market/CategoryStrip';
import { OfferCard } from '@/ui/market/OfferCard';
import { OffersMap } from '@/ui/market/OffersMap';
import { shareOffer } from '@/ui/market/share';
import { colors, radius, space } from '@/ui/theme';

type City = { city: string; state: string } | null;
type Sort = 'recent' | 'price' | 'distance';
const DISTANCES = [1, 3, 5, 10, 25];

export default function OffersScreen() {
  const { repo } = useApp();
  const configured = isCloudConfigured();
  const [perm, requestPerm] = useForegroundPermissions();
  const [pos, setPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [posFailed, setPosFailed] = useState(false);
  const [city, setCity] = useState<City>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [store, setStore] = useState<StoreLocation | null>(null);
  const [maxKm, setMaxKm] = useState<number | null>(null);
  const [price, setPrice] = useState<{ min: number | null; max: number | null }>({ min: null, max: null });
  const [sort, setSort] = useState<Sort>('recent');
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [offers, setOffers] = useState<OfferRow[] | null>(null);
  const [nearby, setNearby] = useState<OfferRow[]>([]);
  const [stores, setStores] = useState<MapStore[]>([]);
  const [selected, setSelected] = useState<MapStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'city' | 'store' | 'distance' | 'price'>(null);

  // Cidade escolhida fica salva só no aparelho
  useEffect(() => {
    repo.getSetting('market_city').then((v) => v && setCity(JSON.parse(v)));
  }, [repo]);
  const chooseCity = (c: City) => {
    setCity(c);
    repo.setSetting('market_city', c ? JSON.stringify(c) : null);
  };

  useEffect(() => {
    if (perm?.granted) currentPosition().then((p) => { setPos(p); setPosFailed(!p); });
  }, [perm?.granted]);

  const filters = useMemo(
    () => ({
      city: maxKm && pos ? null : city?.city ?? null,
      state: maxKm && pos ? null : city?.state ?? null,
      category, supermarketId: null, locationId: store?.location_id ?? null, query,
      minPriceCents: price.min, maxPriceCents: price.max,
      latitude: pos?.latitude ?? null, longitude: pos?.longitude ?? null, maxKm: pos ? maxKm : null,
    }),
    [city, category, store, query, price, pos, maxKm],
  );

  const load = useCallback(async () => {
    if (!configured) return;
    setError(null);
    try {
      const [list, near, map] = await Promise.all([
        searchOffers({ ...filters, sort: sort === 'distance' && !pos ? 'recent' : sort, limit: 60 }),
        pos ? searchOffers({ ...filters, city: null, state: null, sort: 'distance', maxKm: maxKm ?? 10, limit: 10 }) : Promise.resolve([] as OfferRow[]),
        mode === 'map' ? mapStores(filters) : Promise.resolve(null),
      ]);
      setOffers(list);
      setNearby(near);
      if (map) setStores(map);
    } catch (e) {
      setError(e instanceof MarketplaceError ? e.message : 'Não foi possível carregar as ofertas.');
      setOffers([]);
    }
  }, [configured, filters, sort, pos, maxKm, mode]);

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(load, query ? 350 : 0);
      return () => clearTimeout(t);
    }, [load, query]),
  );

  const toggleFavorite = async (o: OfferRow) => {
    try {
      await setFavorite(o.id, !o.favorited);
      const flip = (l: OfferRow[]) => l.map((x) => (x.id === o.id ? { ...x, favorited: !o.favorited } : x));
      setOffers((l) => (l ? flip(l) : l));
      setNearby(flip);
    } catch (e) {
      const needs = e instanceof MarketplaceError && e.code === 'needs_account';
      showAlert(needs ? 'Entre na sua conta' : 'Não foi possível favoritar', e instanceof Error ? e.message : '', needs ? [{ text: 'Agora não', style: 'cancel' }, { text: 'Entrar', onPress: () => router.push('/auth') }] : undefined);
    }
  };
  const share = async (o: OfferRow) => {
    if ((await shareOffer(o)) === 'copied') showAlert('Link copiado', 'O texto da oferta foi copiado. Cole onde quiser compartilhar.');
  };

  const recent = useMemo(() => [...(offers ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 10), [offers]);
  const activeFilters = [store ? store.name : null, maxKm && pos ? `até ${maxKm} km` : null, price.min || price.max ? 'faixa de preço' : null, category ? categoryLabel(category) : null].filter(Boolean);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="title">Ofertas perto de você</T>
              <T color={colors.textMuted}>Descubra promoções compartilhadas por pessoas da sua região.</T>
            </View>
            <IconButton icon="notifications-outline" label="Notificações" onPress={() => router.push('/offers/notifications')} />
          </Row>
          <Row style={{ flexWrap: 'wrap' }}>
            <Pressable onPress={() => setSheet('city')} style={styles.chip} accessibilityRole="button" accessibilityLabel="Escolher cidade">
              <Ionicons name="business-outline" size={16} color={colors.navy} />
              <T v="small" style={{ fontWeight: '700' }}>{city ? `${city.city} - ${city.state}` : 'Todas as cidades'}</T>
              <Ionicons name="chevron-down" size={14} color={colors.navy} />
            </Pressable>
            {perm?.granted ? (
              <Pill label={pos ? 'Localização atual ativada' : posFailed ? 'Localização indisponível' : 'Obtendo localização…'} t={posFailed ? 'neutral' : 'green'} icon="navigate" />
            ) : (
              <Pressable onPress={() => requestPerm()} style={styles.chip} accessibilityRole="button">
                <Ionicons name="navigate-outline" size={16} color={colors.navy} />
                <T v="small" style={{ fontWeight: '600' }}>Usar minha localização</T>
              </Pressable>
            )}
          </Row>
        </View>

        {!configured ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Banner t="yellow" icon="cloud-offline-outline" title="Marketplace indisponível neste aplicativo">
              As ofertas da comunidade ficam no servidor do Confere Aí, que ainda não foi configurado nesta versão. O restante do app funciona normalmente.
            </Banner>
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
              <Button title="PUBLICAR PROMOÇÃO" icon="add-circle" kind="confirm" onPress={() => router.push('/offers/publish')} style={{ minHeight: 58 }} />
              <Row>
                <Button title="Minhas publicações" icon="albums-outline" kind="secondary" compact onPress={() => router.push('/offers/mine')} style={{ flex: 1 }} />
                <Button title={mode === 'list' ? 'Ver no mapa' : 'Ver em lista'} icon={mode === 'list' ? 'map-outline' : 'list-outline'} kind="secondary" compact onPress={() => setMode(mode === 'list' ? 'map' : 'list')} style={{ flex: 1 }} />
              </Row>
              <Field label="Buscar" value={query} onChangeText={setQuery} placeholder="Produto ou supermercado" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                <FilterChip label={store ? store.name : 'Supermercado'} active={!!store} onPress={() => setSheet('store')} />
                <FilterChip label={maxKm ? `Até ${maxKm} km` : 'Distância'} active={!!maxKm} onPress={() => setSheet('distance')} />
                <FilterChip label={price.min || price.max ? 'Preço ✓' : 'Preço'} active={!!(price.min || price.max)} onPress={() => setSheet('price')} />
                {activeFilters.length ? <FilterChip label="Limpar filtros" icon="close" onPress={() => { setStore(null); setMaxKm(null); setPrice({ min: null, max: null }); setCategory(null); }} /> : null}
              </ScrollView>
              <Segmented value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Mais recentes' }, { value: 'price', label: 'Menor preço' }, ...(pos ? [{ value: 'distance' as Sort, label: 'Mais perto' }] : [])]} />
            </View>

            <CategoryStrip value={category} onChange={setCategory} />

            {error ? <View style={{ paddingHorizontal: space.lg }}><Banner t="red" icon="alert-circle" title="Erro ao carregar">{error}</Banner></View> : null}
            {offers === null ? <ActivityIndicator color={colors.navy} style={{ marginTop: space.xl }} /> : null}

            {mode === 'map' ? (
              <View style={{ paddingHorizontal: space.lg, height: 460 }}>
                {stores.length ? (
                  <OffersMap stores={stores} onSelect={setSelected} center={pos} />
                ) : offers ? (
                  <EmptyState icon="map-outline" title="Nenhuma unidade com ofertas" text="Ajuste os filtros ou publique a primeira oferta da sua região." />
                ) : null}
              </View>
            ) : offers && offers.length === 0 && !error ? (
              <View style={{ paddingHorizontal: space.lg }}>
                <EmptyState
                  icon="pricetags-outline"
                  title={activeFilters.length || query || city ? 'Nenhuma oferta com esses filtros' : 'Ainda não há ofertas por aqui'}
                  text="Encontrou uma promoção no supermercado? Seja a primeira pessoa a compartilhar e ajude quem mora perto de você a economizar."
                  action={<Button title="Publicar a primeira oferta" icon="add-circle" kind="confirm" onPress={() => router.push('/offers/publish')} style={{ alignSelf: 'stretch', marginTop: space.md }} />}
                />
              </View>
            ) : offers ? (
              <>
                {!activeFilters.length && !query && recent.length ? (
                  <Section title="Ofertas recentes">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingHorizontal: space.lg }}>
                      {recent.map((o) => <OfferCard key={o.id} o={o} onFavorite={toggleFavorite} onShare={share} />)}
                    </ScrollView>
                  </Section>
                ) : null}
                {nearby.length && !query ? (
                  <Section title="Ofertas próximas">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingHorizontal: space.lg }}>
                      {nearby.map((o) => <OfferCard key={o.id} o={o} onFavorite={toggleFavorite} onShare={share} />)}
                    </ScrollView>
                  </Section>
                ) : null}
                <Section title={`${activeFilters.length || query ? 'Resultados' : 'Todas as ofertas'} (${offers.length})`}>
                  <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
                    {offers.map((o) => <OfferCard key={o.id} o={o} onFavorite={toggleFavorite} onShare={share} wide />)}
                  </View>
                </Section>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <CitySheet visible={sheet === 'city'} onClose={() => setSheet(null)} current={city} onPick={(c) => { chooseCity(c); setSheet(null); }} pos={pos} />
      <StoreSheet visible={sheet === 'store'} onClose={() => setSheet(null)} city={city} pos={pos} onPick={(s) => { setStore(s); setSheet(null); }} />
      <Sheet visible={sheet === 'distance'} onClose={() => setSheet(null)} title="Distância máxima">
        {!pos ? (
          <Banner t="navy" icon="navigate-outline" title="Ative a localização para filtrar por distância">
            A localização é usada só no aparelho, para calcular a distância até as lojas. Sem ela, use o filtro por cidade.
          </Banner>
        ) : null}
        {!pos && !perm?.granted ? <Button title="Usar minha localização" icon="navigate" onPress={() => requestPerm()} /> : null}
        {DISTANCES.map((d) => <Button key={d} title={`Até ${d} km`} kind={maxKm === d ? 'primary' : 'secondary'} disabled={!pos} onPress={() => { setMaxKm(d); setSheet(null); }} />)}
        <Button title="Qualquer distância" kind="ghost" onPress={() => { setMaxKm(null); setSheet(null); }} />
      </Sheet>
      <PriceSheet key={sheet === 'price' ? 'open' : 'closed'} visible={sheet === 'price'} onClose={() => setSheet(null)} value={price} onApply={(p) => { setPrice(p); setSheet(null); }} />

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.supermarket_name ?? ''}>
        {selected ? (
          <>
            <T color={colors.textMuted}>{[selected.address, selected.neighborhood, `${selected.city} - ${selected.state}`].filter(Boolean).join(' · ')}</T>
            <Pill label={`${selected.active_offers} ${selected.active_offers === 1 ? 'promoção ativa' : 'promoções ativas'}`} t="green" icon="pricetags-outline" />
            {(selected.top_offers ?? []).map((o) => (
              <Pressable key={o.id} onPress={() => { setSelected(null); router.push(`/offers/${o.id}`); }} style={styles.topOffer} accessibilityRole="button">
                <T style={{ flex: 1 }} numberOfLines={1}>{o.product_name}</T>
                <T v="bodyStrong" color={colors.greenText}>{formatOfferPrice(o.promotional_price_cents, o.sale_unit)}</T>
              </Pressable>
            ))}
            <Button title="Ver todas as promoções desta unidade" icon="storefront-outline" onPress={() => { const id = selected.location_id; setSelected(null); router.push(`/offers/store/${id}`); }} />
          </>
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <T v="caption" color={colors.textMuted} style={{ textTransform: 'uppercase', paddingHorizontal: space.lg }}>{title}</T>
      {children}
    </View>
  );
}

function FilterChip({ label, active, onPress, icon = 'chevron-down' }: { label: string; active?: boolean; onPress: () => void; icon?: 'chevron-down' | 'close' }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.chip, active && { backgroundColor: colors.navy, borderColor: colors.navy }]}>
      <T v="small" color={active ? colors.white : colors.navy} style={{ fontWeight: '600' }} numberOfLines={1}>{label}</T>
      <Ionicons name={icon} size={14} color={active ? colors.white : colors.navy} />
    </Pressable>
  );
}

function CitySheet({ visible, onClose, current, onPick, pos }: { visible: boolean; onClose: () => void; current: City; onPick: (c: City) => void; pos: { latitude: number; longitude: number } | null }) {
  const [cities, setCities] = useState<{ city: string; state: string; active_offers: number }[]>([]);
  const [manualCity, setManualCity] = useState('');
  const [manualState, setManualState] = useState('');
  useEffect(() => {
    if (visible && isCloudConfigured()) listCities().then(setCities).catch(() => setCities([]));
  }, [visible]);
  const fromLocation = async () => {
    if (!pos) return;
    // Cidade da unidade cadastrada mais próxima (sem serviço externo de endereços)
    const near = await listStores({ latitude: pos.latitude, longitude: pos.longitude }).catch(() => []);
    if (near[0]) onPick({ city: near[0].city, state: near[0].state });
    else showAlert('Nenhuma unidade cadastrada perto de você', 'Escolha a cidade manualmente.');
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Cidade">
      {pos ? <Button title="Usar a cidade onde estou" icon="navigate" kind="secondary" onPress={fromLocation} /> : null}
      <Button title="Todas as cidades" kind={current ? 'secondary' : 'primary'} onPress={() => onPick(null)} />
      {cities.map((c) => (
        <Button key={`${c.city}-${c.state}`} title={`${c.city} - ${c.state} (${c.active_offers})`} kind={current?.city === c.city ? 'primary' : 'secondary'} onPress={() => onPick({ city: c.city, state: c.state })} />
      ))}
      <T v="small" color={colors.textMuted}>Outra cidade:</T>
      <Row>
        <View style={{ flex: 3 }}><Field label="Cidade" value={manualCity} onChangeText={setManualCity} autoCapitalize="words" /></View>
        <View style={{ flex: 1 }}><Field label="UF" value={manualState} onChangeText={(s) => setManualState(s.toUpperCase().slice(0, 2))} autoCapitalize="characters" /></View>
      </Row>
      <Button title="Usar esta cidade" disabled={manualCity.trim().length < 2 || manualState.length !== 2} onPress={() => onPick({ city: manualCity.trim(), state: manualState })} />
    </Sheet>
  );
}

function StoreSheet({ visible, onClose, onPick, city, pos }: { visible: boolean; onClose: () => void; onPick: (s: StoreLocation | null) => void; city: City; pos: { latitude: number; longitude: number } | null }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<StoreLocation[]>([]);
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      listStores({ query: q, city: city?.city, state: city?.state, latitude: pos?.latitude, longitude: pos?.longitude }).then((l) => setList(l.filter((s) => s.status === 'approved'))).catch(() => setList([]));
    }, 300);
    return () => clearTimeout(t);
  }, [visible, q, city, pos]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Supermercado">
      <Field label="Buscar supermercado" value={q} onChangeText={setQ} placeholder="Nome ou endereço" />
      <Button title="Todos os supermercados" kind="ghost" onPress={() => onPick(null)} />
      {list.map((s) => (
        <Pressable key={s.location_id} onPress={() => onPick(s)} style={styles.storeRow} accessibilityRole="button">
          <T v="bodyStrong">{s.name}</T>
          <T v="small" color={colors.textMuted}>{[s.address, s.neighborhood, s.city].filter(Boolean).join(' · ')}</T>
        </Pressable>
      ))}
      {!list.length ? <T v="small" color={colors.textMuted}>Nenhum supermercado encontrado.</T> : null}
    </Sheet>
  );
}

function PriceSheet({ visible, onClose, value, onApply }: { visible: boolean; onClose: () => void; value: { min: number | null; max: number | null }; onApply: (v: { min: number | null; max: number | null }) => void }) {
  const [min, setMin] = useState(value.min ? String(value.min / 100).replace('.', ',') : '');
  const [max, setMax] = useState(value.max ? String(value.max / 100).replace('.', ',') : '');
  return (
    <Sheet visible={visible} onClose={onClose} title="Faixa de preço">
      <Row>
        <View style={{ flex: 1 }}><Field label="Mínimo" value={min} onChangeText={setMin} keyboardType="decimal-pad" prefix="R$" /></View>
        <View style={{ flex: 1 }}><Field label="Máximo" value={max} onChangeText={setMax} keyboardType="decimal-pad" prefix="R$" /></View>
      </Row>
      <Button title="Aplicar" kind="confirm" onPress={() => onApply({ min: min ? parseBRL(min) : null, max: max ? parseBRL(max) : null })} />
      <Button title="Limpar" kind="ghost" onPress={() => onApply({ min: null, max: null })} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  topOffer: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  storeRow: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 2 },
});
