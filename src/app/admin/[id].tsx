import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { formatOfferPrice, IMAGE_TYPES, LOCATION_MESSAGE, REPUTATION_LABEL, STATUS_LABEL, LocationStatus, PromotionStatus } from '@/domain/marketplace';
import { fmtDateTime } from '@/lib/format';
import { showAlert } from '@/lib/dialog';
import { useLoad } from '@/lib/useLoad';
import { adminAudit, adminBanUser, adminModerate, getOffer } from '@/services/marketplace';
import { Banner, Button, Card, Divider, Field, KeyValue, Loading, Row, Screen, T } from '@/ui/components';
import { BadgeDetails, StatusPill } from '@/ui/market/Badges';
import { RemoteImage } from '@/ui/RemoteImage';
import { colors, radius, space } from '@/ui/theme';

type Audit = {
  author: { user_id: string; level: string; score: number; published: number; confirmed: number; upheld_reports: number; removed: number; banned_until: string | null };
  location_checks: { check_kind: string; distance_m: number | null; accuracy_m: number | null; radius_m: number; location_status: LocationStatus; checked_at: string }[];
  history: { previous_status: string | null; new_status: PromotionStatus; reason: string | null; changed_at: string }[];
  reports: { reason: string; status: string; description: string | null; created_at: string }[];
  confirmations: { confirmation_type: string; independent: boolean; location_status: string | null; reported_price_cents: number | null; evidence_image_path: string | null; created_at: string }[];
  actions: { action: string; notes: string | null; created_at: string }[];
};

