// Upload helper for Brand Junction object storage. The body shape and the way an
// image is displayed both differ between web and native.
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";
import { ApiError, isOfflineError, NO_CONNECTION, TOKEN_KEY } from "@/src/api";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

/** A phone photo is 4–9 MB straight off the camera, which is slow on shop data
 *  and slows every screen that shows it. Shrink it on the device first to a
 *  1080px JPEG — usually 150–300 KB, still sharp on an invoice. A second, harder
 *  pass runs if that is still over 350 KB. The server compresses anything that
 *  arrives bigger anyway. Falls back to the original if the manipulator cannot
 *  read the file. */
async function shrink(uri: string, name: string, type: string) {
  const jpgName = name.replace(/\.[^.]+$/, "") + ".jpg";
  try {
    const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");
    const render = async (width: number, compress: number) => {
      const ctx = ImageManipulator.manipulate(uri);
      const probe = await ctx.renderAsync();
      const ref = probe.width > width ? await ctx.resize({ width }).renderAsync() : probe;
      return ref.saveAsync({ compress, format: SaveFormat.JPEG });
    };
    let out = await render(1080, 0.55);
    if ((await sizeOf(out.uri)) > 350_000) out = await render(800, 0.5);
    return { uri: out.uri, name: jpgName, type: "image/jpeg" };
  } catch {
    return { uri, name, type };
  }
}

