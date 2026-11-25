/**
 * Assistente de voz: a pessoa fala o que precisa, o servidor devolve o que entendeu, e cada
 * item só entra no carrinho depois de confirmado — com o preço preenchido na tela de sempre.
 *
 * A IA não sabe preço e não inventa nenhum. Ela identifica o produto, como o leitor de código
 * de barras faz; o preço continua vindo da etiqueta, pela sua mão.
 */
import { Ionicons } from '@expo/vector-icons';
import { useAudioRecorder, useAudioRecorderState, AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { descreverItem, type ItemSugerido } from '@/domain/assistente';
import { isCloudConfigured } from '@/lib/config';
import { showAlert } from '@/lib/dialog';
import { AssistenteError, calarse, type Entendimento, enviarFala, falar } from '@/services/assistente';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Card, EmptyState, Row, Screen, SectionTitle, T } from '@/ui/components';
import { colors, radius, space } from '@/ui/theme';

export default function Assistente() {
  const { session, isAnonymous } = useApp();
  const gravador = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const estadoGravador = useAudioRecorderState(gravador);
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Entendimento | null>(null);
  const [erro, setErro] = useState<AssistenteError | null>(null);
  const conectado = !!session && !isAnonymous;

  useEffect(() => {
    (async () => {
      const permissao = await AudioModule.requestRecordingPermissionsAsync();
      setPermitido(permissao.granted);
      if (permissao.granted) await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    })();
    return () => {
      calarse();
    };
  }, []);

  const comecar = async () => {
    setErro(null);
    setResultado(null);
    calarse();
    try {
      await gravador.prepareToRecordAsync();
      gravador.record();
    } catch {
      showAlert('Microfone', 'Não consegui abrir o microfone. Confira a permissão do aplicativo.');
    }
  };

  const terminar = async () => {
    await gravador.stop();
    const uri = gravador.uri;
    if (!uri) {
      setErro(new AssistenteError('audio', 'A gravação não foi salva. Tente de novo.'));
      return;
    }
    setEnviando(true);
    try {
      const entendido = await enviarFala(uri);
      setResultado(entendido);
      falar(entendido.resposta);
    } catch (e) {
      setErro(e instanceof AssistenteError ? e : new AssistenteError('service_error', 'Não consegui processar sua fala.'));
    } finally {
      setEnviando(false);
    }
  };

  const adicionar = (item: ItemSugerido) => {
    calarse();
    router.push({
      pathname: '/item/add',
      params: {
        via: 'manual',
        nome: item.nome,
        ...(item.marca ? { marca: item.marca } : {}),
        ...(item.quantidade !== null ? { quantidade: String(item.quantidade) } : {}),
        unidade: item.unidade,
      },
    });
  };

  if (!isCloudConfigured()) {
    return (
      <Screen>
        <Banner t="navy" icon="phone-portrait-outline" title="Dados somente neste aparelho">
          O assistente precisa de servidor para funcionar. Enquanto não houver, registre os itens pelo teclado ou pelo leitor de código de barras.
        </Banner>
      </Screen>
    );
  }

  if (!conectado) {
    return (
      <Screen>
        <Card>
          <T v="heading">Entre para falar com o assistente</T>
          <T color={colors.textMuted}>
            O assistente faz parte do plano Meu Carrin IA e precisa de conta para saber de quem é a cota.
          </T>
          <Button title="Entrar ou criar conta" icon="person-add-outline" onPress={() => router.push('/auth')} />
          <Button title="Ver os planos" icon="card-outline" kind="secondary" onPress={() => router.push('/planos')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      {permitido === false ? (
        <Banner t="yellow" icon="mic-off-outline" title="Microfone bloqueado">
          Libere o microfone para o Meu Carrin nas configurações do aparelho. Sem ele não dá para falar; os itens podem ser digitados.
        </Banner>
      ) : null}

      <Card>
        <T v="caption" color={colors.textMuted}>Assistente</T>
        <T v="heading">Fale o que você precisa</T>
        <T v="small" color={colors.textMuted}>
          Por exemplo: “dois quilos de arroz tio joão, um litro de leite e três pacotes de café”. Ele identifica os produtos; o preço você confere na etiqueta, como sempre.
        </T>

        <View style={styles.centro}>
          <Pressable
            onPress={estadoGravador.isRecording ? terminar : comecar}
            disabled={enviando || permitido === false}
            accessibilityRole="button"
            accessibilityLabel={estadoGravador.isRecording ? 'Parar de falar e enviar' : 'Começar a falar'}
            style={({ pressed }) => [
              styles.botao,
              estadoGravador.isRecording && styles.gravando,
              (pressed || enviando) && styles.apertado,
            ]}
          >
            <Ionicons
              name={enviando ? 'hourglass-outline' : estadoGravador.isRecording ? 'stop' : 'mic'}
              size={38}
              color={colors.white}
            />
          </Pressable>
          <T v="small" color={colors.textMuted} center>
            {enviando
              ? 'Entendendo o que você falou…'
              : estadoGravador.isRecording
                ? 'Gravando. Toque para terminar.'
                : 'Toque para falar.'}
          </T>
        </View>
      </Card>

      {erro ? (
        <Banner
          t={erro.motivo === 'sem_plano' || erro.motivo === 'quota' || erro.motivo === 'offline' ? 'yellow' : 'red'}
          icon="alert-circle"
          title={erro.motivo === 'sem_plano' ? 'Disponível no plano Meu Carrin IA' : 'Não consegui usar sua fala'}
        >
          <T v="small" color={colors.text}>{erro.message}</T>
          {erro.motivo === 'sem_plano' || erro.motivo === 'quota' ? (
            <Button title="Ver planos" icon="card-outline" kind="secondary" compact onPress={() => router.push('/planos')} />
          ) : null}
        </Banner>
      ) : null}

      {resultado ? (
        <>
          <Card>
            <T v="caption" color={colors.textMuted}>Você disse</T>
            <T>{resultado.transcricao || '—'}</T>
            {resultado.resposta ? (
              <Row gap={space.sm}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.action} />
                <T v="small" color={colors.action} style={styles.cresce}>{resultado.resposta}</T>
              </Row>
            ) : null}
          </Card>

          {resultado.itens.length ? (
            <>
              <SectionTitle>Confira antes de adicionar</SectionTitle>
              <Card>
                {resultado.itens.map((item, i) => (
                  <Row key={`${item.nome}-${i}`} gap={space.sm}>
                    <Ionicons name="basket-outline" size={18} color={colors.textMuted} />
                    <View style={styles.cresce}>
                      <T v="bodyStrong">{descreverItem(item)}</T>
                      {item.observacao ? <T v="small" color={colors.textMuted}>{item.observacao}</T> : null}
                    </View>
                    <Button title="Adicionar" kind="secondary" compact onPress={() => adicionar(item)} />
                  </Row>
                ))}
                <T v="small" color={colors.textFaint}>
                  Cada item abre a tela de sempre, com nome e quantidade preenchidos, para você conferir e pôr o preço da etiqueta.
                </T>
              </Card>
            </>
          ) : (
            <EmptyState
              icon="help-circle-outline"
              title="Não identifiquei nenhum produto"
              text="Tente dizer os produtos um a um, com a quantidade: “dois quilos de arroz”."
            />
          )}
        </>
      ) : null}

      <T v="small" color={colors.textFaint}>
        O áudio é usado só para entender o pedido e não é guardado — nem aqui, nem no servidor. A identificação é feita por inteligência artificial e pode errar; por isso você confirma cada item.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centro: { alignItems: 'center', gap: space.md, paddingVertical: space.md },
  botao: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gravando: { backgroundColor: colors.red },
  apertado: { opacity: 0.7 },
  cresce: { flex: 1 },
});
