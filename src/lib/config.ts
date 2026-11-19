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

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY,
  /** Consulta opcional à base pública Open Food Facts para sugerir nome/marca pelo código. */
  openFoodFacts: (process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS ?? 'true') !== 'false',
  /** Endereço público da versão web, usado nos links compartilhados de ofertas. */
  webUrl: (process.env.EXPO_PUBLIC_WEB_URL || 'https://app.meucarrin.com').replace(/\/$/, ''),
  privacyContactEmail: process.env.EXPO_PUBLIC_PRIVACY_CONTACT || 'atendimentoencantoindiana@gmail.com',
};

export const isCloudConfigured = () => !!config.supabaseUrl && !!config.supabaseAnonKey;
