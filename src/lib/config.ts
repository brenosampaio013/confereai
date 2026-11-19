/**
 * Configuração pública do aplicativo (variáveis EXPO_PUBLIC_* são embutidas no app e
 * NÃO podem conter segredos). Chaves de OCR/IA ficam somente na Edge Function.
 */
/**
 * Projeto Supabase do Meu Carrin. Estes dois valores são públicos por natureza: eles já viajam
 * dentro do pacote que qualquer pessoa baixa, e quem protege os dados são as políticas RLS do
 * banco — nunca o segredo da chave. Ficam aqui, e não só no painel de quem compila, para que o
 * aplicativo publique certo de qualquer lugar.
 *
 * Para apontar para outro projeto (um de testes, por exemplo), defina EXPO_PUBLIC_SUPABASE_URL e
 * EXPO_PUBLIC_SUPABASE_ANON_KEY: as variáveis de ambiente têm prioridade sobre estes valores.
 *
 * A chave `service_role` NUNCA entra aqui nem em qualquer arquivo do aplicativo.
 */
const SUPABASE_URL = 'https://urfqgajoauryxmkbseet.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZnFnYWpvYXVyeXhta2JzZWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMDIyNjMsImV4cCI6MjExMDY3ODI2M30.LGLXovbKtCQ3__cRKXqH-wcJ8jgDeksH5qIFbXj3KJs';

/** Um endereço de servidor, e não uma chave: http(s) e sem espaços nem aspas. Exportado para teste. */
export const pareceEndereco = (v: string) => /^https?:\/\/[^\s"']+$/.test(v);

/**
 * Aceita o valor vindo do ambiente só quando ele tem a cara certa. Trocar o endereço pela chave
 * (ou colar com aspas) é um engano fácil de cometer num painel de compilação e derrubava o
 * aplicativo inteiro: sem endereço válido o cliente nem é criado, e nada abre. Agora o engano é
 * ignorado e o aplicativo publica com o padrão correto, avisando no console de quem compilou.
 */
export function doAmbiente(valor: string | undefined, ehValido: (v: string) => boolean, padrao: string, nome: string) {
  const v = (valor ?? '').trim();
  if (!v) return padrao;
  if (ehValido(v)) return v;
  console.warn(`[config] ${nome} foi ignorada: o valor não tem o formato esperado. Usando o padrão do aplicativo.`);
  return padrao;
}

export const config = {
  supabaseUrl: doAmbiente(process.env.EXPO_PUBLIC_SUPABASE_URL, pareceEndereco, SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: doAmbiente(
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // A chave não é um endereço; o formato exato varia (JWT antigo ou sb_publishable_).
    (v) => !pareceEndereco(v) && v.length >= 8,
    SUPABASE_ANON_KEY,
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ),
  /** Consulta opcional à base pública Open Food Facts para sugerir nome/marca pelo código. */
  openFoodFacts: (process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS ?? 'true') !== 'false',
  /** Endereço público da versão web, usado nos links compartilhados de ofertas. */
  webUrl: (process.env.EXPO_PUBLIC_WEB_URL || 'https://app.meucarrin.com').replace(/\/$/, ''),
  privacyContactEmail: process.env.EXPO_PUBLIC_PRIVACY_CONTACT || 'atendimentoencantoindiana@gmail.com',
};

export const isCloudConfigured = () => !!config.supabaseUrl && !!config.supabaseAnonKey;