export default function AdminReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tick, setTick] = useState(0);
  const [notes, setNotes] = useState('');
  const { data, error } = useLoad(useCallback(async () => ({ offer: await getOffer(id), audit: (await adminAudit(id)) as unknown as Audit }), [id]), [id, tick]);
  if (error) return <Screen><Banner t="red" icon="lock-closed-outline" title="Acesso restrito">{error}</Banner></Screen>;
  if (!data) return <Loading />;
  const { offer: o, audit } = data;
  if (!o) return <Screen><Banner t="yellow" title="Publicação não encontrada" /></Screen>;

  const act = (action: Parameters<typeof adminModerate>[1], label: string) =>
    showAlert(`${label}?`, notes ? `Observação: ${notes}` : 'Você pode registrar uma observação antes de confirmar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: label, onPress: async () => { try { await adminModerate(id, action, notes); setNotes(''); setTick((t) => t + 1); } catch (e) { showAlert('Erro', e instanceof Error ? e.message : ''); } } },
    ]);
  const ban = (days: number | null) =>
    showAlert(days ? `Suspender a conta por ${days} dias?` : 'Retirar suspensão?', 'A pessoa não poderá publicar, confirmar ou denunciar durante a suspensão.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => { await adminBanUser(audit.author.user_id, days, notes || 'Abuso das regras'); setTick((t) => t + 1); } },
    ]);

  return (
    <Screen>
      <Row style={{ flexWrap: 'wrap' }}><StatusPill status={o.status} /></Row>
      <T v="title">{o.product_name}</T>
      <T v="heading" color={colors.greenText}>{formatOfferPrice(o.promotional_price_cents, o.sale_unit)}{o.regular_price_cents ? `  (anterior informado ${formatOfferPrice(o.regular_price_cents, o.sale_unit)})` : ''}</T>
      <T color={colors.textMuted}>{o.store.name} · {o.store.address} · {o.store.city}{o.store.approved ? '' : ' · UNIDADE PENDENTE'}</T>

      <ScrollView horizontal contentContainerStyle={{ gap: space.sm }}>
        {o.images.map((img) => (
          <View key={img.path} style={{ gap: 4 }}>
            <RemoteImage path={img.path} style={{ width: 220, height: 280, borderRadius: radius.md, backgroundColor: colors.black }} contentFit="contain" />
            <T v="small" color={colors.textMuted}>{IMAGE_TYPES.find((t) => t.id === img.type)?.label}</T>
          </View>
        ))}
      </ScrollView>

      <Card>
        <T v="heading">Indicadores</T>
        <BadgeDetails flags={o} />
        <KeyValue label="Foto" value={o.photo_status === 'pending' ? 'Não analisada' : o.photo_status === 'accepted' ? 'Aceita' : 'Rejeitada'} />
        <KeyValue label="Moderação" value={o.moderation_status} />
      </Card>

      <Card>
        <T v="heading">Verificações de localização</T>
        {audit.location_checks.map((c, i) => (
          <T key={i} v="small" color={colors.textMuted}>
            {c.check_kind === 'publication' ? 'Publicação' : 'Confirmação'}: {LOCATION_MESSAGE[c.location_status].title}
            {c.distance_m != null ? ` · ${c.distance_m} m (raio ${c.radius_m} m, precisão ${c.accuracy_m} m)` : ''} · {fmtDateTime(c.checked_at)}
          </T>
        ))}
        <T v="small" color={colors.textFaint}>A localização pode ser adulterada em aparelhos modificados: avalie junto com as fotos e o histórico.</T>
      </Card>

      <Card>
        <T v="heading">Quem publicou</T>
        <KeyValue label="Nível" value={REPUTATION_LABEL[audit.author.level]} />
        <KeyValue label="Publicadas / confirmadas" value={`${audit.author.published} / ${audit.author.confirmed}`} />
        <KeyValue label="Denúncias procedentes / removidas" value={`${audit.author.upheld_reports} / ${audit.author.removed}`} />
        {audit.author.banned_until ? <Banner t="red" icon="ban">{`Suspensa até ${fmtDateTime(audit.author.banned_until)}`}</Banner> : null}
        <Row>
          <Button title="Suspender 7 dias" kind="danger" compact onPress={() => ban(7)} style={{ flex: 1 }} />
          <Button title="Retirar suspensão" kind="secondary" compact onPress={() => ban(null)} style={{ flex: 1 }} />
        </Row>
      </Card>

      <Card>
        <T v="heading">Confirmações e denúncias</T>
        {audit.confirmations.map((c, i) => (
          <T key={`c${i}`} v="small" color={colors.textMuted}>
            {c.confirmation_type}{c.independent ? '' : ' (conta nova, não conta)'}{c.reported_price_cents ? ` · informou ${formatOfferPrice(c.reported_price_cents, o.sale_unit)}` : ''}{c.location_status ? ` · ${LOCATION_MESSAGE[c.location_status as LocationStatus].title}` : ''} · {fmtDateTime(c.created_at)}
          </T>
        ))}
        {audit.confirmations.length === 0 ? <T v="small" color={colors.textMuted}>Nenhuma confirmação.</T> : null}
        <Divider />
        {audit.reports.map((r, i) => <T key={`r${i}`} v="small" color={colors.textMuted}>{r.reason} ({r.status}){r.description ? `: ${r.description}` : ''} · {fmtDateTime(r.created_at)}</T>)}
        {audit.reports.length === 0 ? <T v="small" color={colors.textMuted}>Nenhuma denúncia.</T> : null}
      </Card>

      <Card>
        <T v="heading">Histórico</T>
        {audit.history.map((h, i) => <T key={i} v="small" color={colors.textMuted}>{h.previous_status ? `${STATUS_LABEL[h.previous_status as PromotionStatus]} → ` : ''}{STATUS_LABEL[h.new_status]}{h.reason ? ` (${h.reason})` : ''} · {fmtDateTime(h.changed_at)}</T>)}
        {audit.actions.map((a, i) => <T key={`a${i}`} v="small" color={colors.navy}>Moderação: {a.action}{a.notes ? ` — ${a.notes}` : ''} · {fmtDateTime(a.created_at)}</T>)}
      </Card>

      <Card>
        <T v="heading">Decisão</T>
        <Field label="Observação (fica registrada)" value={notes} onChangeText={setNotes} multiline />
        <Row>
          <Button title="Aceitar foto" kind="secondary" compact onPress={() => act('accept_photo', 'Aceitar foto')} style={{ flex: 1 }} />
          <Button title="Rejeitar foto" kind="secondary" compact onPress={() => act('reject_photo', 'Rejeitar foto')} style={{ flex: 1 }} />
        </Row>
        <Button title="Aprovar publicação" icon="shield-checkmark" kind="confirm" onPress={() => act('approve', 'Aprovar')} />
        <Row>
          <Button title="Suspender" kind="secondary" compact onPress={() => act('suspend', 'Suspender')} style={{ flex: 1 }} />
          <Button title="Restaurar" kind="secondary" compact onPress={() => act('restore', 'Restaurar')} style={{ flex: 1 }} />
        </Row>
        <Button title="Remover publicação" icon="trash-outline" kind="danger" onPress={() => act('remove', 'Remover')} />
      </Card>
    </Screen>
  );
}
