import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { isCloudConfigured } from '@/lib/config';
import { fmtDate } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { getSupabase } from '@/services/supabase';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Card, Divider, KeyValue, Row, Screen, SectionTitle, Sheet, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

export default function Account() {
  const { repo, session, isAnonymous, syncNow, lastSync, pending, bump, version } = useApp();
  const [syncing, setSyncing] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const { data: consent, reload } = useLoad(() => repo.getSetting('ocr_consent'), [version]);
  const { data: products } = useLoad(() => repo.listProducts(), [version, productsOpen]);
  const cloud = isCloudConfigured();
  const signedIn = !!session && !isAnonymous;

  const doSync = async () => {
    setSyncing(true);
    const r = await syncNow();
    setSyncing(false);
    if (r?.skipped === 'offline') Alert.alert('Sem internet', 'Seus dados estão salvos no aparelho e serão sincronizados quando a conexão voltar.');
    else if (r?.error) Alert.alert('Sincronização incompleta', `${r.error}\nOs dados locais foram mantidos e o envio será tentado novamente.`);
  };

  const signOut = () => {
    Alert.alert('Sair da conta', 'Deseja manter os dados neste aparelho?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair e manter', onPress: async () => { await getSupabase()?.auth.signOut(); bump(); } },
      {
        text: 'Sair e apagar daqui',
        style: 'destructive',
        onPress: async () => {
          if (pending > 0) {
            Alert.alert('Há dados não sincronizados', `${pending} alteração(ões) ainda não foram enviadas. Sincronize antes de apagar para não perdê-las.`);
            return;
          }
          await getSupabase()?.auth.signOut();
          await repo.wipeAll();
          bump();
        },
      },
    ]);
  };

  const wipeLocal = () => {
    Alert.alert(
      'Excluir os dados deste aparelho?',
      `Compras, produtos, preços e conferências serão apagados deste aparelho.${signedIn ? ' Os dados já sincronizados continuam na sua conta.' : ' Como você não está conectado a uma conta, não será possível recuperá-los.'}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: async () => { await repo.wipeAll(); bump(); } },
      ],
    );
  };

  const deleteAccount = () => {
    Alert.alert('Excluir conta e dados da nuvem?', 'Sua conta e todos os dados sincronizados serão excluídos definitivamente. Os dados deste aparelho também serão apagados.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir tudo',
        style: 'destructive',
        onPress: async () => {
          const sb = getSupabase();
          const { error } = (await sb?.rpc('delete_my_account')) ?? { error: null };
          if (error) {
            Alert.alert('Não foi possível excluir', `${error.message}\nVerifique a conexão e tente novamente.`);
            return;
          }
          await sb?.auth.signOut();
          await repo.wipeAll();
          bump();
        },
      },
    ]);
  };

  return (
    <Screen>
      {!cloud ? (
        <Banner t="navy" icon="phone-portrait-outline" title="Dados somente neste aparelho">
          Este aplicativo não está conectado a um servidor. Tudo funciona localmente; contas, sincronização e leitura automática de cupons ficam indisponíveis até a configuração do Supabase (veja o README).
        </Banner>
      ) : signedIn ? (
        <Card>
          <T v="caption" color={colors.textMuted}>CONTA</T>
          <T v="heading">{session!.user.email}</T>
          <KeyValue label="Alterações a enviar" value={String(pending)} />
          {lastSync ? (
            <KeyValue
              label="Última sincronização"
              value={lastSync.skipped === 'offline' ? 'Sem internet' : lastSync.error ? 'Falhou (tentará de novo)' : `${lastSync.pushed} enviados · ${lastSync.pulled} recebidos`}
            />
          ) : null}
          <Row>
            <Button title="Sincronizar" icon="sync-outline" kind="secondary" compact onPress={doSync} loading={syncing} style={{ flex: 1 }} />
            <Button title="Sair" icon="log-out-outline" kind="ghost" compact onPress={signOut} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <Card>
          <T v="heading">Guarde suas compras na nuvem</T>
          <T color={colors.textMuted}>
            Você pode usar o Confere Aí sem conta: tudo fica salvo neste aparelho. Crie uma conta para fazer cópia de segurança e acessar o histórico em outro celular.
          </T>
          <Button title="Entrar ou criar conta" icon="person-add-outline" onPress={() => router.push('/auth')} />
        </Card>
      )}

      <SectionTitle>Seus dados</SectionTitle>
      <Card>
        <Button title={`Produtos cadastrados (${products?.length ?? 0})`} icon="pricetags-outline" kind="secondary" onPress={() => setProductsOpen(true)} />
        <Button title="Política de privacidade" icon="shield-checkmark-outline" kind="secondary" onPress={() => router.push('/privacy')} />
        {consent === '1' ? (
          <Button
            title="Revogar consentimento de leitura automática"
            icon="eye-off-outline"
            kind="ghost"
            onPress={async () => {
              await repo.setSetting('ocr_consent', null);
              reload();
              Alert.alert('Consentimento revogado', 'Nenhuma imagem será enviada sem nova autorização.');
            }}
          />
        ) : null}
        <Divider />
        <Button title="Excluir dados deste aparelho" icon="trash-outline" kind="danger" onPress={wipeLocal} />
        {signedIn ? <Button title="Excluir conta e dados da nuvem" icon="person-remove-outline" kind="danger" onPress={deleteAccount} /> : null}
      </Card>

      <View style={{ gap: 2, alignItems: 'center', paddingTop: space.md }}>
        <T v="small" color={colors.textFaint}>Confere Aí · versão {Constants.expoConfig?.version ?? '—'}</T>
        <T v="small" color={colors.textFaint} center>Ferramenta de apoio à conferência. Não substitui a verificação do cupom impresso.</T>
      </View>

      <Sheet visible={productsOpen} onClose={() => setProductsOpen(false)} title="Produtos cadastrados">
        {(products ?? []).length === 0 ? <T color={colors.textMuted}>Os produtos que você escanear aparecem aqui.</T> : null}
        {(products ?? []).map((p) => (
          <Card key={p.id} onPress={() => { setProductsOpen(false); router.push(`/product/${p.id}`); }}>
            <T v="bodyStrong">{p.name}</T>
            <T v="small" color={colors.textMuted}>{[p.brand, p.barcode, `desde ${fmtDate(p.createdAt)}`].filter(Boolean).join(' · ')}</T>
          </Card>
        ))}
      </Sheet>
    </Screen>
  );
}
