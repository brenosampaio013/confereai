import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Armazenamento da sessão do Supabase no Keychain (iOS) / Keystore (Android).
 * O SecureStore limita o tamanho de cada valor, então a sessão é dividida em partes.
 */
const CHUNK = 1800;
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

interface Store {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Na web não há Keychain/Keystore: a sessão fica no armazenamento do navegador (como em qualquer site). */
const webStorage: Store = {
  async getItem(key: string) {
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string) {
    globalThis.localStorage?.setItem(key, value);
  },
  async removeItem(key: string) {
    globalThis.localStorage?.removeItem(key);
  },
};

const nativeStorage: Store = {
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
    await nativeStorage.removeItem(key);
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

/** Guarda duradoura: sobrevive a fechar o aplicativo. */
const durable: Store = Platform.OS === 'web' ? webStorage : nativeStorage;

/**
 * Guarda temporária, usada quando a pessoa NÃO marca "manter conectado":
 * na web, a aba (sessionStorage); no celular, só a memória do processo.
 * Em ambos os casos a sessão termina quando o aplicativo é fechado.
 */
const memory = new Map<string, string>();
const ephemeral: Store = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return globalThis.sessionStorage?.getItem(key) ?? null;
    return memory.get(key) ?? null;
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') globalThis.sessionStorage?.setItem(key, value);
    else memory.set(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') globalThis.sessionStorage?.removeItem(key);
    else memory.delete(key);
  },
};

/** Onde a próxima sessão será gravada. Trocado pela caixa "manter conectado" ao entrar. */
let persist = true;

const REMEMBER_KEY = 'meucarrin.auth.manter-conectado';

/**
 * Define se a sessão fica guardada depois de fechar o aplicativo.
 * Chamado ANTES de entrar: o Supabase grava a sessão pelo adaptador abaixo.
 */
export async function setSessionPersistence(value: boolean): Promise<void> {
  persist = value;
  await durable.setItem(REMEMBER_KEY, value ? '1' : '0').catch(() => {});
}

/** Última escolha da pessoa na caixa "manter conectado" (padrão: sim). */
export async function getSessionPersistence(): Promise<boolean> {
  const v = await durable.getItem(REMEMBER_KEY).catch(() => null);
  const on = v !== '0';
  persist = on;
  return on;
}

/**
 * Adaptador entregue ao Supabase. Lê das duas guardas (a duradoura primeiro) e
 * escreve apenas naquela escolhida, de modo que "não manter conectado" realmente
 * não deixa a sessão no aparelho.
 */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    return (await durable.getItem(key)) ?? (await ephemeral.getItem(key));
  },
  async setItem(key: string, value: string): Promise<void> {
    if (persist) {
      await ephemeral.removeItem(key);
      await durable.setItem(key, value);
    } else {
      await durable.removeItem(key);
      await ephemeral.setItem(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    await durable.removeItem(key);
    await ephemeral.removeItem(key);
  },
};
