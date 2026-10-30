/**
 * Configuração pública do aplicativo (variáveis EXPO_PUBLIC_* são embutidas no app e
 * NÃO podem conter segredos). Chaves de OCR/IA ficam somente na Edge Function.
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Consulta opcional à base pública Open Food Facts para sugerir nome/marca pelo código. */
  openFoodFacts: (process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS ?? 'true') !== 'false',
  privacyContactEmail: process.env.EXPO_PUBLIC_PRIVACY_CONTACT || 'atendimentoencantoindiana@gmail.com',
};

export const isCloudConfigured = () => !!config.supabaseUrl && !!config.supabaseAnonKey;
