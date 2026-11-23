/**
 * Tela de planos e assinatura.
 *
 * Nada aqui concede plano: a tela só mostra o que o servidor diz e abre o pagamento da Stripe.
 * No aplicativo Android nativo não há botão de compra, porque vender assinatura digital dentro
 * do app pela Stripe contraria a política de pagamentos do Google Play — na web (e no iOS, se
 * um dia houver, com as mesmas ressalvas) o botão aparece.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { isCloudConfigured } from '@/lib/config';
import { showAlert } from '@/lib/dialog';
import { useLoad } from '@/lib/useLoad';
import {
  type Balde, descreveCobranca, economiaAnualCents, fracaoUsada, fraseDeUso, PLANOS, PLANOS_PAGOS,
  type PlanoAnunciado, planoAnunciado, precoDe, quandoZera,
} from '@/domain/planos';
import { assinar, gerenciarAssinatura, meuPlano, PlanoError } from '@/services/planos';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Card, Divider, type IconName, Money, Pill, Row, Screen, SectionTitle, Segmented, T } from '@/ui/components';
import { colors, radius, space } from '@/ui/theme';

/** O Google Play exige a cobrança dele para conteúdo digital dentro do app. */
const COMPRA_NO_APP = Platform.OS !== 'android';

export default function Planos() {
  const { session, isAnonymous } = useApp();
  const { pagamento } = useLocalSearchParams<{ pagamento?: string }>();
  const cloud = isCloudConfigured();
  const conectado = !!session && !isAnonymous;
  const [recarga, setRecarga] = useState(0);
  const [indo, setIndo] = useState(false);
  const [tentativas, setTentativas] = useState(0);

  const { data: estado, error } = useLoad(
    () => (cloud && conectado ? meuPlano() : Promise.resolve(null)),
    [cloud, conectado, session?.user.id, recarga],
  );

  // Voltando do pagamento, o aviso da Stripe pode levar alguns segundos para chegar ao servidor.
  // Em vez de mostrar "plano grátis" a quem acabou de pagar, consultamos de novo por um tempo.
  const esperandoConfirmacao = pagamento === 'concluido' && estado?.plano === 'gratis' && tentativas < 6;
  useEffect(() => {
    if (!esperandoConfirmacao) return;
    const t = setTimeout(() => {
      setTentativas((n) => n + 1);
      setRecarga((n) => n + 1);
    }, 2500);
    return () => clearTimeout(t);
  }, [esperandoConfirmacao, tentativas]);

  const ir = async (fn: () => Promise<void>) => {
    setIndo(true);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof PlanoError ? e.message : 'Não foi possível continuar. Tente de novo.';
      if (e instanceof PlanoError && e.motivo === 'needs_account') {
        showAlert('Entre na sua conta', msg, [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Entrar', onPress: () => router.push('/auth') },
        ]);
      } else {
        showAlert('Assinatura', msg);
      }
    } finally {
      setIndo(false);
    }
  };

  if (!cloud) {
    return (
      <Screen>
        <Banner t="navy" icon="phone-portrait-outline" title="Dados somente neste aparelho">
          Este aplicativo não está conectado a um servidor, então não há assinatura: tudo funciona localmente e sem limite de leitura, porque não há leitura automática.
        </Banner>
      </Screen>
    );
  }

  if (!conectado) {
    return (
      <Screen>
        <Card>
          <T v="heading">Entre para ver o seu plano</T>
          <T color={colors.textMuted}>
            A cota de leitura automática é por conta. Entre ou crie a sua para ver quanto já usou neste mês e para assinar, se quiser mais leituras.
          </T>
          <Button title="Entrar ou criar conta" icon="person-add-outline" onPress={() => router.push('/auth')} />
        </Card>
        <Comparacao />
      </Screen>
    );
  }

  const cobranca = estado ? descreveCobranca(estado) : null;
  const assinante = estado ? estado.plano !== 'gratis' : false;

  return (
    <Screen>
      {pagamento === 'concluido' && esperandoConfirmacao ? (
        <Banner t="navy" icon="time-outline" title="Confirmando o pagamento">
          A Stripe está avisando o servidor. Isso leva alguns segundos; esta tela se atualiza sozinha.
        </Banner>
      ) : null}
      {pagamento === 'concluido' && assinante ? (
        <Banner t="green" icon="checkmark-circle" title="Assinatura ativa">
          Obrigado! Suas leituras automáticas já estão liberadas.
        </Banner>
      ) : null}
      {pagamento === 'cancelado' ? (
        <Banner t="yellow" icon="information-circle" title="Pagamento não concluído">
          Nada foi cobrado. Você continua no plano grátis e pode assinar quando quiser.
        </Banner>
      ) : null}
      {error ? (
        <Banner t="yellow" icon="cloud-offline-outline" title="Não foi possível ler o seu plano">
          Os limites continuam valendo no servidor. Tente de novo em instantes.
        </Banner>
      ) : null}

      <Card>
        <T v="caption" color={colors.textMuted}>SEU PLANO</T>
        <T v="title">{planoAnunciado(estado?.plano ?? 'gratis').nome}</T>
        {cobranca ? (
          <T v="small" color={cobranca.tom === 'atencao' ? colors.yellowText : colors.textMuted}>{cobranca.texto}</T>
        ) : null}

        {estado ? (
          <>
            <Divider />
            <T v="bodyStrong">Leituras automáticas deste mês</T>
            <Uso
              icone="pricetag-outline"
              titulo="Fotos de etiqueta e de produto"
              balde={estado.etiqueta}
              frase={fraseDeUso(estado.etiqueta, 'foto', 'fotos')}
            />
            <Uso
              icone="receipt-outline"
              titulo="Cupons fiscais lidos por foto"
              balde={estado.cupom}
              frase={fraseDeUso(estado.cupom, 'leitura', 'leituras')}
            />
            {estado.voz.limite === null || estado.voz.limite > 0 ? (
              <Uso
                icone="chatbubble-ellipses-outline"
                titulo="Conversas com o assistente"
                balde={estado.voz}
                frase={fraseDeUso(estado.voz, 'conversa', 'conversas')}
              />
            ) : null}
            {estado.plano !== 'gratis' ? (
              <T v="small" color={colors.textMuted}>
                Neste plano as leituras por foto somam numa cota só: as duas primeiras barras mostram a mesma cota.
              </T>
            ) : null}
            <T v="small" color={colors.textFaint}>
              {quandoZera(estado)} Digitar os itens e conferir o cupom digitado não têm limite em nenhum plano.
            </T>
          </>
        ) : null}

        {assinante ? (
          <Button
            title="Gerenciar assinatura"
            icon="card-outline"
            kind="secondary"
            loading={indo}
            onPress={() => ir(gerenciarAssinatura)}
            accessibilityHint="Abre o portal da Stripe para trocar o cartão, ver recibos ou cancelar."
          />
        ) : null}
      </Card>

      {PLANOS_PAGOS.filter((p) => p.id !== estado?.plano).map((p) => (
        <Oferta
          key={p.id}
          plano={p}
          destaque={p.id === 'ia'}
          ocupado={indo}
          onAssinar={(periodo) => ir(() => assinar(precoDe(p.id, periodo)))}
        />
      ))}

      <Comparacao />
    </Screen>
  );
}

