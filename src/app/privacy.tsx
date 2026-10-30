import { config } from '@/lib/config';
import { Card, Screen, T } from '@/ui/components';
import { colors } from '@/ui/theme';
import { View } from 'react-native';

/**
 * Política de privacidade (modelo preparado para publicação). Antes de publicar nas lojas,
 * preencha o controlador dos dados e o contato do encarregado (EXPO_PUBLIC_PRIVACY_CONTACT)
 * e revise com assessoria jurídica conforme a LGPD.
 */
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Quais dados tratamos',
    body: [
      'Dados das suas compras que você registra: produtos, códigos de barras, quantidades, preços, estabelecimento e data.',
      'Dados extraídos de cupons fiscais que você fotografa: itens, valores, CNPJ do estabelecimento, data e chave de acesso. Não coletamos seu CPF; se ele estiver impresso no cupom, não é salvo pelo aplicativo.',
      'Se você criar uma conta: e-mail e senha (a senha é guardada de forma protegida pelo provedor de autenticação, nunca em texto).',
    ],
  },
  {
    title: 'Onde os dados ficam',
    body: [
      'Sem conta, tudo fica apenas no seu aparelho.',
      'Com conta, os dados são sincronizados com o banco de dados do Confere Aí (Supabase), com acesso restrito a você por regras de segurança por usuário.',
      'As fotos de cupons não são enviadas para a nuvem para armazenamento. Elas ficam no aparelho até a leitura e são apagadas em seguida. Fotos de embalagens que você tirar ficam apenas no aparelho.',
    ],
  },
  {
    title: 'Leitura automática de imagens',
    body: [
      'Quando você pede a leitura automática, a imagem é enviada com conexão criptografada para a função do servidor do Confere Aí, que a repassa ao serviço de reconhecimento de texto configurado (por exemplo, a API da Anthropic ou o Google Cloud Vision). A imagem é usada somente para extrair o texto e não é armazenada pelo Confere Aí.',
      'Os provedores têm suas próprias políticas de retenção, informadas nos respectivos termos. O envio só ocorre após o seu consentimento, que pode ser revogado na aba Conta.',
      'Os cálculos da conferência são feitos por regras fixas no próprio aplicativo; a inteligência artificial não decide valores.',
    ],
  },
  {
    title: 'Consulta de produtos',
    body: [
      'Ao ler um código de barras desconhecido, o aplicativo pode consultar a base pública Open Food Facts enviando apenas o número do código. Nenhum dado pessoal é enviado. Esta consulta pode ser desativada pelo operador do aplicativo.',
    ],
  },
  {
    title: 'Seus direitos',
    body: [
      'Você pode corrigir qualquer dado, excluir compras individualmente, excluir todos os dados do aparelho e excluir sua conta com todos os dados da nuvem, a qualquer momento, na aba Conta.',
      'Não vendemos nem compartilhamos seus dados com terceiros para publicidade.',
    ],
  },
  {
    title: 'Limitações',
    body: [
      'O Confere Aí é uma ferramenta de apoio. Ele não garante a identificação de todos os erros e não substitui a conferência do cupom impresso. Alertas indicam pontos de atenção, não a confirmação de cobrança indevida.',
    ],
  },
];

export default function Privacy() {
  return (
    <Screen>
      <T v="title">Política de privacidade</T>
      {SECTIONS.map((s) => (
        <Card key={s.title}>
          <T v="heading">{s.title}</T>
          {s.body.map((b) => (
            <View key={b.slice(0, 24)}>
              <T v="small" color={colors.text}>{b}</T>
            </View>
          ))}
        </Card>
      ))}
      <T v="small" color={colors.textMuted}>
        {config.privacyContactEmail ? `Contato sobre privacidade: ${config.privacyContactEmail}` : 'Contato do encarregado de dados: a ser informado pelo operador antes da publicação.'}
      </T>
    </Screen>
  );
}
