import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { plural } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { useOnline } from '@/services/network';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Card, Divider, EmptyState, Money, Row, SectionTitle, T, IconName } from '@/ui/components';
import { Logo } from '@/ui/Logo';
import { PurchaseRow } from '@/ui/PurchaseRow';
import { colors, radius, space } from '@/ui/theme';

export default function Home() {
  const { repo, active, totals, version, ensureActivePurchase, bump, session, isAnonymous } = useApp();
  const online = useOnline();
  const { data: summaries } = useLoad(() => repo.listPurchaseSummaries(50), [version]);
  const recent = (summaries ?? []).filter((s) => s.purchase.status !== 'active').slice(0, 4);
  const withIssues = (summaries ?? []).filter((s) => s.openDivergences > 0);
  const openTotal = withIssues.reduce((a, s) => a + s.openDivergences, 0);
  const email = session && !isAnonymous ? session.user.email : null;

  const startNew = async () => {
    const begin = async () => {
      await ensureActivePurchase();
      router.push('/scan');
    };
    if (active) {
      Alert.alert(
        'Você tem uma compra em andamento',
        `Ela tem ${plural(totals.lineCount, 'item', 'itens')}. Ao iniciar uma nova, a atual é encerrada e fica salva no histórico.`,
        [
          { text: 'Continuar a atual', style: 'cancel', onPress: () => router.push('/scan') },
          {
            text: 'Iniciar nova',
            onPress: async () => {
              await repo.updatePurchase(active.id, { status: 'closed' });
              const p = await repo.startPurchase('cart');
              bump();
              if (p) router.push('/scan');
            },
          },
        ],
      );
      return;
    }
    await begin();
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Logo size={34} />
        </Row>
        <View style={{ gap: 2 }}>
          <T v="title">{email ? `Olá, ${email.split('@')[0]}!` : 'Olá!'}</T>
          <T color={colors.textMuted}>Registre o que vai comprar e confira o cupom no caixa.</T>
        </View>

        {online === false ? (
          <Banner t="yellow" icon="cloud-offline-outline" title="Você está sem internet">
            Pode continuar escaneando e registrando preços normalmente. A leitura automática de cupons e a sincronização voltam quando a conexão retornar.
          </Banner>
        ) : null}

        {active ? (
          <Card style={{ backgroundColor: colors.navy, borderColor: colors.navy }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="caption" color="#B9C9DA" style={{ textTransform: 'uppercase' }}>Compra em andamento</T>
              <T v="small" color="#B9C9DA">{plural(totals.unitCount, 'unidade', 'unidades')}</T>
            </Row>
            <View>
              <Money cents={totals.totalCents} v="display" color={colors.white} />
              <T v="small" color="#B9C9DA">
                {plural(totals.lineCount, 'produto registrado', 'produtos registrados')}
                {active.storeName ? ` · ${active.storeName}` : ''}
              </T>
            </View>
            <Row>
              <Button title="Escanear" icon="barcode-outline" kind="confirm" onPress={() => router.push('/scan')} style={{ flex: 1 }} />
              <Button title="Carrinho" icon="cart-outline" kind="secondary" onPress={() => router.push('/cart')} style={{ flex: 1 }} />
            </Row>
            <Button
              title="Conferir a nota desta compra"
              icon="receipt-outline"
              kind="ghost"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
              onPress={() => router.push({ pathname: '/receipt/capture', params: { purchaseId: active.id } })}
            />
          </Card>
        ) : (
          <Button title="Nova compra" icon="add-circle" onPress={startNew} style={{ minHeight: 60 }} />
        )}

        <View style={styles.actions}>
          <ActionTile icon="barcode-outline" title="Escanear produtos" text="Leia o código de barras e registre o preço" onPress={startNew} />
          <ActionTile
            icon="receipt-outline"
            title="Conferir nota fiscal"
            text="Fotografe o cupom, mesmo sem ter escaneado"
            onPress={() => router.push('/receipt/capture')}
            accent
          />
        </View>

        {withIssues.length ? (
          <Card onPress={() => router.push('/history')} accessibilityLabel="Ver divergências anteriores">
            <Row>
              <Ionicons name="alert-circle" size={22} color={colors.yellow} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{plural(openTotal, 'ponto a revisar', 'pontos a revisar')}</T>
                <T v="small" color={colors.textMuted}>
                  Em {plural(withIssues.length, 'conferência anterior', 'conferências anteriores')}. Toque para ver.
                </T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Row>
          </Card>
        ) : null}

        <SectionTitle action={recent.length ? <Button title="Ver tudo" kind="ghost" compact onPress={() => router.push('/history')} /> : null}>
          Últimas compras
        </SectionTitle>
        <Card style={{ paddingVertical: space.xs }}>
          {recent.length ? (
            recent.map((s, i) => (
              <View key={s.purchase.id}>
                {i > 0 ? <Divider /> : null}
                <PurchaseRow s={s} />
              </View>
            ))
          ) : (
            <EmptyState icon="bag-handle-outline" title="Nenhuma compra salva ainda" text="Suas compras e conferências aparecem aqui." />
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionTile({ icon, title, text, onPress, accent }: { icon: IconName; title: string; text: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.tileIcon, accent && { backgroundColor: colors.greenSoft }]}>
        <Ionicons name={icon} size={24} color={accent ? colors.green : colors.navy} />
      </View>
      <T v="bodyStrong">{title}</T>
      <T v="small" color={colors.textMuted}>{text}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.md },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: 150,
  },
  tileIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.navySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
