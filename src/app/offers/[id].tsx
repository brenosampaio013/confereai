import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  categoryLabel, conditionLabel, CONFIRMATION_TYPES, ConfirmationType, confirmationText, discountInfo, formatDateBR, formatOfferPrice, IMAGE_TYPES,
  LOCATION_MESSAGE, relativeTime, REPORT_REASONS, ReportReason, REPUTATION_LABEL, validityText,
} from '@/domain/marketplace';
import { parseBRL } from '@/domain/money';
import { showAlert } from '@/lib/dialog';
import { useForegroundPermissions, watchAccurateFix } from '@/services/location';
import { confirmOffer, endMyOffer, getOffer, GpsFix, MarketplaceError, OfferDetail, reportOffer, setFavorite, updateMyOffer } from '@/services/marketplace';
import { Banner, Button, Card, Divider, Field, KeyValue, Loading, Pill, Row, Screen, Sheet, T } from '@/ui/components';
import { BadgeDetails, StatusPill } from '@/ui/market/Badges';
import { RemoteImage } from '@/ui/RemoteImage';
import { shareOffer } from '@/ui/market/share';
import { colors, radius, space } from '@/ui/theme';

export default function OfferDetailScreen() {
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const [o, setO] = useState<OfferDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [sheet, setSheet] = useState<null | 'confirm' | 'report' | 'edit'>(action === 'confirm' || action === 'report' ? (action as 'confirm' | 'report') : null);

  const load = useCallback(async () => {
    try {
      setO(await getOffer(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setO(null);
    }
  }, [id]);
  useEffect(() => {
    // load só altera o estado depois da resposta do servidor (assíncrona).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (o === undefined) return <Loading />;
  if (!o) {
    return (
      <Screen>
        <Banner t="yellow" icon="alert-circle" title="Oferta indisponível">{error ?? 'Ela pode ter expirado, sido removida ou ainda estar em análise.'}</Banner>
        <Button title="Ver outras ofertas" onPress={() => router.replace('/offers')} />
      </Screen>
    );
  }

  const active = ['published', 'partially_verified', 'community_confirmed', 'contested'].includes(o.status);
  const discount = discountInfo(o.regular_price_cents, o.promotional_price_cents, o.photo_verified || o.moderator_verified);
  const specials = o.condition_types.filter((c) => c !== 'any_customer');
  const toggleFav = async () => {
    try {
      await setFavorite(o.id, !o.favorited);
      setO({ ...o, favorited: !o.favorited });
    } catch (e) {
      showAlert('Não foi possível favoritar', e instanceof Error ? e.message : '');
    }
  };
  const share = async () => {
    if ((await shareOffer({ ...o, supermarket_name: o.store.name })) === 'copied') showAlert('Link copiado', 'Cole onde quiser compartilhar.');
  };
  const endNow = () =>
    showAlert('Encerrar a sua oferta?', 'Ela deixará de aparecer como ativa.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Encerrar', style: 'destructive', onPress: async () => { await endMyOffer(o.id); load(); } },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: 'Oferta' }} />
      <Screen>
        <View style={{ gap: space.sm }}>
          <RemoteImage path={o.images[photo]?.path} style={styles.hero} contentFit="contain" />
          {o.images.length > 1 ? (
            <ScrollView horizontal contentContainerStyle={{ gap: space.sm }}>
              {o.images.map((img, i) => (
                <Pressable key={img.path} onPress={() => setPhoto(i)} accessibilityLabel={IMAGE_TYPES.find((t) => t.id === img.type)?.label} style={[styles.thumbWrap, i === photo && { borderColor: colors.navy }]}>
                  <RemoteImage path={img.path} style={styles.thumb} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {o.images[photo] ? <T v="small" color={colors.textMuted}>Foto: {IMAGE_TYPES.find((t) => t.id === o.images[photo].type)?.label}</T> : null}
        </View>

        <View style={{ gap: 4 }}>
          <Row style={{ flexWrap: 'wrap' }}>
            <StatusPill status={o.status} />
            <Pill label={categoryLabel(o.category)} t="neutral" />
          </Row>
          <T v="title" style={{ textTransform: 'uppercase' }}>{o.product_name}</T>
          <T color={colors.textMuted}>{[o.brand, o.package_label].filter(Boolean).join(' · ')}</T>
          <T v="display" color={colors.greenText}>{formatOfferPrice(o.promotional_price_cents, o.sale_unit)}</T>
          {discount.regularText ? <T v="small" color={colors.textMuted}>{discount.regularText}{discount.percent ? ` · ${discount.percent}% de desconto` : ''}</T> : null}
        </View>

        {o.status === 'contested' ? <Banner t="yellow" icon="alert-circle" title="Oferta contestada">Pessoas relataram preço diferente, que a oferta acabou ou outro problema. A moderação vai revisar: confira na loja.</Banner> : null}
        {o.status === 'pending_review' ? <Banner t="yellow" icon="time-outline" title="Aguardando análise">Esta publicação ainda não aparece para outras pessoas.</Banner> : null}
        {!active && ['expired', 'removed'].includes(o.status) ? <Banner t="neutral" icon="close-circle-outline" title={o.status === 'expired' ? 'Oferta encerrada' : 'Publicação removida'}>Ela não aparece mais entre as ofertas ativas.</Banner> : null}

        <Card>
          <Row>
            <Ionicons name="storefront-outline" size={22} color={colors.navy} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">{o.store.name}</T>
              <T v="small" color={colors.textMuted}>{[o.store.address, o.store.neighborhood, `${o.store.city} - ${o.store.state}`].filter(Boolean).join(' · ')}</T>
            </View>
          </Row>
          <Button title="Outras ofertas desta unidade" icon="pricetags-outline" kind="secondary" compact onPress={() => router.push(`/offers/store/${o.store.location_id}`)} />
          <KeyValue label="Publicada" value={relativeTime(o.created_at)} />
          <KeyValue label="Validade" value={validityText(o.ends_on, o.starts_on)} />
          <KeyValue label="Quem publicou" value={REPUTATION_LABEL[o.author_level] ?? 'Colaborador'} />
        </Card>

        <Card>
          <T v="heading">Condições</T>
          {specials.length === 0 ? <Row><Ionicons name="checkmark-circle" size={18} color={colors.green} /><T>Válida para qualquer cliente</T></Row> : null}
          {specials.map((c) => (
            <Row key={c}><Ionicons name="alert-circle" size={18} color={colors.yellow} /><T style={{ flex: 1 }}>{conditionLabel(c, o.min_quantity)}</T></Row>
          ))}
          {o.conditions ? <T v="small" color={colors.textMuted}>{o.conditions}</T> : null}
          {o.description ? <><Divider /><T v="small" color={colors.textMuted}>{o.description}</T></> : null}
        </Card>

        <Card>
          <T v="heading">O que foi verificado</T>
          <BadgeDetails flags={o} />
          <Divider />
          <T v="small" style={{ fontWeight: '700' }}>Confirmações da comunidade</T>
          <T v="small" color={colors.textMuted}>{confirmationText(o.independent_confirmations)}</T>
          {o.confirmation_summary ? (
            <Row style={{ flexWrap: 'wrap' }} gap={6}>
              {CONFIRMATION_TYPES.filter((c) => o.confirmation_summary?.[c.id]).map((c) => (
                <Pill key={c.id} label={`${c.label}: ${o.confirmation_summary?.[c.id]}`} t={c.positive ? 'green' : 'yellow'} />
              ))}
            </Row>
          ) : null}
          {o.location_check ? (
            <>
              <Divider />
              <T v="small" style={{ fontWeight: '700' }}>Sua verificação de localização (só você e a moderação veem)</T>
              <T v="small" color={colors.textMuted}>
                {LOCATION_MESSAGE[o.location_check.status].title}
                {o.location_check.distance_m != null ? ` · ${o.location_check.distance_m} m da unidade, precisão ${o.location_check.accuracy_m} m` : ''}
              </T>
            </>
          ) : null}
        </Card>

        <Row>
          <Button title={o.favorited ? 'Favoritada' : 'Favoritar'} icon={o.favorited ? 'heart' : 'heart-outline'} kind="secondary" compact onPress={toggleFav} style={{ flex: 1 }} />
          <Button title="Compartilhar" icon="share-social-outline" kind="secondary" compact onPress={share} style={{ flex: 1 }} />
        </Row>

        {active && !o.is_mine ? (
          <Card>
            <T v="heading">Você esteve nesta loja?</T>
            {o.my_confirmation ? <Pill label={`Sua resposta: ${CONFIRMATION_TYPES.find((c) => c.id === o.my_confirmation?.type)?.label}`} t="navy" /> : null}
            <Button title="Confirmar promoção" icon="checkmark-done" kind="confirm" onPress={() => setSheet('confirm')} />
            <Row>
              <Button title="Preço diferente" kind="secondary" compact onPress={() => setSheet('confirm')} style={{ flex: 1 }} />
              <Button title="Acabou" kind="secondary" compact onPress={() => setSheet('confirm')} style={{ flex: 1 }} />
            </Row>
            <Button title="Denunciar publicação" icon="flag-outline" kind="ghost" compact onPress={() => setSheet('report')} />
          </Card>
        ) : null}

        {o.is_mine && !['expired', 'removed'].includes(o.status) ? (
          <Card>
            <T v="heading">Sua publicação</T>
            <T v="small" color={colors.textMuted}>Produto e preço não podem ser alterados depois de publicados (as confirmações se referem a eles). Para outro preço, publique uma nova oferta.</T>
            <Button title="Editar descrição, condições ou antecipar validade" icon="create-outline" kind="secondary" compact onPress={() => setSheet('edit')} />
            <Button title="A promoção acabou: encerrar" icon="close-circle-outline" kind="danger" compact onPress={endNow} />
          </Card>
        ) : null}
        {o.is_admin ? <Button title="Abrir na moderação" icon="shield-outline" kind="secondary" onPress={() => router.push(`/admin/${o.id}`)} /> : null}
      </Screen>

      <ConfirmSheet visible={sheet === 'confirm'} onClose={() => setSheet(null)} offer={o} onDone={() => { setSheet(null); load(); }} />
      <ReportSheet visible={sheet === 'report'} onClose={() => setSheet(null)} offerId={o.id} onDone={() => { setSheet(null); load(); }} />
      <EditSheet visible={sheet === 'edit'} onClose={() => setSheet(null)} offer={o} onDone={() => { setSheet(null); load(); }} />
    </>
  );
}

function ConfirmSheet({ visible, onClose, offer, onDone }: { visible: boolean; onClose: () => void; offer: OfferDetail; onDone: () => void }) {
  const [type, setType] = useState<ConfirmationType>('found');
  const [price, setPrice] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [perm, request] = useForegroundPermissions();
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !perm?.granted) return;
    let stop: (() => void) | null = null;
    watchAccurateFix((p) => p.fix && setGps(p.fix), { targetAccuracyM: 30, timeoutMs: 15000 }).then((s) => (stop = s));
    return () => stop?.();
  }, [visible, perm?.granted]);

  const pick = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return setError('Permita a câmera para anexar a foto da etiqueta.');
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!r.canceled && r.assets[0]) setPhoto(r.assets[0].uri);
  };

  const submit = async () => {
    setError(null);
    const reported = type === 'price_different' ? parseBRL(price) : null;
    if (type === 'price_different' && !reported) return setError('Informe o preço que você encontrou.');
    setBusy(true);
    try {
      const r = await confirmOffer(offer.id, type, { reportedPriceCents: reported, photoUri: photo, gps });
      showAlert('Obrigado pela ajuda!', r.independent ? 'Sua resposta foi registrada.' : 'Sua resposta foi registrada. Contas criadas há menos de 24 horas ainda não contam para a confirmação da comunidade.');
      onDone();
    } catch (e) {
      setError(e instanceof MarketplaceError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="O que você encontrou na loja?">
      {CONFIRMATION_TYPES.map((c) => (
        <Pressable key={c.id} onPress={() => setType(c.id)} style={[styles.option, type === c.id && { borderColor: c.positive ? colors.green : colors.yellow, backgroundColor: c.positive ? colors.greenSoft : colors.yellowSoft }]} accessibilityRole="radio" accessibilityState={{ selected: type === c.id }}>
          <Ionicons name={type === c.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={type === c.id ? colors.navy : colors.textFaint} />
          <T style={{ flex: 1 }}>{c.label}</T>
        </Pressable>
      ))}
      {type === 'price_different' ? <Field label="Preço que você encontrou" value={price} onChangeText={setPrice} keyboardType="decimal-pad" prefix="R$" /> : null}
      <Button title={photo ? 'Foto anexada ✓ (trocar)' : 'Anexar foto da etiqueta (opcional)'} icon="camera-outline" kind="secondary" compact onPress={pick} />
      {!perm?.granted ? (
        <Button title="Incluir minha localização (opcional)" icon="navigate-outline" kind="ghost" compact onPress={() => request()} />
      ) : (
        <T v="small" color={colors.textMuted}>{gps ? `Localização lida (precisão ${Math.round(gps.accuracy)} m). Guardamos só a distância até a loja.` : 'Lendo localização…'}</T>
      )}
      {error ? <Banner t="red" icon="alert-circle">{error}</Banner> : null}
      <Button title="Enviar resposta" icon="send" kind="confirm" onPress={submit} loading={busy} />
      <T v="small" color={colors.textMuted}>Cada pessoa responde uma vez por oferta (e pode atualizar depois de 24 horas). Quem publicou não pode confirmar a própria oferta.</T>
    </Sheet>
  );
}

function ReportSheet({ visible, onClose, offerId, onDone }: { visible: boolean; onClose: () => void; offerId: string; onDone: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!reason) return setError('Escolha o motivo.');
    setBusy(true);
    setError(null);
    try {
      await reportOffer(offerId, reason, text);
      showAlert('Denúncia enviada', 'A moderação vai analisar. Uma denúncia gera revisão, não remoção automática.');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Denunciar publicação">
      {REPORT_REASONS.map((r) => (
        <Pressable key={r.id} onPress={() => setReason(r.id)} style={[styles.option, reason === r.id && { borderColor: colors.red, backgroundColor: colors.redSoft }]} accessibilityRole="radio" accessibilityState={{ selected: reason === r.id }}>
          <Ionicons name={reason === r.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={reason === r.id ? colors.redText : colors.textFaint} />
          <T style={{ flex: 1 }}>{r.label}</T>
        </Pressable>
      ))}
      <Field label="Detalhes (opcional)" value={text} onChangeText={setText} multiline />
      {error ? <Banner t="red" icon="alert-circle">{error}</Banner> : null}
      <Button title="Enviar denúncia" icon="flag" kind="danger" onPress={submit} loading={busy} />
    </Sheet>
  );
}

function EditSheet({ visible, onClose, offer, onDone }: { visible: boolean; onClose: () => void; offer: OfferDetail; onDone: () => void }) {
  const [desc, setDesc] = useState(offer.description ?? '');
  const [cond, setCond] = useState(offer.conditions ?? '');
  const [end, setEnd] = useState(formatDateBR(offer.ends_on));
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(end.trim());
    const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : null;
    try {
      await updateMyOffer(offer.id, desc, cond, iso && iso !== offer.ends_on ? iso : null);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Editar publicação">
      <Field label="Descrição" value={desc} onChangeText={setDesc} multiline />
      <Field label="Detalhes das condições" value={cond} onChangeText={setCond} multiline />
      <Field label="Encerramento (só pode antecipar)" value={end} onChangeText={setEnd} placeholder="dd/mm/aaaa" />
      {error ? <Banner t="red" icon="alert-circle">{error}</Banner> : null}
      <Button title="Salvar" icon="checkmark" kind="confirm" onPress={save} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 260, borderRadius: radius.lg, backgroundColor: colors.black },
  thumbWrap: { borderWidth: 2, borderColor: 'transparent', borderRadius: radius.sm + 2 },
  thumb: { width: 64, height: 64, borderRadius: radius.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
