// Shared reads every screen needs: which shops are in view, and the editable
// lists behind the dropdowns.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
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

export type LookupKind = "item_category" | "unit" | "expense_category" | "location";

/** A dropdown list the trader can extend. `add` saves it for next time. */
export function useLookup(kind: LookupKind) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lookup", kind], queryFn: () => api<{ values: string[] }>(`/lookups/${kind}`) });
  const add = useMutation({
    mutationFn: (value: string) => api(`/lookups/${kind}`, { method: "POST", json: { value } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lookup", kind] }),
  });
  const values = q.data?.values ?? [];
  return { values, options: values.map<Option>((v) => ({ key: v, label: v })), add: (v: string) => add.mutate(v), loading: q.isLoading };
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
