import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { CATEGORIES, relativeTime } from '@/domain/marketplace';
import { showAlert } from '@/lib/dialog';
import { useLoad } from '@/lib/useLoad';
import { getPrefs, hasAccount, listNotifications, markNotificationsRead, NotificationPrefs, savePrefs } from '@/services/marketplace';
import { enablePush } from '@/services/push';
import { Banner, Button, Card, EmptyState, Field, Loading, Row, Screen, Segmented, T } from '@/ui/components';
import { colors, radius, space } from '@/ui/theme';

const DEFAULT: NotificationPrefs = { city: null, state: null, notify_nearby: false, favorite_categories: [], favorite_terms: [], notify_my_promotions: true, notify_expiring_favorites: true, push_enabled: false };

export default function NotificationsScreen() {
  const [tab, setTab] = useState<'inbox' | 'prefs'>('inbox');
  const { data: account } = useLoad(useCallback(() => hasAccount(), []), []);
  if (account === undefined) return <Loading />;
  if (!account) {
    return (
      <Screen>
        <Banner t="navy" icon="notifications-outline" title="Avisos de ofertas">Entre na sua conta para receber avisos de novas ofertas na sua cidade, de produtos favoritos e das suas publicações.</Banner>
        <Button title="Entrar ou criar conta" onPress={() => router.push('/auth')} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'inbox', label: 'Avisos' }, { value: 'prefs', label: 'Preferências' }]} />
      {tab === 'inbox' ? <Inbox /> : <Prefs />}
    </Screen>
  );
}

function Inbox() {
  const { data, error } = useLoad(useCallback(() => listNotifications(), []), []);
  useEffect(() => {
    if (data?.some((n) => !n.read_at)) markNotificationsRead().catch(() => {});
  }, [data]);
  if (error) return <Banner t="red" icon="alert-circle">{error}</Banner>;
  if (!data) return <Loading />;
  if (!data.length) return <EmptyState icon="notifications-off-outline" title="Nenhum aviso ainda" text="Você só recebe avisos sobre acontecimentos reais: ofertas novas que combinam com suas preferências e novidades das suas publicações." />;
  return (
    <>
      {data.map((n) => (
        <Pressable key={n.id} onPress={() => n.promotion_id && router.push(`/offers/${n.promotion_id}`)} style={[styles.item, !n.read_at && { borderColor: colors.navy }]} accessibilityRole="button">
          <T v="bodyStrong">{n.title}</T>
          <T v="small" color={colors.textMuted}>{n.body}</T>
          <T v="small" color={colors.textFaint}>{relativeTime(n.created_at)}</T>
        </Pressable>
      ))}
    </>
  );
}

function Prefs() {
  const [p, setP] = useState<NotificationPrefs | null>(null);
  const [terms, setTerms] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    getPrefs().then((x) => {
      const v = x ?? DEFAULT;
      setP(v);
      setTerms(v.favorite_terms.join(', '));
    });
  }, []);
  if (!p) return <Loading />;
  const save = async () => {
    if (p.notify_nearby || p.favorite_categories.length || terms.trim()) {
      if (!p.city || !p.state || !/^[A-Z]{2}$/.test(p.state)) return showAlert('Informe sua cidade', 'Os avisos de ofertas novas usam a cidade que você escolher, não a sua localização.');
    }
    setSaving(true);
    try {
      await savePrefs({ ...p, favorite_terms: terms.split(',').map((t) => t.trim()).filter((t) => t.length >= 3).slice(0, 20) });
      showAlert('Preferências salvas', '');
    } catch (e) {
      showAlert('Não foi possível salvar', e instanceof Error ? e.message : '');
    } finally {
      setSaving(false);
    }
  };
  const toggleCat = (id: string) => setP({ ...p, favorite_categories: p.favorite_categories.includes(id) ? p.favorite_categories.filter((c) => c !== id) : [...p.favorite_categories, id] });
  return (
    <>
      <Card>
        <T v="heading">Ofertas novas na sua cidade</T>
        <T v="small" color={colors.textMuted}>Usamos a cidade informada aqui, não a sua localização.</T>
        <Row>
          <View style={{ flex: 3 }}><Field label="Cidade" value={p.city ?? ''} onChangeText={(v) => setP({ ...p, city: v || null })} autoCapitalize="words" /></View>
          <View style={{ flex: 1 }}><Field label="UF" value={p.state ?? ''} onChangeText={(v) => setP({ ...p, state: v.toUpperCase().slice(0, 2) || null })} autoCapitalize="characters" /></View>
        </Row>
        <Toggle label="Avisar sobre qualquer oferta nova na cidade" value={p.notify_nearby} onChange={(v) => setP({ ...p, notify_nearby: v })} />
        <T v="small" style={{ fontWeight: '600' }}>Categorias favoritas</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORIES.map((c) => {
            const on = p.favorite_categories.includes(c.id);
            return (
              <Pressable key={c.id} onPress={() => toggleCat(c.id)} style={[styles.chip, on && { backgroundColor: colors.navy, borderColor: colors.navy }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <T v="small" color={on ? colors.white : colors.text}>{c.label}</T>
              </Pressable>
            );
          })}
        </View>
        <Field label="Produtos favoritos" value={terms} onChangeText={setTerms} placeholder="Ex.: café, picanha, sabão em pó" hint="Separe por vírgulas." />
      </Card>
      <Card>
        <T v="heading">Suas publicações e favoritos</T>
        <Toggle label="Quando minha oferta for confirmada ou contestada" value={p.notify_my_promotions} onChange={(v) => setP({ ...p, notify_my_promotions: v })} />
        <Toggle label="Quando uma oferta favorita estiver perto de vencer" value={p.notify_expiring_favorites} onChange={(v) => setP({ ...p, notify_expiring_favorites: v })} />
      </Card>
      <Card>
        <T v="heading">Notificações no celular</T>
        <Toggle
          label="Receber também como notificação push"
          value={p.push_enabled}
          onChange={async (v) => {
            if (!v) return setP({ ...p, push_enabled: false });
            const r = await enablePush();
            showAlert(r.ok ? 'Pronto' : 'Push indisponível', r.message);
            setP({ ...p, push_enabled: r.ok });
          }}
        />
      </Card>
      <Button title="Salvar preferências" icon="checkmark" kind="confirm" onPress={save} loading={saving} />
    </>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <T style={{ flex: 1 }}>{label}</T>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.green, false: colors.border }} accessibilityLabel={label} />
    </Row>
  );
}

const styles = StyleSheet.create({
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: 3, borderWidth: 1, borderColor: colors.border },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