async function sizeOf(uri: string): Promise<number> {
  if (Platform.OS === "web") return 0;
  try {
    const { File } = await import("expo-file-system");
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

type Reply = { status: number; text: string };

/** Phone: hand the file to the native upload task. OkHttp / NSURLSession stream
 *  it with a known Content-Length straight from disk — no base64 inflation, no
 *  multi-megabyte string over the JS bridge, and far fewer "Network request
 *  failed" drops than JS fetch on a shaky mobile connection. */
async function nativeBinary(small: { uri: string; name: string; type: string }, token: string | null, signal: AbortSignal): Promise<Reply> {
  const { File, UploadType } = await import("expo-file-system");
  const res = await new File(small.uri).upload(`${BASE}/upload-binary`, {
    httpMethod: "POST",
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: small.type,
    signal,
    headers: { "Content-Type": small.type, "X-Filename": small.name, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return { status: res.status, text: res.body };
}

/** Phone without the native task (older runtime): read the bytes ourselves and
 *  post them as base64 — a body with a known length that arrives in one piece. */
async function nativeBase64(small: { uri: string; name: string; type: string }, token: string | null, signal: AbortSignal): Promise<Reply> {
  const { File } = await import("expo-file-system");
  const data = await new File(small.uri).base64();
  if (!data) throw new Error("Could not read the photo file");
  const res = await fetch(`${BASE}/upload-base64`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ filename: small.name, content_type: small.type, data }),
  });
  return { status: res.status, text: await res.text() };
}

async function webMultipart(small: { uri: string; name: string }, token: string | null, signal: AbortSignal): Promise<Reply> {
  const blob = await (await fetch(small.uri)).blob();
  const form = new FormData();
  form.append("file", blob, small.name);
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: form, signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, text: await res.text() };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export async function uploadPhoto(uri: string, name = `photo-${Date.now()}.jpg`, type = "image/jpeg"): Promise<{ path: string; url: string }> {
  const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  const small = await shrink(uri, name, type);
  const bytes = await sizeOf(small.uri);

  let send: (s: typeof small, t: string | null, sig: AbortSignal) => Promise<Reply>;
  if (Platform.OS === "web") send = webMultipart;
  else {
    const fs = await import("expo-file-system").catch(() => null as any);
    send = fs && typeof fs.File?.prototype?.upload === "function" ? nativeBinary : nativeBase64;
  }

  // Three attempts, spaced out: a radio blip on shop data lasts a few seconds,
  // so an instant retry just fails the same way. Nobody should have to pick
  // the same photo twice.
  const waits = [0, 2_000, 4_000];
  let reply: Reply | null = null;
  let lastErr = "";
  let slow = false;
  let offline = false;
  for (let attempt = 0; attempt < waits.length && !reply; attempt++) {
    if (waits[attempt]) await sleep(waits[attempt]);
    const ctrl = new AbortController();
    const timer = setTimeout(() => { slow = true; ctrl.abort(); }, 90_000);
    try {
      reply = await send(small, token, ctrl.signal);
    } catch (e: any) {
      lastErr = String(e?.message ?? e ?? "").replace(/^\[?\w*Error:?\]?\s*/, "").slice(0, 80);
      offline = isOfflineError(e);
      if (slow) break;
      // If the device's native uploader itself refused (older runtime shipping
      // an Expo Go without it), don't burn the other tries on the same road.
      if (send === nativeBinary) send = nativeBase64;
    } finally {
      clearTimeout(timer);
    }
  }
  if (!reply && offline) {
    throw new ApiError(NO_CONNECTION, "You're offline, so the photo wasn't uploaded. Tap the photo box to try again when you have signal.");
  }
  if (!reply) {
    const why = `${lastErr || "network dropped"}${bytes ? `, ${kb(bytes)}` : ""}`;
    throw new ApiError(0, slow
      ? `That photo took too long to send (${why}) — try again where the signal is better`
      : `Photo didn't go through after 3 tries (${why}) — tap the photo box to try again`);
  }

  let body: any = {};
  try { body = JSON.parse(reply.text); } catch { /* an ingress error page, not our JSON */ }
  if (reply.status < 200 || reply.status >= 300) {
    throw new ApiError(reply.status, typeof body.detail === "string" ? body.detail
      : reply.status === 413 ? "That photo is too large — try a smaller one"
      : reply.status === 401 ? "Please sign in again to upload"
      : `Upload failed (${reply.status})`);
  }
  return body;
}

/** Source for <Image>. The token rides in the query on every platform: several
 *  screens keep only `src.uri`, which silently dropped the Authorization header
 *  on the phone and the freshly uploaded photo came back 401 — the upload had
 *  worked, but the box showed nothing, which read as "upload failed".
 *  `width` asks the server for a small copy (lists and grids). */
export async function photoSource(url: string, width?: number) {
  return { uri: await photoUrl(url, width) };
}

// The last token read, so a list can build photo URLs without waiting a tick
// per photo. Refreshed on every async read; a sign-in or sign-out replaces it.
let knownToken: string | null | undefined;

/** Photo URL right away when the token is already known, else "" (the async
 *  photoUrl then fills it in). */
export function photoUrlNow(url: string, width?: number): string {
  if (!url || knownToken === undefined) return "";
  return build(url, knownToken, width);
}

function build(url: string, token: string | null, width?: number) {
  // only our own files need the token — outside placeholder photos go through our proxy
  // (Wikimedia refuses phones/PDF engines without a proper User-Agent, so they printed blank)
  if (url.startsWith("http") && !url.startsWith(`${process.env.EXPO_PUBLIC_BACKEND_URL}`)) {
    return /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url)
      ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/photo-proxy?url=${encodeURIComponent(url)}` : url;
  }
  const absolute = url.startsWith("http") ? url : `${process.env.EXPO_PUBLIC_BACKEND_URL}${url}`;
  return `${absolute}${absolute.includes("?") ? "&" : "?"}token=${token ?? ""}${width ? `&w=${width}` : ""}`;
}

/** Printable URL: generated HTML cannot send a header, so the token rides along. */
export async function photoUrl(url: string, width?: number) {
  if (!url) return "";
  if (url.startsWith("http") && !url.startsWith(`${process.env.EXPO_PUBLIC_BACKEND_URL}`)) return build(url, null);
  knownToken = await storage.secureGet<string | null>(TOKEN_KEY, null);
  return build(url, knownToken, width);
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
export async function pickAndUploadPhoto(opts?: { camera?: boolean; crop?: boolean }): Promise<string> {
  const ImagePicker = await import("expo-image-picker");
  const { Alert, Linking, Platform } = await import("react-native");
  const camera = !!opts?.camera;
  // Android's system photo picker needs no permission (and media permissions are
  // blocked in app.json), so only the camera — or iOS photos — is ever asked for.
  const skipAsk = !camera && Platform.OS === "android";
  const current = skipAsk ? { granted: true, canAskAgain: true } : camera ? await ImagePicker.getCameraPermissionsAsync() : await ImagePicker.getMediaLibraryPermissionsAsync();
  let granted = current.granted;
  if (!granted) {
    if (!current.canAskAgain) {
      Alert.alert(camera ? "Camera is blocked" : "Photos are blocked",
        camera ? "TradaBooks uses the camera to photograph stock and receipts." : "TradaBooks needs your photos to show items on invoices.",
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
  let uri = a.uri;
  if (opts?.crop) {
    const { cropImage } = await import("@/src/components/cropper");
    const cropped = await cropImage(a.uri, a.width, a.height);
    if (!cropped) return "";
    uri = cropped;
  }
  const up = await uploadPhoto(uri, a.fileName ?? "photo.jpg", uri === a.uri ? a.mimeType ?? "image/jpeg" : "image/jpeg");
  return up.url;
}
