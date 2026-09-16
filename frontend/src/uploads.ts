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

/** Printable URL: generated HTML cannot send a header, so the token rides along. */export async function photoUrl(url: string) {
  if (!url) return "";
  const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  const absolute = url.startsWith("http") ? url : `${process.env.EXPO_PUBLIC_BACKEND_URL}${url}`;
  return `${absolute}${absolute.includes("?") ? "&" : "?"}token=${token ?? ""}`;
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
