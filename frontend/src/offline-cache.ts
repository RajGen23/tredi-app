// Keeps the last data each screen loaded on the phone, so sales, customers and
// stock open instantly after sign-in and still show with no connection. The
// cache is refreshed in the background whenever the network is there.
// Each screen's data is its own storage entry: Android cannot read a single
// entry much over 2 MB, and one big blob would silently stop saving.
import { dehydrate, hydrate } from "@tanstack/react-query";

import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

const INDEX = "tradabooks_cache_index";
const PREFIX = "tradabooks_cache:";
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
const dirty = new Set<string>();

const keep = (key: readonly unknown[]) => !String(key[0]).startsWith("admin");

export async function restoreCache() {
  const index: string[] = JSON.parse((await storage.getItem<string | null>(INDEX, null)) || "[]");
  const queries = [];
  for (const h of index) {
    const raw = await storage.getItem<string | null>(PREFIX + h, null);
    if (raw) {
      try { queries.push(JSON.parse(raw)); } catch { /* skip a broken entry */ }
    }
  }
  if (queries.length) hydrate(queryClient, { mutations: [], queries });
}

/** Start saving every screen's data as it loads — from the very first sign-in. */
export function startCacheSaver() {
  if (started) return;
  started = true;
  queryClient.getQueryCache().subscribe((e) => {
    if (e.type !== "updated" || e.action.type !== "success" || !keep(e.query.queryKey)) return;
    dirty.add(e.query.queryHash);
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 1500);
  });
}

async function save() {
  const hashes = [...dirty];
  dirty.clear();
  const state = dehydrate(queryClient, { shouldDehydrateQuery: (q) => hashes.includes(q.queryHash) && q.state.status === "success" });
  for (const q of state.queries) await storage.setItem(PREFIX + q.queryHash, JSON.stringify(q));
  const index: string[] = JSON.parse((await storage.getItem<string | null>(INDEX, null)) || "[]");
  await storage.setItem(INDEX, JSON.stringify([...new Set([...index, ...state.queries.map((q) => q.queryHash)])]));
}

export async function clearCache() {
  if (timer) clearTimeout(timer);
  dirty.clear();
  const index: string[] = JSON.parse((await storage.getItem<string | null>(INDEX, null)) || "[]");
  for (const h of index) await storage.removeItem(PREFIX + h);
  await storage.removeItem(INDEX);
  await storage.removeItem("tradabooks_cache_v1");
}
