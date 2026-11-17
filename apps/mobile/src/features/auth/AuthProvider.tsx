import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { resetPending } from '@/features/offline/ops-store';
import { deviceStore } from '@/features/offline/storage';
import { clearAllOffline } from '@/features/offline/trip-cache';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  /** True until the stored session has been restored on launch. */
  initializing: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Tracks the Supabase session. The session is persisted on the device, so the
 * user stays signed in across restarts until they sign out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setInitializing(false);
      return;
    }
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setInitializing(false);
      });

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      setSession(next);
      if (event === 'SIGNED_OUT') {
        // Never show one user's cached data to the next: memory and the offline copy.
        queryClient.clear();
        resetPending();
        void clearAllOffline(deviceStore).catch(() => undefined);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ session, initializing }), [session, initializing]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
