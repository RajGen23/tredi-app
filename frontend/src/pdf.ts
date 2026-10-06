// One place that turns HTML into a PDF the trader can keep, print or send —
// and names the file the way their old app did: Business-Customer-Number.pdf.
import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const slug = (v?: string | null) =>
  String(v ?? "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

export function pdfName(parts: (string | null | undefined)[]): string {
  const name = parts.map(slug).filter(Boolean).join("-").slice(0, 120);
  return `${name || "document"}.pdf`;
}

/** Open the system print dialog, with a dependable fallback.
 *
 *  expo-print keeps a module flag while a print is in flight and, on Android,
 *  the native promise never settles when the dialog is swiped away — after that
 *  every print throws "Another print request is already in progress". When that
 *  happens we hand a real PDF to the system sheet instead, which still offers
 *  Print (and Save as PDF). */
export async function printHtml(html: string, filename = "tredi-print.pdf") {
  if (Platform.OS === "web") return Print.printAsync({ html });
  try {
    await Print.printAsync({ html });
  } catch {
    await sharePdf(html, filename);
  }
}

/** Save with a readable filename and open the share sheet.
 *
 *  The move into the app's own cache folder is not cosmetic: expo-print writes
 *  the PDF into the *host* cache directory, and in Expo Go the share module is
 *  only allowed to read files inside this experience's sandbox — sharing the
 *  print path straight away fails with "ExpoSharing.shareAsync has been
 *  rejected". Copying it here first is what makes Download work on a phone. */
export async function sharePdf(html: string, filename: string): Promise<{ shared: boolean; uri: string }> {
  // The browser has no file to hand around — its print dialog is the download.
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return { shared: true, uri: "" };
  }
  const { uri } = await Print.printToFileAsync({ html });
  let out = uri;
  const { File, Paths } = await import("expo-file-system");
  const dest = new File(Paths.cache, filename);
  try {
    if (dest.exists) dest.delete();
    new File(uri).copySync(dest); // sync: copy() returns a promise, and the
                                  // share fired before the file existed
    out = dest.uri;
  } catch {
    out = uri; // last resort: share where print left it
  }
  if (!(await Sharing.isAvailableAsync())) return { shared: false, uri: out };
  try {
    await Sharing.shareAsync(out, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: filename });
  } catch (e: any) {
    const why = String(e?.message ?? e);
    // "Another share request is being processed": the previous sheet is still
    // open (or was swiped away). Saying so beats echoing the native error.
    throw new Error(/progress|processed/i.test(why)
      ? "A share window is already open — close it and tap again"
      : `${filename} is ready, but the share window would not open (${why.slice(0, 70)})`);
  }
  return { shared: true, uri: out };
}