function Oferta({ plano, destaque, ocupado, onAssinar }: {
  plano: PlanoAnunciado;
  destaque?: boolean;
  ocupado: boolean;
  onAssinar: (periodo: 'mensal' | 'anual') => void;
}) {
  const [periodo, setPeriodo] = useState<'mensal' | 'anual'>('mensal');
  const economia = economiaAnualCents(plano);
  const cents = periodo === 'mensal' ? plano.mensalCents : plano.anualCents;
  const porMes = `R$ ${((plano.mensalCents ?? 0) / 100).toFixed(2).replace('.', ',')}/mês`;
  const porAno = `R$ ${((plano.anualCents ?? 0) / 100).toFixed(0)}/ano`;
  return (
    <>
      <SectionTitle>{destaque ? 'O plano com o assistente' : 'Quer mais leituras?'}</SectionTitle>
      <Card>
        <Row>
          <T v="heading" style={styles.item}>{plano.nome}</T>
          {plano.disponivel ? null : <Pill label="EM BREVE" t="yellow" />}
        </Row>
        <T v="small" color={colors.textMuted}>{plano.chamada}</T>
        <Segmented
          label={`Como pagar o ${plano.nome}`}
          value={periodo}
          onChange={setPeriodo}
          options={[{ value: 'mensal', label: porMes }, { value: 'anual', label: porAno }]}
        />
        <Row>
          <Money cents={cents} v="title" />
          <T v="small" color={colors.textMuted}>{periodo === 'mensal' ? 'por mês' : 'por ano'}</T>
        </Row>
        {periodo === 'anual' && economia ? (
          <Row gap={space.xs}>
            <Ionicons name="pricetags-outline" size={16} color={colors.greenText} />
            <T v="small" color={colors.greenText}>
              Economia de <Money cents={economia} v="small" color={colors.greenText} /> em doze meses.
            </T>
          </Row>
        ) : null}
        {plano.itens.map((item) => (
          <Row key={item} gap={space.sm}>
            <Ionicons name="checkmark-circle" size={18} color={colors.green} />
            <T v="small" style={styles.item}>{item}</T>
          </Row>
        ))}
        {!plano.disponivel ? (
          <T v="small" color={colors.yellowText}>
            Ainda estamos terminando este plano. Nada aqui está disponível hoje, e por isso ele não pode ser assinado.
          </T>
        ) : COMPRA_NO_APP ? (
          <>
            <Button
              title={`Assinar por ${periodo === 'mensal' ? porMes : porAno}`}
              icon="lock-closed-outline"
              loading={ocupado}
              onPress={() => onAssinar(periodo)}
            />
            <T v="small" color={colors.textFaint}>
              O pagamento é feito na Stripe, com cartão. O Meu Carrin não vê nem guarda o número do seu cartão. Você cancela quando quiser, pelo próprio aplicativo, e continua com o plano até o fim do período já pago.
            </T>
          </>
        ) : (
          <T v="small" color={colors.textMuted}>
            A assinatura é feita e gerenciada no site do Meu Carrin, no navegador. Entrando com a mesma conta, o plano vale também aqui no aplicativo.
          </T>
        )}
      </Card>
    </>
  );
}

