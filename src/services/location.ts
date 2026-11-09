/**
 * Localização do aparelho para publicar/confirmar ofertas.
 * A posição é obtida só no momento da ação, enviada ao servidor para calcular a distância
 * até a loja e descartada. O app não guarda histórico de localização.
 */
import * as Location from 'expo-location';
import type { GpsFix } from './marketplace';

export { useForegroundPermissions } from 'expo-location';

export interface FixProgress {
  fix: GpsFix | null;
  done: boolean;
  error: string | null;
}

/**
 * Acompanha o GPS até atingir a precisão desejada ou o tempo limite, informando cada leitura.
 * Retorna uma função para parar.
 */
export async function watchAccurateFix(
  onUpdate: (p: FixProgress) => void,
  opts: { targetAccuracyM?: number; timeoutMs?: number } = {},
): Promise<() => void> {
  const target = opts.targetAccuracyM ?? 30;
  let best: GpsFix | null = null;
  let stopped = false;
  let sub: Location.LocationSubscription | null = null;
  const finish = (error: string | null = null) => {
    if (stopped) return;
    stopped = true;
    sub?.remove();
    clearTimeout(timer);
    onUpdate({ fix: best, done: true, error });
  };
  const timer = setTimeout(() => finish(best ? null : 'Não foi possível obter a localização a tempo.'), opts.timeoutMs ?? 25_000);
  try {
    if (!(await Location.hasServicesEnabledAsync())) {
      finish('O GPS do aparelho está desligado. Ative a localização e tente de novo.');
      return () => finish();
    }
    sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 0 },
      (loc) => {
        const acc = loc.coords.accuracy ?? 9999;
        if (!best || acc < best.accuracy) {
          best = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: acc, capturedAt: new Date(loc.timestamp || Date.now()).toISOString() };
        }
        if (stopped) return;
        onUpdate({ fix: best, done: false, error: null });
        if (acc <= target) finish();
      },
      (reason) => finish(typeof reason === 'string' ? reason : 'Falha ao ler a localização.'),
    );
  } catch (e) {
    finish(e instanceof Error ? e.message : 'Falha ao ler a localização.');
  }
  return () => finish();
}

/** Leitura única (ex.: filtrar ofertas por distância). Não guarda o resultado. */
export async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted) return null;
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    const loc = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch {
    return null;
  }
}
