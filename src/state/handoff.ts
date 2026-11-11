import type { LabelReading } from '@/domain/labelParser';
import type { CaptureReading } from '@/domain/productCapture';

/**
 * Passagem de resultados entre telas sem colocar dados grandes na URL
 * (ex.: leitura de etiqueta → formulário do item).
 */
const labelResults = new Map<string, LabelReading | CaptureReading>();
const photos = new Map<string, string>();

export const handoff = {
  putLabel(token: string, reading: LabelReading | CaptureReading, photoUri?: string | null) {
    labelResults.set(token, reading);
    if (photoUri) photos.set(token, photoUri);
  },
  takeLabel(token: string): LabelReading | CaptureReading | null {
    const r = labelResults.get(token) ?? null;
    labelResults.delete(token);
    return r;
  },
  takePhoto(token: string): string | null {
    const p = photos.get(token) ?? null;
    photos.delete(token);
    return p;
  },
};
