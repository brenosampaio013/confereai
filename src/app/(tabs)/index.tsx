import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { painelDoMes } from '@/domain/finance';
import { plural } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { useOnline } from '@/services/network';
import { planoAnunciado } from '@/domain/planos';
import { useApp } from '@/state/AppContext';
import { BudgetSheet, BudgetStrip } from '@/ui/Budget';
import { Banner, Button, Card, Divider, EmptyState, LinkRow, Money, Row, SectionTitle, T } from '@/ui/components';
import { Logo } from '@/ui/Logo';
import { PurchaseRow } from '@/ui/PurchaseRow';
import { colors, highlightShadow, radius, space } from '@/ui/theme';
import { showAlert } from '@/lib/dialog';

export default function Home() {
  const { repo, active, totals, version, bump, session, isAnonymous, budget, thresholds, setThresholds } = useApp();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const online = useOnline();
  const { data: summaries } = useLoad(() => repo.listPurchaseSummaries(50), [version]);
  const { data: gastos } = useLoad(() => repo.listSpendRecords(), [version]);
  const mes = gastos ? painelDoMes(gastos, new Date()) : null;
  const recent = (summaries ?? []).filter((s) => s.purchase.status !== 'active').slice(0, 4);
  const withIssues = (summaries ?? []).filter((s) => s.openDivergences > 0);
  const openTotal = withIssues.reduce((a, s) => a + s.openDivergences, 0);
  const email = session && !isAnonymous ? session.user.email : null;

  const startNew = async () => {
    if (active) {
      showAlert(
        'Você tem uma compra em andamento',
        `Ela tem ${plural(totals.lineCount, 'item', 'itens')}. Ao iniciar uma nova, a atual é encerrada e fica salva em Minhas compras.`,
        [
          { text: 'Continuar a atual', style: 'cancel', onPress: () => router.push('/scan') },
          {
            text: 'Iniciar nova',
            onPress: async () => {
              await repo.updatePurchase(active.id, { status: 'closed' });
              bump();
              setBudgetOpen(true);
            },
          },
        ],
      );
      return;
    }
    setBudgetOpen(true);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Logo size={34} />
        </Row>
        <View style={{ gap: 2 }}>
          <T v="title">{email ? `Olá, ${email.split('@')[0]}!` : 'Olá!'}</T>
          <T color={colors.textMuted}>Registre o que entra no carrinho. No caixa, confira se o cupom bate.</T>
        </View>

        {online === false ? (
          <Banner t="yellow" icon="cloud-offline-outline" title="Você está sem internet">
            Pode continuar escaneando e registrando preços normalmente. A leitura automática de cupons e a sincronização voltam quando a conexão retornar.
          </Banner>
        ) : null}

        {active ? (
          <Card style={styles.destaque}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="bodyStrong" color={colors.onHighlight}>Compra em andamento</T>
              <T v="small" color={colors.onHighlightMuted}>{plural(totals.unitCount, 'unidade', 'unidades')}</T>
            </Row>
            <View>
              <Money cents={totals.totalCents} v="moneyLarge" color={colors.onHighlight} />
              <T v="small" color={colors.onHighlightMuted}>
                {plural(totals.lineCount, 'produto registrado', 'produtos registrados')}
                {active.storeName ? `, ${active.storeName}` : ''}
              </T>
            </View>
            {budget ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md }}>
                <BudgetStrip status={budget} />
              </View>
            ) : null}
            <Row>
              <Button title="Escanear" icon="barcode-outline" kind="confirm" onPress={() => router.push('/scan')} style={{ flex: 1 }} />
              <Button title="Carrinho" icon="cart-outline" kind="onDark" onPress={() => router.push('/purchases')} style={{ flex: 1 }} />
            </Row>
            {/* O assistente só aparece quando o plano que o inclui estiver à venda: não se
                oferece no aplicativo o que ainda não dá para contratar. */}
            {planoAnunciado('ia').disponivel ? (
              <Button title="Falar o que você precisa" icon="mic-outline" kind="onDark" onPress={() => router.push('/assistente')} />
            ) : null}
            <Button
              title="Conferir a nota desta compra"
              icon="receipt-outline"
              kind="onDark"
              onPress={() => router.push({ pathname: '/receipt/capture', params: { purchaseId: active.id } })}
            />
          </Card>
        ) : (
          <Button title="Nova compra" icon="add-circle" onPress={startNew} />
        )}

        {mes ? (
          <Card onPress={() => router.push({ pathname: '/purchases', params: { view: 'summary' } })} accessibilityLabel="Ver o resumo do mês">
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="heading">Este mês</T>
              <Row gap={4}>
                <T v="small" color={colors.action} style={{ fontWeight: '600' }}>Ver resumo</T>
                <Ionicons name="chevron-forward" size={16} color={colors.action} />
              </Row>
            </Row>
            <View>
              <Money cents={mes.totalCents} />
              <T v="small" color={colors.textMuted}>
                {mes.compras ? plural(mes.compras, 'compra encerrada', 'compras encerradas') : 'Nenhuma compra encerrada ainda'}
                {mes.comparacao ? `. ${mes.comparacao}.` : ''}
              </T>
            </View>
          </Card>
        ) : null}

        {withIssues.length ? (
          <Banner
            t="yellow"
            icon="alert-circle"
            title={plural(openTotal, 'ponto a revisar', 'pontos a revisar')}
            action={<Button title="Ver as conferências" kind="secondary" compact onPress={() => router.push({ pathname: '/purchases', params: { view: 'history' } })} />}
          >
            {`Em ${plural(withIssues.length, 'conferência anterior', 'conferências anteriores')}.`}
          </Banner>
        ) : null}

        <View style={{ gap: space.md }}>
          <SectionTitle>O que você quer fazer</SectionTitle>
          <LinkRow icon="receipt-outline" title="Conferir o cupom" text="Compare o que foi cobrado com o que você levou" onPress={() => router.push('/receipt/capture')} />
          <LinkRow icon="barcode-outline" title="Registrar o carrinho" text="Escaneie e informe o preço: é o que o cupom confere depois" onPress={startNew} />
          <LinkRow icon="camera-outline" title="Foto do produto e preço" text="Lê o nome, a marca e o preço da etiqueta" onPress={() => router.push('/capture')} />
          <LinkRow icon="stats-chart-outline" title="Preços e gastos" text="Compare supermercados e veja o resumo do mês" onPress={() => router.push('/prices')} />
          <LinkRow icon="pricetags-outline" title="Ofertas da comunidade" text="Promoções encontradas por pessoas da sua região" onPress={() => router.push('/offers')} />
        </View>

        <View style={{ gap: space.md }}>
          <SectionTitle action={recent.length ? <Button title="Ver tudo" kind="ghost" compact onPress={() => router.push({ pathname: '/purchases', params: { view: 'history' } })} /> : null}>
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
        </View>
      </ScrollView>
      <BudgetSheet
        visible={budgetOpen}
        onClose={() => setBudgetOpen(false)}
        initialCents={null}
        thresholds={thresholds}
        startLabel="Começar a compra"
        onSave={async (cents, t) => {
          await setThresholds(t);
          await repo.startPurchase('cart', null, cents);
          setBudgetOpen(false);
          bump();
          router.push('/scan');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  destaque: { backgroundColor: colors.highlight, borderColor: colors.highlight, borderRadius: radius.xl, padding: 20, gap: space.lg, ...highlightShadow },
});
