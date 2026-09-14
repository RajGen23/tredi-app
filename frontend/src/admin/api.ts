// Super Admin API client. Its own token namespace so signing in to the panel
// never touches a shop owner's session on the same browser.
import { storage } from "@/src/utils/storage";

export const ADMIN_TOKEN_KEY = "tredi_admin_token";
const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/admin`;

export class AdminError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function adminApi<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const token = await storage.secureGet<string | null>(ADMIN_TOKEN_KEY, null);
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers || {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof body.detail === "string" ? body.detail : `HTTP ${res.status}`;
    throw new AdminError(res.status, detail);
  }
  return body;
}

export async function adminLogin(email: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AdminError(res.status, typeof body.detail === "string" ? body.detail : "Sign in failed");
  await storage.secureSet(ADMIN_TOKEN_KEY, body.access_token);
  return body;
}

export async function adminSignOut() {
  await storage.secureRemove(ADMIN_TOKEN_KEY);
}

export async function adminToken() {
  return storage.secureGet<string | null>(ADMIN_TOKEN_KEY, null);
}
