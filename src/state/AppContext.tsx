import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { ExpoSqliteDriver } from '@/data/expoDriver';
import { Repository } from '@/data/repository';
import { migrate } from '@/data/schema';
import { SyncResult, SyncService } from '@/data/sync';
import { cartTotals, CartTotals } from '@/domain/cart';
import { Banner, Screen } from '@/ui/components';
import type { CartItem, Purchase } from '@/domain/types';
import { newId } from '@/lib/id';
import { isOnline } from '@/services/network';
import { supabaseRemote } from '@/services/remoteAdapter';
import { getSupabase } from '@/services/supabase';

interface AppValue {
  repo: Repository;
  /** Incrementa a cada alteração de dados; telas usam para recarregar. */
  version: number;
  bump: () => void;
  active: Purchase | null;
  cart: CartItem[];
  totals: CartTotals;
  refreshActive: () => Promise<void>;
  ensureActivePurchase: () => Promise<Purchase>;
  session: Session | null;
  isAnonymous: boolean;
  syncNow: () => Promise<SyncResult | null>;
  lastSync: SyncResult | null;
  pending: number;
}

const Ctx = createContext<AppValue | null>(null);

/** Temporizador da sincronização adiada (há um único AppProvider no app). */
let syncTimer: ReturnType<typeof setTimeout> | null = null;

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fora do AppProvider');
  return v;
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [sync, setSync] = useState<SyncService | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [active, setActive] = useState<Purchase | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const driver = await ExpoSqliteDriver.open();
        await migrate(driver);
        const r = new Repository(driver, newId);
        setRepo(r);
        const sb = getSupabase();
        if (sb) {
          setSync(
            new SyncService(driver, supabaseRemote(sb), {
              isOnline,
              // Sessões anônimas servem apenas para o OCR; só sincronizamos com conta criada.
              isAuthenticated: async () => {
                const { data } = await sb.auth.getSession();
                return !!data.session && !data.session.user.is_anonymous;
              },
            }),
          );
          const { data } = await sb.auth.getSession();
          setSession(data.session);
          sb.auth.onAuthStateChange((_e, s) => setSession(s));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const refreshActive = useCallback(async () => {
    if (!repo) return;
    const p = await repo.getActivePurchase();
    setActive(p);
    setCart(p ? await repo.listCartItems(p.id) : []);
    setPending(await repo.pendingSyncCount());
  }, [repo]);

  useEffect(() => {
    // refreshActive só altera o estado após leituras assíncronas do banco.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshActive();
  }, [refreshActive, version]);

  const syncNow = useCallback(async () => {
    if (!sync) return null;
    const r = await sync.sync();
    setLastSync(r);
    if (r.pulled > 0) setVersion((v) => v + 1);
    if (repo) setPending(await repo.pendingSyncCount());
    return r;
  }, [sync, repo]);

  // Sincroniza (com atraso) após alterações, quando a conexão volta e quando o app volta ao primeiro plano.
  const bump = useCallback(() => {
    setVersion((v) => v + 1);
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncNow(), 4000);
  }, [syncNow]);

  useEffect(() => {
    if (!sync) return;
    // syncNow só altera o estado após a sincronização (assíncrona).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void syncNow();
    const unsubNet = NetInfo.addEventListener((s) => {
      if (s.isConnected) void syncNow();
    });
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void syncNow();
    });
    return () => {
      unsubNet();
      sub.remove();
    };
  }, [sync, syncNow, session?.user.id]);

  const ensureActivePurchase = useCallback(async () => {
    if (!repo) throw new Error('Banco local indisponível');
    const existing = await repo.getActivePurchase();
    if (existing) return existing;
    const p = await repo.startPurchase('cart');
    bump();
    return p;
  }, [repo, bump]);

  const value = useMemo<AppValue | null>(
    () =>
      repo
        ? {
            repo,
            version,
            bump,
            active,
            cart,
            totals: cartTotals(cart),
            refreshActive,
            ensureActivePurchase,
            session,
            isAnonymous: !!session?.user.is_anonymous,
            syncNow,
            lastSync,
            pending,
          }
        : null,
    [repo, version, bump, active, cart, refreshActive, ensureActivePurchase, session, syncNow, lastSync, pending],
  );

  if (error) return <>{fallbackError(error)}</>;
  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function fallbackError(message: string) {
  return (
    <Screen>
      <Banner t="red" icon="warning" title="Não foi possível abrir o banco de dados local">
        {message}
      </Banner>
    </Screen>
  );
}
