import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Carrega dados quando a tela ganha foco e sempre que `deps` muda.
 * `deps` deve conter apenas valores serializáveis (ids, contadores de versão).
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; reload: () => void; error: string | null } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const depKey = JSON.stringify(deps);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fnRef.current().then(
        (d) => {
          if (alive) {
            setData(d);
            setError(null);
          }
        },
        (e) => {
          if (alive) setError(e instanceof Error ? e.message : String(e));
        },
      );
      return () => {
        alive = false;
      };
      // depKey/tick são os gatilhos de recarga; a função atual vem de fnRef.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depKey, tick]),
  );
  return { data, reload: () => setTick((t) => t + 1), error };
}
