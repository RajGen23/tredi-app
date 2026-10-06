// 04.7 PDF viewer — paper on a dark board, Download / Share pinned. The paper
// redraws itself per format, so Simple and Professional look as different here
// as they do on the printed page.
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Btn, Card, H4, IconBtn, Loading, Row, Seg, Sub, Tag } from "@/src/components/ui";
import { InvoicePaper } from "@/src/components/invoice-paper";
import { useToast } from "@/src/components/sheet";
import { buildInvoiceHtml, DEFAULT_BRAND, TEMPLATES } from "@/src/invoice-templates";
import { pdfName, printHtml, sharePdf } from "@/src/pdf";
import { photoDataUri } from "@/src/uploads";
import { useBottomPad } from "@/src/safe";
import { makeStyles } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.pdfBoard },
  note: { backgroundColor: c.surfaceSecondary, marginBottom: 10, paddingVertical: 9 },
  bar: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 10 },
}));

export default function PdfViewer() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api(`/invoices/${id}`) });
  const settings = useQuery({ queryKey: ["invoice-settings"], queryFn: () => api("/settings/invoice") });
  const [logo, setLogo] = useState("");
  const [linePhotos, setLinePhotos] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<"simple" | "professional">("professional");
  const inv = q.data;
  const chosen: any = settings.data ?? {};
  // The invoice's own photo switch wins over the global default. Professional
  // draws the look picked in Invoice templates; Simple is always the receipt.
  const brand = { ...DEFAULT_BRAND, ...chosen, logo_url: logo,
    show_photos: chosen.photos_allowed === false ? false : (q.data?.show_photos ?? chosen.show_photos ?? false),
    template: format === "professional" ? (chosen.template ?? DEFAULT_BRAND.template) : "receipt" };

  useEffect(() => {
    if (chosen.export_format) setFormat(chosen.export_format);
  }, [chosen.export_format]);

  // Item photos and the logo are embedded as data URIs, not network URLs — the
  // PDF engine can rasterise the page before an authenticated network image
  // finishes loading, silently printing without it.
  useEffect(() => {
    const urls: string[] = (q.data?.lines ?? []).map((l: any) => l.photo_url).filter(Boolean);
    if (!urls.length) return setLinePhotos({});
    Promise.all(urls.map(async (u) => [u, await photoDataUri(u)] as const)).then((pairs) => setLinePhotos(Object.fromEntries(pairs)));
  }, [q.data]);

  const printable = inv ? { ...inv, lines: inv.lines.map((l: any) => ({ ...l, photo_url: linePhotos[l.photo_url] ?? "" })) } : null;

  useEffect(() => {
    const url = settings.data?.logo_url;
    if (!url) return setLogo("");
    photoDataUri(url).then(setLogo);
  }, [settings.data?.logo_url]);

  const share = async (print?: boolean) => {
    if (!inv) return;
    try {
      const html = buildInvoiceHtml(printable ?? inv, brand);
      if (print) return await printHtml(html);
      const name = pdfName([inv.business?.name ?? chosen.business_name, inv.customer_name, inv.number]);
      const res = await sharePdf(html, name);
      if (!res.shared) toast.show(`${name} is ready — sharing is not available in this preview`);
    } catch (e: any) {
      toast.show(e.message ?? "Could not create PDF", undefined, "bad");
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="pdf-viewer-screen">
      <AppBar teal back title={`${inv?.number ?? "Invoice"}.pdf`} right={<IconBtn teal name="print-outline" testID="pdf-print" onPress={() => share(true)} />} />
      {!inv ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          <View style={{ marginBottom: 10 }}>
            <Seg testID="pdf-format" value={format} onChange={setFormat}
              options={[{ key: "simple", label: "Simple" }, { key: "professional", label: "Professional" }]} />
          </View>
          {/* Say plainly what changes between the two, so nobody has to guess. */}
          <Card style={s.note} testID="pdf-format-note">
            <Row between>
              <H4 style={{ fontSize: 12.5 }}>{format === "professional" ? `Professional — ${TEMPLATES.find((t) => t.key === chosen.template)?.name ?? "Template 3"}` : "Simple — counter receipt"}</H4>
              <Tag>{format === "professional" ? "A4 · full invoice" : "80mm · till slip"}</Tag>
            </Row>
            <Sub style={{ marginTop: 4, lineHeight: 16 }}>
              {format === "professional"
                ? `${TEMPLATES.find((t) => t.key === chosen.template)?.note ?? ""} · Your letterhead, item lines, totals, terms and bank details. Change the look under More › Invoice templates.`
                : "The slip you hand across the counter: narrow 80mm paper, your shop name centred, one line per item with quantity and price, the total, what was paid and a thank-you. No images, no bank block."}
            </Sub>
          </Card>
          <InvoicePaper inv={inv} format={format} brand={brand as any} linePhotos={linePhotos} logo={logo} />
        </ScrollView>
      )}
      <View style={[s.bar, { paddingBottom: pad }]}>
        <Btn small variant="ghost" label="Download" style={{ flex: 1 }} testID="pdf-download" onPress={() => share()} />
        <Btn small label="Share" style={{ flex: 1 }} testID="pdf-share" onPress={() => share()} icon="logo-whatsapp" />
      </View>
    </View>
  );
}
