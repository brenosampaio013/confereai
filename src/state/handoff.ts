import type { LabelReading } from '@/domain/labelParser';

/**
 * Passagem de resultados entre telas sem colocar dados grandes na URL
 * (ex.: leitura de etiqueta → formulário do item).
 */
const labelResults = new Map<string, LabelReading>();

export const handoff = {
  putLabel(token: string, reading: LabelReading) {
    labelResults.set(token, reading);
  },
  takeLabel(token: string): LabelReading | null {
    const r = labelResults.get(token) ?? null;
    labelResults.delete(token);
    return r;
  },
};
