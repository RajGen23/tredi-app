import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ApiError, api, loginRequest, registerRequest, TOKEN_KEY } from "@/src/api";
import { setCurrency } from "@/src/format";
import { clearCache, restoreCache, startCacheSaver } from "@/src/offline-cache";
import { storage } from "@/src/utils/storage";

const ME_KEY = "tradabooks_me";

export type User = { id: string; name: string; email: string; business_id: string | null; role?: string; can_see_money?: boolean; can_edit_payments?: boolean;
  perms?: Partial<Record<"see_suppliers" | "see_customer_totals" | "see_stock_value" | "see_expenses" | "see_accounts" | "edit_stock" | "see_profit" | "adjust_stock", boolean>> };
export type Business = { id: string; name: string; type: string; currency: string; tin: string; address: string; phone: string; track_stock: boolean; shops: { name: string; address: string }[] };

type Ctx = {
  ready: boolean;
  user: User | null;
  business: Business | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, code?: string) => Promise<void>;
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
      const b = u.business_id ? await api<Business | null>("/business") : null;
      const prev = await storage.getItem<string | null>(ME_KEY, null);
      if (prev && JSON.parse(prev).u?.id !== u.id) {   // someone else's saved screens must never show
        await clearCache();
        qc.clear();
      }
      setUser(u);
      setCurrency(b?.currency);
      setBusiness(b);
      storage.setItem(ME_KEY, JSON.stringify({ u, b }));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        // really signed out: forget the person and everything saved for them
        await storage.secureRemove(TOKEN_KEY);
        await storage.removeItem(ME_KEY);
        await clearCache();
        qc.clear();
        setUser(null);
        setBusiness(null);
        return;
      }
      // No signal or a server hiccup is not a sign-out: keep the saved profile.
      const saved = await storage.getItem<string | null>(ME_KEY, null);
      if (saved) {
        const { u, b } = JSON.parse(saved);
        setUser(u);
        setCurrency(b?.currency);
        setBusiness(b);
        return;
      }
      setUser(null);
      setBusiness(null);
    }
  }, [qc]);

  useEffect(() => {
    (async () => {
      startCacheSaver();
      const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
      const saved = token ? await storage.getItem<string | null>(ME_KEY, null) : null;
      if (saved) {
        // open straight away on the saved profile and screens; check with the server behind
        await restoreCache();
        const { u, b } = JSON.parse(saved);
        setUser(u);
        setCurrency(b?.currency);
        setBusiness(b);
        setReady(true);
        load();
        return;
      }
      await clearCache();
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
    signUp: async (name, email, password, code) => finish(await registerRequest(name, email, password, code)),
    signOut: async () => {
      await storage.secureRemove(TOKEN_KEY);
      await storage.removeItem(ME_KEY);
      await clearCache();
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
