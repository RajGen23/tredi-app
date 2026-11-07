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
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: ctl.signal,
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(await authHeaders()), ...(rest.headers || {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    return await parse(res);
  } finally {
    clearTimeout(timer);
  }
}

export async function loginRequest(email: string, password: string) {
  const form = new URLSearchParams();
  form.set("username", email.trim());
  form.set("password", password);
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  return parse(res);
}

export async function registerRequest(name: string, email: string, password: string, code = "") {
  return api("/auth/register", { method: "POST", json: { name, email: email.trim(), password, code } });
}
