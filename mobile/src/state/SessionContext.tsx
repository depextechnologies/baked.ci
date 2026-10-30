import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, apiSession } from '@/lib/api';
import { secureToken } from '@/lib/storage';

export type Customer = { id: string; name?: string | null; phone?: string | null; email?: string | null; country?: string };

type SessionState = {
  ready: boolean;
  customer: Customer | null;
  isAuthed: boolean;
  signIn: (token: string, customer: Customer) => Promise<void>;
  signOut: () => Promise<void>;
  sessionExpired: boolean;
};

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const signOut = useCallback(async () => {
    apiSession.setToken(null);
    setCustomer(null);
    await secureToken.clear();
  }, []);

  useEffect(() => {
    apiSession.onUnauthorized(() => { setSessionExpired(true); signOut(); });
    (async () => {
      const token = await secureToken.get();
      if (token) {
        apiSession.setToken(token);
        try { setCustomer(await api<Customer>('/auth/me')); } catch { /* 401 handled by onUnauthorized; offline keeps token */ }
      }
      setReady(true);
    })();
  }, [signOut]);

  const signIn = useCallback(async (token: string, c: Customer) => {
    apiSession.setToken(token);
    await secureToken.set(token);
    setSessionExpired(false);
    setCustomer(c);
  }, []);

  const value = useMemo(() => ({
    ready, customer, isAuthed: !!customer, signIn, signOut, sessionExpired,
  }), [ready, customer, signIn, signOut, sessionExpired]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
};
