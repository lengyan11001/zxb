import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, type AuthUser } from '@/api/client';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (account: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api.me()
      .then((current) => !cancelled && setUser(current))
      .catch(() => {
        clearToken();
        if (!cancelled) setUser(null);
      })
      .finally(() => !cancelled && setLoading(false));

    const onUnauthorized = () => setUser(null);
    window.addEventListener('zxb:unauthorized', onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener('zxb:unauthorized', onUnauthorized);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async (account: string, password: string) => {
      const result = await api.login(account, password);
      setUser(result.user);
    },
    logout: () => {
      clearToken();
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
