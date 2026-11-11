import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import type { Me } from './types';

// Prisijungusio naudotojo būsena visai programai.

interface AuthState {
  /** undefined – dar tikrinama; null – neprisijungęs */
  me: Me | null | undefined;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.getMe());
    } catch (err) {
      // 401 – neprisijungęs; kitos klaidos – irgi rodome prisijungimo ekraną
      if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      setMe(null);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // Pilnas puslapio perkrovimas išvalo visą ankstesnio naudotojo būseną (UI-09, FR-03)
      window.location.assign('/');
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  return <AuthContext.Provider value={{ me, refreshMe, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth turi būti naudojamas AuthProvider viduje');
  return ctx;
}
