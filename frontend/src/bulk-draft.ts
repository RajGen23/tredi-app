// The list being built on "Add several items": each entry is filled on the
// normal New item screen (opened with ?collect=1) and saved together later.
import { useSyncExternalStore } from "react";

export type Draft = { key: string; [field: string]: any };

let rows: Draft[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let seq = 0;

export const bulkDraft = {
  get: () => rows,
  find: (key: string) => rows.find((r) => r.key === key),
  /** Adds a new row, or replaces the row with the same key (editing). */
  put: (row: Omit<Draft, "key"> & { key?: string }) => {
    const key = row.key || `d${Date.now()}-${seq++}`;
    rows = rows.some((r) => r.key === key) ? rows.map((r) => (r.key === key ? { ...row, key } : r)) : [...rows, { ...row, key }];
    emit();
  },
  remove: (key: string) => { rows = rows.filter((r) => r.key !== key); emit(); },
  clear: () => { rows = []; emit(); },
};

export function useBulkDraft() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, bulkDraft.get, bulkDraft.get);
}
