// 04.7 PDF viewer — paper on a dark board, Download / Share pinned.
import { useEffect, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { api } from "@/src/api";
import { AppBar, Btn, Divider, H4, IconBtn, Lbl, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
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
  const inv = q.data;
  const brand = { ...DEFAULT_BRAND, ...(settings.data ?? {}), logo_url: logo };

  useEffect(() => {
    const url = settings.data?.logo_url;
    if (!url) return setLogo("");
    photoUrl(url).then(setLogo);
  }, [settings.data?.logo_url]);
  const hasDisc = inv?.lines.some((l: any) => l.discount > 0);

  const share = async (print?: boolean) => {
    if (!inv) return;
    try {
      const html = buildInvoiceHtml(inv, brand);
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
              <Row style={{ paddingVertical: 4 }}><Text style={[s.th, { flex: 2 }]}>ITEM</Text><Text style={[s.th, { flex: 0.6, textAlign: "right" }]}>QTY</Text><Text style={[s.th, { flex: 1, textAlign: "right" }]}>RATE</Text>{hasDisc ? <Text style={[s.th, { flex: 1, textAlign: "right" }]}>DISC</Text> : null}<Text style={[s.th, { flex: 1.1, textAlign: "right" }]}>AMOUNT</Text></Row>
              {inv.lines.map((l: any, i: number) => (
                <Row key={i} style={{ paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={[s.td, { flex: 2 }]}>{l.name}</Text><Money size={10.5} style={{ flex: 0.6, textAlign: "right" }}>{l.quantity}</Money><Money size={10.5} style={{ flex: 1, textAlign: "right" }}>{money(l.unit_price, { symbol: false })}</Money>{hasDisc ? <Money size={10.5} style={{ flex: 1, textAlign: "right" }}>{l.discount ? money(l.discount, { symbol: false }) : "—"}</Money> : null}<Money size={10.5} style={{ flex: 1.1, textAlign: "right" }}>{money(l.total, { symbol: false })}</Money>
                </Row>
              ))}
            </View>
            <Divider />
            <Row between><Sub>Gross</Sub><Money size={10.5}>{money(inv.totals.gross, { symbol: false })}</Money></Row>
            {inv.totals.line_discount ? <Row between style={{ marginTop: 3 }}><Sub>Line discounts</Sub><Money size={10.5} tone="pos">({money(inv.totals.line_discount, { symbol: false })})</Money></Row> : null}
            {inv.totals.invoice_discount ? <Row between style={{ marginTop: 3 }}><Sub>Less discount</Sub><Money size={10.5} tone="pos">({money(inv.totals.invoice_discount, { symbol: false })})</Money></Row> : null}
            {inv.totals.vat ? <Row between style={{ marginTop: 3 }}><Sub>VAT {inv.vat_rate}%</Sub><Money size={10.5}>{money(inv.totals.vat, { symbol: false })}</Money></Row> : null}
            <Row between style={{ marginTop: 3 }}><Sub>Paid to date</Sub><Money size={10.5}>{money(inv.paid, { symbol: false })}</Money></Row>
            <Row between style={[s.mint, { backgroundColor: brand.brand_color }]}>
              <H4 style={{ color: "#FFFFFF" }}>Balance due</H4>
              <Money size={13} style={{ color: "#FFFFFF" }}>{money(inv.due)}</Money>
            </Row>
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
