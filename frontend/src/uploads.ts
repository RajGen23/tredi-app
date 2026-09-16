// Upload helper for Emergent object storage. The body shape and the way an
// image is displayed both differ between web and native.
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";
import { ApiError, TOKEN_KEY } from "@/src/api";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export async function uploadPhoto(uri: string, name = `photo-${Date.now()}.jpg`, type = "image/jpeg"): Promise<{ path: string; url: string }> {
  const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type } as any);
  }
  const res = await fetch(`${BASE}/upload`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, typeof body.detail === "string" ? body.detail : "Upload failed");
  return body;
}

/** Source for <Image>: native sends the header, web needs the token in the query. */
export async function photoSource(url: string) {
  const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  const absolute = url.startsWith("http") ? url : `${process.env.EXPO_PUBLIC_BACKEND_URL}${url}`;
  return Platform.OS === "web"
    ? { uri: `${absolute}${absolute.includes("?") ? "&" : "?"}token=${token ?? ""}` }
    : { uri: absolute, headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}

/** Printable URL: generated HTML cannot send a header, so the token rides along. */
export async function photoUrl(url: string) {
  if (!url) return "";
  const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  const absolute = url.startsWith("http") ? url : `${process.env.EXPO_PUBLIC_BACKEND_URL}${url}`;
  return `${absolute}${absolute.includes("?") ? "&" : "?"}token=${token ?? ""}`;
}
