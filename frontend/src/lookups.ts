// Shared reads every screen needs: which shops are in view, and the editable
// lists behind the dropdowns.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import type { Option } from "@/src/components/picker";

export type ShopRow = { name: string; address?: string; phone?: string; sells?: boolean; is_main?: boolean; sales?: number };
export type ShopsData = { shops: ShopRow[]; total: number; active: string; count: number; locked: boolean; can_see_all: boolean };

export function useShops() {
  const q = useQuery({ queryKey: ["shops"], queryFn: () => api<ShopsData>("/shops") });
  const shops = q.data?.shops ?? [];
  const active = q.data?.active ?? "";
  return {
    ...q,
    shops,
    active,
    locked: q.data?.locked ?? false,
    /** The shop a new record belongs to: the one in view, else the only one they have. */
    writeShop: active || (shops.length === 1 ? shops[0].name : shops.find((s) => s.is_main)?.name ?? shops[0]?.name ?? ""),
    options: shops.map<Option>((s) => ({ key: s.name, label: s.name, sub: s.address })),
  };
}

export type LookupKind = "item_category" | "brand" | "unit" | "expense_category" | "location";

// Which saved records each list's names are written on, so a rename or removal
// can refresh the screens showing them.
const USED_BY: Record<LookupKind, string[]> = {
  item_category: ["items", "items-archived", "item"], brand: ["items", "items-archived", "item"], unit: ["items", "items-archived", "item"],
  location: ["items", "items-archived", "item"], expense_category: ["expenses", "expense"],
};

export type LookupManage = {
  /** Rename a name everywhere it is used; resolves to a message to show. */
  rename: (from: string, to: string) => Promise<string>;
  /** Remove a name; resolves to a message to show. */
  remove: (value: string) => Promise<string>;
  /** How many records use a name, to warn before removing it. */
  usage: (value: string) => Promise<{ count: number; noun: string }>;
};

/** A dropdown list the trader can extend. `add` saves it for next time.
 *  `manage` (owner and managers only) renames or removes names. */
export function useLookup(kind: LookupKind) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["lookup", kind], queryFn: () => api<{ values: string[] }>(`/lookups/${kind}`) });
  const add = useMutation({
    mutationFn: (value: string) => api(`/lookups/${kind}`, { method: "POST", json: { value } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lookup", kind] }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lookup", kind] });
    for (const key of USED_BY[kind]) qc.invalidateQueries({ queryKey: [key] });
  };
  const canManage = ["owner", "manager"].includes(user?.role ?? "owner");
  const manage: LookupManage | undefined = canManage ? {
    rename: async (from, to) => { const r = await api<{ message: string }>(`/lookups/${kind}`, { method: "PUT", json: { old: from, new: to } }); refresh(); return r.message; },
    remove: async (value) => { const r = await api<{ message: string }>(`/lookups/${kind}?value=${encodeURIComponent(value)}`, { method: "DELETE" }); refresh(); return r.message; },
    usage: (value) => api(`/lookups/${kind}/usage?value=${encodeURIComponent(value)}`),
  } : undefined;
  const values = q.data?.values ?? [];
  return { values, options: values.map<Option>((v) => ({ key: v, label: v })), add: (v: string) => add.mutate(v), manage, loading: q.isLoading };
}

export function useAccounts() {
  const q = useQuery({ queryKey: ["accounts"], queryFn: () => api("/accounts") });
  const accounts: any[] = q.data?.accounts ?? [];
  return {
    ...q,
    accounts,
    options: accounts.map<Option>((a: any) => ({ key: a.id, label: a.name, sub: a.detail || a.kind })),
  };
}