function Uso({ icone, titulo, balde, frase }: { icone: IconName; titulo: string; balde: Balde; frase: string }) {
  const fracao = fracaoUsada(balde);
  const acabou = balde.limite !== null && (balde.resta ?? 0) <= 0;
  return (
    <View style={styles.uso}>
      <Row gap={space.sm}>
        <Ionicons name={icone} size={18} color={colors.textMuted} />
        <T v="small" style={styles.item}>{titulo}</T>
      </Row>
      {fracao === null ? null : (
        <View style={styles.trilho} accessibilityRole="progressbar" accessibilityLabel={`${titulo}: ${frase}`}>
          <View style={[styles.preenchido, { width: `${Math.round(fracao * 100)}%`, backgroundColor: acabou ? colors.red : colors.navy }]} />
        </View>
      )}
      <T v="small" color={acabou ? colors.redText : colors.textMuted}>{frase}</T>
    </View>
  );
}

function Comparacao() {
  return (
    <>
      <SectionTitle>O que cada plano inclui</SectionTitle>
      {PLANOS.map((p) => (
        <Card key={p.id}>
          <Row>
            <T v="heading" style={styles.item}>{p.nome}</T>
            {p.mensalCents === null ? <T v="bodyStrong" color={colors.greenText}>R$ 0</T> : <Money cents={p.mensalCents} />}
          </Row>
          <T v="small" color={colors.textMuted}>{p.chamada}</T>
          {p.itens.map((item) => (
            <Row key={item} gap={space.sm}>
              <Ionicons name="checkmark" size={16} color={colors.textMuted} />
              <T v="small" style={styles.item}>{item}</T>
            </Row>
          ))}
        </Card>
      ))}
      <T v="small" color={colors.textFaint}>
        A cota existe porque cada leitura por foto usa inteligência artificial e é paga por imagem. O resto do aplicativo não tem limite em nenhum plano.
      </T>
    </>
  );
}

const styles = StyleSheet.create({
  item: { flex: 1 },
  uso: { gap: space.xs },
  trilho: { height: 8, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
  preenchido: { height: 8, borderRadius: radius.pill },
});
