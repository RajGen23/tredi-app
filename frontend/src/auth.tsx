import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api, loginRequest, registerRequest, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";

export type User = { id: string; name: string; email: string; business_id: string | null };
export type Business = { id: string; name: string; type: string; currency: string; tin: string; address: string; phone: string; track_stock: boolean; shops: { name: string; address: string }[] };

type Ctx = {
  ready: boolean;
  user: User | null;
  business: Business | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const qc = useQueryClient();

  const load = useCallback(async () => {
    try {
      const u = await api<User>("/auth/me");
      setUser(u);
      setBusiness(u.business_id ? await api<Business | null>("/business") : null);
    } catch {
      setUser(null);
      setBusiness(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
      if (token) await load();
      setReady(true);
    })();
  }, [load]);

  const finish = useCallback(async (body: { access_token: string }) => {
    await storage.secureSet(TOKEN_KEY, body.access_token);
    await load();
  }, [load]);

  const value = useMemo<Ctx>(() => ({
    ready,
    user,
    business,
    signIn: async (email, password) => finish(await loginRequest(email, password)),
    signUp: async (name, email, password) => finish(await registerRequest(name, email, password)),
    signOut: async () => {
      await storage.secureRemove(TOKEN_KEY);
      qc.clear();
      setUser(null);
      setBusiness(null);
    },
    refresh: load,
  }), [ready, user, business, finish, load, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
