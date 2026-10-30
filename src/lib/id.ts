import * as Crypto from 'expo-crypto';

/** UUID v4 gerado no aparelho (permite criar registros offline e sincronizar sem duplicar). */
export function newId(): string {
  return Crypto.randomUUID();
}
