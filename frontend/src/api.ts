import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "tredi_token";
const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Status of an ApiError raised because the phone couldn't reach the server. */
export const NO_CONNECTION = 0;
export const OFFLINE_MESSAGE = "You're offline, so this wasn't saved. Nothing you typed is lost: try again when you have signal.";
export const SLOW_MESSAGE = "The connection is too slow right now, so this wasn't saved. Try again in a moment.";

/** True when an error means the network, not the server, failed: no signal,
 *  airplane mode, DNS failure ("Unable to resolve host"), or a dropped line.
 *  The phone reports these in its own words (Java, iOS or browser), which must
 *  never reach the screen. */
export function isOfflineError(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === NO_CONNECTION;
  const m = String((e as any)?.message ?? e ?? "");
  return (e as any)?.name === "TypeError" && /fetch|network/i.test(m)
    || /Network request failed|Failed to fetch|fetch failed|UnknownHost|Unable to resolve host|No address associated|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|SocketTimeout|ConnectException|NSURLErrorDomain|internet connection appears to be offline|Load failed/i.test(m);
}

/** fetch, with network failures turned into a plain-words ApiError. */
async function send(url: string, init: RequestInit, aborted?: () => boolean): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e: any) {
    if (aborted?.() || e?.name === "AbortError") throw new ApiError(NO_CONNECTION, SLOW_MESSAGE);
    if (isOfflineError(e)) throw new ApiError(NO_CONNECTION, OFFLINE_MESSAGE);
    throw e;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parse(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? body.detail[0]?.msg ?? "Request failed" : `HTTP ${res.status}`;
    throw new ApiError(res.status, detail);
  }
  return body;
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  // a weak signal must fail in good time, so screens fall back to the saved copy
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, 15000);
  try {
    const res = await send(`${BASE}${path}`, {
      signal: ctl.signal,
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), "X-App-Platform": Platform.OS, ...(await authHeaders()), ...(rest.headers || {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    }, () => timedOut);
    return await parse(res);
  } finally {
    clearTimeout(timer);
  }
}

export async function loginRequest(email: string, password: string) {
  const form = new URLSearchParams();
  form.set("username", email.trim());
  form.set("password", password);
  const res = await send(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  return parse(res);
}

export async function registerRequest(name: string, email: string, password: string, code = "") {
  return api("/auth/register", { method: "POST", json: { name, email: email.trim(), password, code } });
}
