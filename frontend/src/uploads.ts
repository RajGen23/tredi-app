// Upload helper for Emergent object storage. The body shape and the way an
// image is displayed both differ between web and native.
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";
import { ApiError, TOKEN_KEY } from "@/src/api";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

/** A phone photo is 4–9 MB straight off the camera, which is slow on shop data
 *  and can be refused outright. Shrink it on the device first — the screens all
 *  promise "compressed for slow data". Falls back to the original if the
 *  manipulator cannot read the file. */
async function shrink(uri: string, name: string, type: string) {
  try {
    const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");
    const ctx = ImageManipulator.manipulate(uri);
    let ref = await ctx.renderAsync();
    if (ref.width > 1400) ref = await ctx.resize({ width: 1400 }).renderAsync();
    const out = await ref.saveAsync({ compress: 0.65, format: SaveFormat.JPEG });
    return { uri: out.uri, name: name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg" };
  } catch {
    return { uri, name, type };
  }
}

type Payload = { path: string; init: RequestInit };

/** On the phone we read the bytes ourselves and post them as base64. React
 *  Native streams a multipart file with chunked encoding and no content length,
 *  which proxies on a mobile network can drop halfway — that is what surfaced
 *  as "No connection" after the photo had already been picked. A base64 body
 *  has a known length and arrives in one piece. Multipart stays as a fallback
 *  in case the file cannot be read. */
async function nativePayload(small: { uri: string; name: string; type: string }): Promise<Payload> {
  try {
    const { File } = await import("expo-file-system");
    const data = await new File(small.uri).base64();
    if (!data) throw new Error("empty");
    return { path: "/upload-base64", init: { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: small.name, content_type: small.type, data }) } };
  } catch {
    const form = new FormData();
    form.append("file", { uri: small.uri, name: small.name, type: small.type } as any);
    return { path: "/upload", init: { method: "POST", body: form } };
  }
}

async function webPayload(small: { uri: string; name: string }): Promise<Payload> {
  const blob = await (await fetch(small.uri)).blob();
  const form = new FormData();
  form.append("file", blob, small.name);
  return { path: "/upload", init: { method: "POST", body: form } };
}

export async function uploadPhoto(uri: string, name = `photo-${Date.now()}.jpg`, type = "image/jpeg"): Promise<{ path: string; url: string }> {
  const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  const small = await shrink(uri, name, type);
  const { path, init } = Platform.OS === "web" ? await webPayload(small) : await nativePayload(small);

  // One silent retry: a dropped first attempt on shop data is common, and
  // nobody should have to pick the same photo twice.
  let res: Response | null = null;
  let slow = false;
  for (let attempt = 0; attempt < 2 && !res; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => { slow = true; ctrl.abort(); }, 90_000);
    try {
      res = await fetch(`${BASE}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: { ...(init.headers as Record<string, string> | undefined), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch {
      if (slow) break;
    } finally {
      clearTimeout(timer);
    }
  }
  if (!res) {
    throw new ApiError(0, slow
      ? "That photo took too long to send — try again where the signal is better"
      : "No connection — tap the photo box to try again");
  }

  const text = await res.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch { /* an ingress error page, not our JSON */ }
  if (!res.ok) {
    throw new ApiError(res.status, typeof body.detail === "string" ? body.detail
      : res.status === 413 ? "That photo is too large — try a smaller one"
      : res.status === 401 ? "Please sign in again to upload"
      : `Upload failed (${res.status})`);
  }
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

/** Printable URL: generated HTML cannot send a header, so the token rides along. */export async function photoUrl(url: string) {
  if (!url) return "";
  const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  const absolute = url.startsWith("http") ? url : `${process.env.EXPO_PUBLIC_BACKEND_URL}${url}`;
  return `${absolute}${absolute.includes("?") ? "&" : "?"}token=${token ?? ""}`;
}

/** Data URI for printing: the PDF engine can rasterise the page before a
 *  remote, authenticated <img> finishes loading, silently dropping it. Embed
 *  the bytes so a logo or item photo never depends on a live network call. */
export async function photoDataUri(url: string): Promise<string> {
  if (!url) return "";
  try {
    const resolved = await photoUrl(url);
    if (Platform.OS === "web") {
      const res = await fetch(resolved);
      if (!res.ok) return "";
      const blob = await res.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => resolve("");
        reader.readAsDataURL(blob);
      });
    }
    const { File, Paths } = await import("expo-file-system");
    const dest = new File(Paths.cache, `print-${Date.now()}-${Math.random().toString(36).slice(2)}.img`);
    const file = await File.downloadFileAsync(resolved, dest, { idempotent: true });
    const base64 = await file.base64();
    const mime = file.type || "image/jpeg";
    try { file.delete(); } catch {}
    return `data:${mime};base64,${base64}`;
  } catch {
    return "";
  }
}

/** Ask for photos once, contextually, then upload. Returns "" if the user says no.
 *  Callers get a plain url they can store; display goes through photoSource(). */
export async function pickAndUploadPhoto(opts?: { camera?: boolean }): Promise<string> {
  const ImagePicker = await import("expo-image-picker");
  const { Alert, Linking } = await import("react-native");
  const camera = !!opts?.camera;
  const current = camera ? await ImagePicker.getCameraPermissionsAsync() : await ImagePicker.getMediaLibraryPermissionsAsync();
  let granted = current.granted;
  if (!granted) {
    if (!current.canAskAgain) {
      Alert.alert(camera ? "Camera is blocked" : "Photos are blocked",
        camera ? "Tredi uses the camera to photograph stock and receipts." : "Tredi needs your photos to show items on invoices.",
        [{ text: "Not now", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]);
      return "";
    }
    const asked = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    granted = asked.granted;
    if (!granted) {
      if (!asked.canAskAgain) {
        Alert.alert(camera ? "Camera is blocked" : "Photos are blocked", "You can allow it in Settings whenever you want.",
          [{ text: "Not now", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]);
      }
      return "";
    }
  }
  const res = camera
    ? await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ["images"] })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ["images"] });
  if (res.canceled || !res.assets?.length) return "";
  const a = res.assets[0];
  const up = await uploadPhoto(a.uri, a.fileName ?? "photo.jpg", a.mimeType ?? "image/jpeg");
  return up.url;
}
