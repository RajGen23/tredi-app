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

/** Print straight to the printer. */
export async function printHtml(html: string) {
  await Print.printAsync({ html });
}

/** Save with a readable filename and open the share sheet. */
export async function sharePdf(html: string, filename: string): Promise<{ shared: boolean; uri: string }> {
  const { uri } = await Print.printToFileAsync({ html });
  let out = uri;
  if (Platform.OS !== "web") {
    try {
      const { File, Paths } = await import("expo-file-system");
      const dest = new File(Paths.cache, filename);
      if (dest.exists) dest.delete();
      const src = new File(uri);
      src.move(dest);
      out = dest.uri;
    } catch {
      out = uri; // a rename failing must never stop the share
    }
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(out, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: filename });
    return { shared: true, uri: out };
  }
  return { shared: false, uri: out };
}
