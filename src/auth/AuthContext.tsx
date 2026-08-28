import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export type Role = 'customer' | 'tradie';

export type Session = {
  role: Role;
  token: string;
  email: string;
};

const STORAGE_KEY = 'kiwifix_session';

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean; // true only while restoring a persisted session on app launch
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore a previously signed-in session on cold start — SecureStore is
  // the RN equivalent of the web app's localStorage-held session token,
  // but encrypted at rest (Keychain on iOS, Keystore on Android).
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) setSession(JSON.parse(raw));
      } catch {
        // Corrupted/unreadable stored session — treat as signed out rather
        // than crash the app on launch.
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = async (next: Session) => {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    setSession(null);
  };

  const value = useMemo(() => ({ session, isLoading, signIn, signOut }), [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
