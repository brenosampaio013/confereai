import * as SecureStore from 'expo-secure-store';

/**
 * Armazenamento da sessão do Supabase no Keychain (iOS) / Keystore (Android).
 * O SecureStore limita o tamanho de cada valor, então a sessão é dividida em partes.
 */
const CHUNK = 1800;
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (!count) return null;
    let out = '';
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`);
      if (part == null) return null;
      out += part;
    }
    return out;
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    await this.removeItem(key);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${k}.n`, String(n));
  },
  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (count) for (let i = 0; i < Number(count); i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
  },
};
