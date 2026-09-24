// Fingerprint and Face ID, beside the PIN. Only a real device build can read a
// fingerprint, so every call degrades to "use your PIN" instead of failing.
import { Platform } from "react-native";

export type BioState = { available: boolean; enrolled: boolean; label: string };

export async function bioState(): Promise<BioState> {
  if (Platform.OS === "web") return { available: false, enrolled: false, label: "Fingerprint" };
  try {
    const LA = await import("expo-local-authentication");
    const [hardware, enrolled, types] = await Promise.all([
      LA.hasHardwareAsync(),
      LA.isEnrolledAsync(),
      LA.supportedAuthenticationTypesAsync(),
    ]);
    const label = types.includes(LA.AuthenticationType.FACIAL_RECOGNITION) ? "Face ID"
      : types.includes(LA.AuthenticationType.FINGERPRINT) ? "Fingerprint"
      : "Device unlock";
    return { available: hardware, enrolled, label };
  } catch {
    return { available: false, enrolled: false, label: "Fingerprint" };
  }
}

/** `ok` means the phone itself confirmed the person. `message` is empty when the
 *  user simply cancelled — there is nothing to tell them in that case. */
export async function bioUnlock(prompt = "Unlock your books"): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS === "web") return { ok: false, message: "Fingerprint unlock needs the phone build — use your PIN here" };
  try {
    const LA = await import("expo-local-authentication");
    if (!(await LA.hasHardwareAsync())) return { ok: false, message: "This phone has no fingerprint or face sensor" };
    if (!(await LA.isEnrolledAsync())) return { ok: false, message: "Add a fingerprint or Face ID in your phone settings first" };
    const res = await LA.authenticateAsync({ promptMessage: prompt, cancelLabel: "Use PIN instead", disableDeviceFallback: false });
    if (res.success) return { ok: true, message: "" };
    const cancelled = "error" in res && (res.error === "user_cancel" || res.error === "system_cancel" || res.error === "app_cancel");
    return { ok: false, message: cancelled ? "" : "Could not read it — enter your PIN" };
  } catch {
    return { ok: false, message: "Could not start the sensor — enter your PIN" };
  }
}
