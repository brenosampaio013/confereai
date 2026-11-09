import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LOCATION_MESSAGE, relativeTime, REPORT_REASONS, STATUS_LABEL } from '@/domain/marketplace';
import { showAlert } from '@/lib/dialog';
import { useLoad } from '@/lib/useLoad';
import { adminQueue, adminResolveReport, adminReviewLocation, AdminQueue } from '@/services/marketplace';
import { Banner, Button, Card, EmptyState, Field, Loading, Pill, Row, Screen, Segmented, T } from '@/ui/components';
import { PickLocationMap, mapAvailable } from '@/ui/market/OffersMap';
import { colors, radius, space } from '@/ui/theme';

type Tab = 'reports' | 'promotions' | 'stores';

export default function AdminHome() {
  const [tab, setTab] = useState<Tab>('reports');
  const [tick, setTick] = useState(0);
  const { data, error } = useLoad(useCallback(() => adminQueue(), []), [tick]);
  const reload = () => setTick((t) => t + 1);
  if (error) return <Screen><Banner t="red" icon="lock-closed-outline" title="Acesso restrito">{error}</Banner></Screen>;
  if (!data) return <Loading />;
  return (
    <Screen>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'reports', label: `Denúncias (${data.reports.length})` },
          { value: 'promotions', label: `Ofertas (${data.pending_promotions.length})` },
          { value: 'stores', label: `Lojas (${data.pending_locations.length})` },
        ]}
      />
      {tab === 'reports' ? <Reports items={data.reports} onChange={reload} /> : null}
      {tab === 'promotions' ? <Promotions items={data.pending_promotions} /> : null}
      {tab === 'stores' ? <Stores items={data.pending_locations} onChange={reload} /> : null}
      <T v="small" color={colors.textMuted}>Todas as decisões ficam registradas com data e responsável. A moderação vê distância e precisão da verificação de localização, nunca as coordenadas de quem publicou (elas não são armazenadas).</T>
    </Screen>
  );
}

function Reports({ items, onChange }: { items: AdminQueue['reports']; onChange: () => void }) {
  if (!items.length) return <EmptyState icon="checkmark-done-outline" title="Nenhuma denúncia pendente" />;
  const resolve = (id: string, upheld: boolean) =>
    showAlert(upheld ? 'Considerar procedente?' : 'Rejeitar denúncia?', upheld ? 'Isso afeta a reputação de quem publicou. Use "Suspender" ou "Remover" na oferta se for o caso.' : '', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => { await adminResolveReport(id, upheld); onChange(); } },
    ]);
  return (
    <>
      {items.map((r) => (
        <Card key={r.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pill label={REPORT_REASONS.find((x) => x.id === r.reason)?.label ?? r.reason} t="red" icon="flag" />
            <T v="small" color={colors.textFaint}>{relativeTime(r.created_at)}</T>
          </Row>
          <T v="bodyStrong">{r.product_name}</T>
          <T v="small" color={colors.textMuted}>{r.store}</T>
          {r.description ? <T v="small">“{r.description}”</T> : null}
          <Button title="Revisar publicação" icon="search" kind="secondary" compact onPress={() => router.push(`/admin/${r.promotion_id}`)} />
          <Row>
            <Button title="Procedente" kind="danger" compact onPress={() => resolve(r.id, true)} style={{ flex: 1 }} />
            <Button title="Rejeitar" kind="secondary" compact onPress={() => resolve(r.id, false)} style={{ flex: 1 }} />
          </Row>
        </Card>
      ))}
    </>
  );
}

function Promotions({ items }: { items: AdminQueue['pending_promotions'] }) {
  if (!items.length) return <EmptyState icon="checkmark-done-outline" title="Nenhuma oferta aguardando análise" />;
  return (
    <>
      {items.map((p) => (
        <Pressable key={p.id} onPress={() => router.push(`/admin/${p.id}`)} style={styles.row} accessibilityRole="button">
          <T v="bodyStrong">{p.product_name}</T>
          <T v="small" color={colors.textMuted}>{p.store} · {relativeTime(p.created_at)}</T>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Pill label={STATUS_LABEL[p.status]} t={p.status === 'contested' ? 'yellow' : 'navy'} />
            <Pill label={LOCATION_MESSAGE[p.location_status].title} t={p.location_status === 'compatible' ? 'green' : 'neutral'} />
            <Pill label={`Foto: ${p.photo_status === 'pending' ? 'não analisada' : p.photo_status === 'accepted' ? 'aceita' : 'rejeitada'}`} t="neutral" />
          </Row>
        </Pressable>
      ))}
    </>
  );
}

function Stores({ items, onChange }: { items: AdminQueue['pending_locations']; onChange: () => void }) {
  const [radiusText, setRadiusText] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<Record<string, string>>({});
  if (!items.length) return <EmptyState icon="checkmark-done-outline" title="Nenhum estabelecimento sugerido" />;
  return (
    <>
      {items.map((l) => (
        <Card key={l.id}>
          <T v="bodyStrong">{l.name}</T>
          <T v="small" color={colors.textMuted}>{[l.address, l.neighborhood, `${l.city} - ${l.state}`].filter(Boolean).join(' · ')}</T>
          {l.cnpj ? <T v="small">CNPJ {l.cnpj}</T> : null}
          <T v="small" color={colors.textMuted}>Coordenadas da loja: {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}</T>
          {l.nearby_approved ? <Banner t="yellow" icon="copy-outline">{`Já existem ${l.nearby_approved} unidade(s) aprovada(s) a menos de 300 m. Verifique se não é duplicada.`}</Banner> : null}
          {mapAvailable ? <PickLocationMap value={{ latitude: l.latitude, longitude: l.longitude }} onChange={() => {}} center={null} /> : null}
          <Row>
            <View style={{ flex: 1 }}><Field label="Raio (m)" value={radiusText[l.id] ?? ''} onChangeText={(v) => setRadiusText({ ...radiusText, [l.id]: v.replace(/\D/g, '') })} keyboardType="number-pad" hint="Padrão: 200 m" /></View>
            <View style={{ flex: 2 }}><Field label="Logotipo (URL https, opcional)" value={logo[l.id] ?? ''} onChangeText={(v) => setLogo({ ...logo, [l.id]: v })} autoCapitalize="none" /></View>
          </Row>
          <Row>
            <Button title="Aprovar" kind="confirm" compact style={{ flex: 1 }} onPress={async () => {
              try { await adminReviewLocation(l.id, true, radiusText[l.id] ? Number(radiusText[l.id]) : null, logo[l.id]); onChange(); } catch (e) { showAlert('Erro', e instanceof Error ? e.message : ''); }
            }} />
            <Button title="Rejeitar" kind="danger" compact style={{ flex: 1 }} onPress={async () => { await adminReviewLocation(l.id, false); onChange(); }} />
          </Row>
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
