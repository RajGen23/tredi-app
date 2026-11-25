// Sales and invoices made with no signal. They are kept on this phone and sent
// to the server, in the order they were made, as soon as it can be reached.
//
// Each one carries a reference made on the phone (client_ref). If a send gets
// through but its reply is lost, the next try sends the same reference and the
// server answers with the record it already has, so nothing is counted twice.
// Invoice numbers, stock and customer balances change only when it arrives:
// the server does all of that exactly as it would have online.
import { useSyncExternalStore } from "react";

import { api, ApiError, isOfflineError } from "@/src/api";
import { storage } from "@/src/utils/storage";

export type OutboxKind = "invoice" | "sale";
export type Pending = {
  ref: string;
  kind: OutboxKind;
  owner: string;            // the signed-in user who made it; only they send it
  body: any;                // exactly what the screen would have sent online
  made_at: string;          // ISO time it was made
  label: string;            // "Mr. Tochukwu · Draft", "Quick sale · cash"
  total: number;
  tries: number;
  error?: string;           // the server refused it (not a signal problem)
};

const KEY = "tradabooks_outbox_v1";
const PATHS: Record<OutboxKind, string> = { invoice: "/invoices", sale: "/sales" };

let items: Pending[] = [];
let loaded = false;
let owner = "";
let sending: Promise<SendResult> | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }
async function persist() { await storage.setItem(KEY, JSON.stringify(items)); }

async function load() {
  if (loaded) return;
  try { items = JSON.parse((await storage.getItem<string | null>(KEY, null)) || "[]"); } catch { items = []; }
  loaded = true;
  emit();
}

/** Which user is signed in: only their own offline work is sent. */
export async function setOutboxOwner(id: string | null) {
  owner = id ?? "";
  await load();
  emit();
}

export function newRef() {
  const r = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${r()}-${r()}`;
}

/** Keep something made offline. Pass the ref (and time) the first send already
 *  used, so if that send did get through the server recognises the retry. */
export async function keepOffline(kind: OutboxKind, body: any, meta: { label: string; total: number },
                                  ref?: string, madeAt?: string): Promise<Pending> {
  await load();
  const p: Pending = { ref: ref || newRef(), kind, owner, body, made_at: madeAt || new Date().toISOString(), label: meta.label, total: meta.total, tries: 0 };
  items = [...items.filter((x) => x.ref !== p.ref), p];
  await persist();
  emit();
  return p;
}

export async function discard(ref: string) {
  items = items.filter((p) => p.ref !== ref);
  await persist();
  emit();
}

export type SendResult = { sent: Pending[]; refused: Pending[]; offline: boolean };

/** Send everything this user has waiting, oldest first. Safe to call often:
 *  only one send runs at a time. */
export function sendWaiting(): Promise<SendResult> {
  if (sending) return sending;
  sending = (async () => {
    await load();
    const out: SendResult = { sent: [], refused: [], offline: false };
    for (const p of items.filter((x) => x.owner === owner && !x.error)) {
      try {
        const body = { ...p.body, client_ref: p.ref, ...(p.kind === "sale" ? { made_at: p.made_at } : {}) };
        await api(PATHS[p.kind], { method: "POST", json: body });
        items = items.filter((x) => x.ref !== p.ref);
        out.sent.push(p);
      } catch (e: any) {
        if (isOfflineError(e)) { out.offline = true; break; }               // still no signal: try later
        if (e instanceof ApiError && e.status === 401) { out.offline = true; break; }  // signed out: wait
        if (e instanceof ApiError && e.status >= 500) { p.tries += 1; break; }       // server trouble: try later
        p.error = e?.message || "The server refused this";                  // a real problem: show it
        p.tries += 1;
        out.refused.push(p);
      }
      await persist();
      emit();
    }
    return out;
  })().finally(() => { sending = null; });
  return sending;
}

/** Try a refused one again (after fixing what was wrong elsewhere). */
export async function retry(ref: string) {
  items = items.map((p) => (p.ref === ref ? { ...p, error: undefined } : p));
  await persist();
  emit();
  return sendWaiting();
}

function snapshot() { return items; }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** This user's waiting work, kept up to date. */
export function useOutbox() {
  const all = useSyncExternalStore(subscribe, snapshot, snapshot);
  return all.filter((p) => p.owner === owner);
}
