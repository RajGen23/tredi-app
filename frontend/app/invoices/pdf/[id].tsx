// 04.7 PDF viewer — paper on a dark board, Download / Share pinned.
import { useEffect, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { api } from "@/src/api";
import { AppBar, Btn, Divider, H4, IconBtn, Lbl, Loading, Money, Row, Seg, Sub, Tag } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { longDate, money } from "@/src/format";
import { buildInvoiceHtml, DEFAULT_BRAND } from "@/src/invoice-templates";
import { photoUrl } from "@/src/uploads";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.pdfBoard },
  paper: { backgroundColor: c.surfaceSecondary, borderRadius: 6, padding: 14 },
  biz: { fontFamily: fonts.extrabold, fontSize: 14, color: c.deep },
  th: { fontFamily: fonts.bold, fontSize: 9.5, color: c.ink40 },
  td: { fontFamily: fonts.regular, fontSize: 11, color: c.onSurface },
  mint: { backgroundColor: c.brandTertiary, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 9, marginTop: 6 },
  mark: { width: 11, height: 11, borderRadius: 4, backgroundColor: c.brandPrimary },
  bar: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 10 },
}));

export default function PdfViewer() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api(`/invoices/${id}`) });
  const settings = useQuery({ queryKey: ["invoice-settings"], queryFn: () => api("/settings/invoice") });
  const [logo, setLogo] = useState("");
  const [linePhotos, setLinePhotos] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<"simple" | "professional">("professional");
  const inv = q.data;
  const chosen: any = settings.data ?? {};
  // The invoice's own photo switch wins over the global default.
  const brand = { ...DEFAULT_BRAND, ...chosen, logo_url: logo,
    show_photos: q.data?.show_photos ?? chosen.show_photos ?? false,
    template: format === "professional" ? "t7" : (chosen.template === "t7" ? "t3" : chosen.template ?? "t3") };

  useEffect(() => {
    if (chosen.export_format) setFormat(chosen.export_format);
  }, [chosen.export_format]);

  // Item photos need the token in the URL: the generated HTML cannot send headers.
  useEffect(() => {
    const urls: string[] = (q.data?.lines ?? []).map((l: any) => l.photo_url).filter(Boolean);
    if (!urls.length) return;
    Promise.all(urls.map(async (u) => [u, await photoUrl(u)] as const)).then((pairs) => setLinePhotos(Object.fromEntries(pairs)));
  }, [q.data]);

  const printable = inv ? { ...inv, lines: inv.lines.map((l: any) => ({ ...l, photo_url: linePhotos[l.photo_url] ?? "" })) } : null;

  useEffect(() => {
    const url = settings.data?.logo_url;
    if (!url) return setLogo("");
    photoUrl(url).then(setLogo);
  }, [settings.data?.logo_url]);
  const discCell = (l: any) => (!l.discount ? "0.00%" : l.discount_type === "percent" ? `${Number(l.discount_value).toFixed(2)}%` : money(l.discount, { symbol: false }));

  const share = async (print?: boolean) => {
    if (!inv) return;
    try {
      const html = buildInvoiceHtml(printable ?? inv, brand);
      if (print) return await Print.printAsync({ html });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: `${inv.number}.pdf` });
      else toast.show("PDF ready — sharing is not available in this preview");
    } catch (e: any) {
      toast.show(e.message ?? "Could not create PDF");
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
            <Tag style={{ marginTop: 5 }}>{format === "professional" ? "Full quotation layout — From/To, TIN, terms and bank details" : "One-page summary, in your chosen template"}</Tag>
          </View>
          <View style={s.paper} testID="pdf-paper">
            <Row between style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                {logo ? <Image source={{ uri: logo }} style={{ width: brand.logo_size * 1.6, height: brand.logo_size * 0.5, marginBottom: 6 }} resizeMode="contain" testID="pdf-logo" /> : null}
                <Text style={[s.biz, { color: brand.brand_color }]}>{inv.business?.name}</Text><Tag>{inv.business?.address}</Tag>{inv.business?.tin ? <Tag>TIN {inv.business.tin}</Tag> : null}</View>
              <View style={{ alignItems: "flex-end" }}><Lbl>Invoice</Lbl><Money size={12}>{inv.number}</Money><Tag>{longDate(inv.created_at)}</Tag></View>
            </Row>
            <Divider />
            <Lbl>Bill to</Lbl><H4>{inv.customer_name}</H4><Tag>{inv.customer_phone}</Tag>
            <View style={{ marginTop: 10 }}>
              <Row style={{ paddingVertical: 4 }}><Text style={[s.th, { flex: 2 }]}>ITEM</Text><Text style={[s.th, { flex: 0.6, textAlign: "right" }]}>QTY</Text><Text style={[s.th, { flex: 1, textAlign: "right" }]}>RATE</Text><Text style={[s.th, { flex: 1, textAlign: "right" }]}>DISCOUNT</Text><Text style={[s.th, { flex: 1.1, textAlign: "right" }]}>AMOUNT</Text></Row>
              {inv.lines.map((l: any, i: number) => (
                <Row key={i} style={{ paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.border }}>
                  {brand.show_photos && linePhotos[l.photo_url] ? <Image source={{ uri: linePhotos[l.photo_url] }} style={{ width: 22, height: 22, borderRadius: 4, marginRight: 6 }} /> : null}
                  <Text style={[s.td, { flex: 2 }]}>{l.name}</Text><Money size={10.5} style={{ flex: 0.6, textAlign: "right" }}>{l.quantity}</Money><Money size={10.5} style={{ flex: 1, textAlign: "right" }}>{money(l.unit_price, { symbol: false })}</Money><Money size={10.5} style={{ flex: 1, textAlign: "right" }}>{discCell(l)}</Money><Money size={10.5} style={{ flex: 1.1, textAlign: "right" }}>{money(l.total, { symbol: false })}</Money>
                </Row>
              ))}
            </View>
            <Divider />
            <Row between><Sub>Gross total</Sub><Money size={10.5}>{money(inv.totals.gross, { symbol: false })}</Money></Row>
            <Row between style={{ marginTop: 3 }}><Sub>Total discount</Sub><Money size={10.5} tone="pos">{money(inv.totals.discount_total ?? (inv.totals.line_discount + inv.totals.invoice_discount), { symbol: false })}</Money></Row>
            <Row between style={{ marginTop: 3 }}><Sub>Subtotal</Sub><Money size={10.5}>{money(inv.totals.taxable, { symbol: false })}</Money></Row>
            <Row between style={{ marginTop: 3 }}><Sub>VAT {inv.vat_rate}%</Sub><Money size={10.5}>{money(inv.totals.vat, { symbol: false })}</Money></Row>
            {inv.totals.shipping ? <Row between style={{ marginTop: 3 }}><Sub>Shipping fee</Sub><Money size={10.5}>{money(inv.totals.shipping, { symbol: false })}</Money></Row> : null}
            <Row between style={[s.mint, { backgroundColor: brand.brand_color }]}>
              <H4 style={{ color: "#FFFFFF" }}>Grand total</H4>
              <Money size={13} style={{ color: "#FFFFFF" }}>{money(inv.totals.total)}</Money>
            </Row>
            {inv.paid > 0 ? (
              <>
                <Row between style={{ marginTop: 6 }}><Sub>Amount received</Sub><Money size={10.5} tone="pos">{money(inv.paid, { symbol: false })}</Money></Row>
                <Row between style={{ marginTop: 3 }}><H4 style={{ fontSize: 12 }}>Balance due</H4><Money size={12} testID="pdf-balance">{money(inv.due, { symbol: false })}</Money></Row>
              </>
            ) : null}
            {inv.terms ? (
              <View style={{ marginTop: 12 }} testID="pdf-terms">
                <Lbl>Terms of payment · {inv.terms.name}</Lbl>
                {inv.terms.payment_structure ? <Tag style={{ marginTop: 3, lineHeight: 15 }}>{inv.terms.payment_structure}</Tag> : null}
                {inv.terms.delivery_condition ? <Tag style={{ marginTop: 3, lineHeight: 15 }}>{inv.terms.delivery_condition}</Tag> : null}
              </View>
            ) : null}
            {(inv.bank_accounts ?? []).length ? (
              <View style={{ marginTop: 12 }} testID="pdf-banks">
                <Lbl>Bank details</Lbl>
                {inv.bank_accounts.map((a: any) => (
                  <Tag key={a.id} style={{ marginTop: 3 }}>{a.holder || a.name}{a.bank ? ` · ${a.bank}` : ""}{a.number ? ` · ${a.number}` : ""}</Tag>
                ))}
              </View>
            ) : null}
            <Tag style={{ marginTop: 9, lineHeight: 15 }}>{inv.note || "Goods sold are not returnable after 7 days. Thank you for your business."}</Tag>
            <Row between style={{ marginTop: 9, paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Tag>{brand.footer || "Thank you for your business"}</Tag>
              <Row style={{ gap: 4 }}><View style={s.mark} /><Tag style={{ fontFamily: fonts.bold, color: colors.deep }}>Made with tredi</Tag></Row>
            </Row>
          </View>
        </ScrollView>
      )}
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Btn small variant="ghost" label="Download" style={{ flex: 1 }} testID="pdf-download" onPress={() => share()} />
        <Btn small label="Share" style={{ flex: 1 }} testID="pdf-share" onPress={() => share()} icon="logo-whatsapp" />
      </View>
    </View>
  );
}
