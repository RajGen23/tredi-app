// 04.7 PDF viewer — paper on a dark board, Download / Share pinned.
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { api } from "@/src/api";
import { AppBar, Btn, Divider, H4, IconBtn, Lbl, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { longDate, money } from "@/src/format";
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

export function buildInvoiceHtml(inv: any): string {
  const b = inv.business ?? {};
  const hasDisc = inv.lines.some((l: any) => l.discount > 0);
  const rows = inv.lines.map((l: any) => `<tr><td>${l.name}${l.note ? `<div style="color:#93A9A4;font-size:10px">${l.note}</div>` : ""}</td><td class="r">${l.quantity}</td><td class="r">${money(l.unit_price, { symbol: false })}</td>${hasDisc ? `<td class="r">${l.discount ? money(l.discount, { symbol: false }) : "—"}</td>` : ""}<td class="r">${money(l.total, { symbol: false })}</td></tr>`).join("");
  return `<html><head><meta charset="utf-8"><style>body{font-family:-apple-system,Helvetica,Arial;color:#06241F;padding:28px;font-size:12px}.r{text-align:right}table{width:100%;border-collapse:collapse;margin-top:14px}th{color:#93A9A4;font-size:10px;text-align:left;padding:6px 0}td{padding:7px 0;border-top:1px solid #E5EEEB;font-variant-numeric:tabular-nums}.row{display:flex;justify-content:space-between;margin-top:4px}.lbl{font-size:9px;letter-spacing:.09em;color:#93A9A4;text-transform:uppercase;font-weight:700}</style></head><body>
<div class="row"><div><div style="font-size:18px;font-weight:800;color:#014747">${b.name ?? ""}</div><div style="color:#93A9A4">${b.address ?? ""}</div><div style="color:#93A9A4">${b.tin ? `TIN ${b.tin}` : ""} ${b.phone ? `· ${b.phone}` : ""}</div></div><div style="text-align:right"><div class="lbl">Invoice</div><div style="font-weight:700">${inv.number}</div><div style="color:#93A9A4">${longDate(inv.created_at)}</div>${inv.due_date ? `<div style="color:#93A9A4">Due ${longDate(inv.due_date)}</div>` : ""}</div></div>
<hr style="border:0;border-top:1px solid #E5EEEB;margin:14px 0"/><div class="lbl">Bill to</div><div style="font-weight:700">${inv.customer_name}</div><div style="color:#93A9A4">${inv.customer_phone ?? ""}</div>
<table><tr><th>ITEM</th><th class="r">QTY</th><th class="r">RATE</th>${hasDisc ? '<th class="r">DISCOUNT</th>' : ""}<th class="r">AMOUNT</th></tr>${rows}</table>
<hr style="border:0;border-top:1px solid #E5EEEB;margin:12px 0"/>
<div class="row"><span>Gross</span><span>${money(inv.totals.gross, { symbol: false })}</span></div>
${inv.totals.line_discount ? `<div class="row"><span>Line discounts</span><span>(${money(inv.totals.line_discount, { symbol: false })})</span></div>` : ""}
${inv.totals.invoice_discount ? `<div class="row"><span>Less discount</span><span>(${money(inv.totals.invoice_discount, { symbol: false })})</span></div>` : ""}
${inv.totals.vat ? `<div class="row"><span>VAT ${inv.vat_rate}%</span><span>${money(inv.totals.vat, { symbol: false })}</span></div>` : ""}
<div class="row"><span>Paid to date</span><span>${money(inv.paid, { symbol: false })}</span></div>
<div class="row" style="background:#E9FBF4;padding:9px 10px;border-radius:6px;margin-top:8px;font-weight:700"><span>Balance due</span><span>${money(inv.due)}</span></div>
<p style="color:#93A9A4;font-size:10px;margin-top:18px">${inv.note || "Goods sold are not returnable after 7 days. Thank you for your business."}</p>
<div class="row" style="border-top:1px solid #E5EEEB;padding-top:8px;color:#93A9A4;font-size:10px"><span>Thank you for your business</span><span style="color:#014747;font-weight:700">■ Made with tredi</span></div></body></html>`;
}

export default function PdfViewer() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api(`/invoices/${id}`) });
  const inv = q.data;
  const hasDisc = inv?.lines.some((l: any) => l.discount > 0);

  const share = async (print?: boolean) => {
    if (!inv) return;
    try {
      const html = buildInvoiceHtml(inv);
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
              <View><Text style={s.biz}>{inv.business?.name}</Text><Tag>{inv.business?.address}</Tag>{inv.business?.tin ? <Tag>TIN {inv.business.tin}</Tag> : null}</View>
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
            <Row between style={s.mint}><H4>Balance due</H4><Money size={13}>{money(inv.due)}</Money></Row>
            <Tag style={{ marginTop: 9, lineHeight: 15 }}>{inv.note || "Goods sold are not returnable after 7 days. Thank you for your business."}</Tag>
            <Row between style={{ marginTop: 9, paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Tag>Thank you for your business</Tag>
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
