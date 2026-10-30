import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
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
        detectSessionInUrl: false,
      },
    });
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}
