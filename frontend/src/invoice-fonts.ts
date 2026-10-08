// Poppins on every printed document. The PDF engine cannot load a font from the
// network reliably (it rasterises before the fetch lands, and traders print
// offline), so the TTFs ship in the bundle and are inlined as @font-face data
// URIs. Loaded once at start-up; buildInvoiceHtml reads the cached CSS.
import { Platform } from "react-native";
import { Asset } from "expo-asset";

const FACES: { weight: number; mod: number }[] = [
  { weight: 400, mod: require("../assets/fonts/Poppins-Regular.ttf") },
  { weight: 500, mod: require("../assets/fonts/Poppins-Medium.ttf") },
  { weight: 600, mod: require("../assets/fonts/Poppins-SemiBold.ttf") },
  { weight: 700, mod: require("../assets/fonts/Poppins-Bold.ttf") },
];

let css = "";
let loading: Promise<string> | null = null;

async function toBase64(asset: Asset): Promise<string> {
  await asset.downloadAsync();
  if (Platform.OS === "web") {
    const res = await fetch(asset.uri);
    const blob = await res.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result.split(",")[1] ?? "" : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  }
  const { File } = await import("expo-file-system");
  return new File(asset.localUri ?? asset.uri).base64();
}

/** Fetch and inline the faces. Safe to call more than once. */
export function preloadInvoiceFonts(): Promise<string> {
  if (css) return Promise.resolve(css);
  if (loading) return loading;
  loading = Promise.all(FACES.map(async (f) => {
    try {
      const b64 = await toBase64(Asset.fromModule(f.mod));
      return b64 ? `@font-face{font-family:"Poppins";font-weight:${f.weight};font-style:normal;src:url(data:font/ttf;base64,${b64}) format("truetype")}` : "";
    } catch {
      return "";
    }
  })).then((faces) => {
    css = faces.join("\n");
    return css;
  });
  return loading;
}

/** The @font-face block for a document, or "" if the fonts have not landed yet
 *  (the stylesheet then falls back to the system sans). */
export function invoiceFontCss(): string {
  return css;
}

/** Font stack every document uses. */
export const DOC_FONT = `"Poppins",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`;
