import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { config, isCloudConfigured } from '@/lib/config';
import { secureSessionStorage } from './secureStorage';

let client: SupabaseClient | null = null;

/** Cliente Supabase, ou null quando o projeto não foi configurado (modo somente local). */
export function getSupabase(): SupabaseClient | null {
  if (!isCloudConfigured()) return null;
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        // Na web, o link de recuperação de senha volta para o app com a sessão na URL;
        // é assim que /auth/nova-senha consegue gravar a nova senha. No celular o fluxo
        // chega por deep link e o Supabase não precisa ler a URL.
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}
