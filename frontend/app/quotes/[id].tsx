// Quotation preview — the document the customer sees, shareable as a PDF.
import { useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { api } from "@/src/api";
import { AppBar, Badge, Btn, Card, Divider, H4, IconBtn, Lbl, Loading, Money, Row, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { longDate, money } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { fonts, makeStyles } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  doc: { backgroundColor: c.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
  title: { fontFamily: fonts.extrabold, fontSize: 17, color: c.onSurface },
  head: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase", color: c.ink40 },
  cell: { fontFamily: fonts.mono, fontSize: 11, color: c.onSurface },
}));

function html(q: any) {
  const rows = q.lines.map((l: any) =>
    `<tr><td style="padding:6px 0">${l.name}</td><td style="text-align:right;font-family:monospace">${l.quantity}</td>
     <td style="text-align:right;font-family:monospace">${money(l.unit_price, { symbol: false })}</td>
     <td style="text-align:right;font-family:monospace">${money(l.total, { symbol: false })}</td></tr>`).join("");
  return `<html><body style="font-family:-apple-system,Helvetica,sans-serif;padding:28px;color:#06241F">
    <h2 style="margin:0">${q.business?.name ?? ""}</h2>
    <p style="margin:2px 0 4px;color:#5C7570">${q.business?.address ?? ""}</p>
    <p style="margin:0 0 18px;color:#5C7570">Quotation ${q.number} · ${longDate(q.created_at)} · valid to ${longDate(q.valid_until)}</p>
    <p style="margin:0 0 12px"><b>For</b> ${q.customer_name ?? ""}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="color:#93A9A4;font-size:10px;text-transform:uppercase"><td>Item</td><td style="text-align:right">Qty</td><td style="text-align:right">Rate</td><td style="text-align:right">Amount</td></tr>
      ${rows}
      <tr><td colspan="3" style="padding-top:10px">Gross total</td><td style="text-align:right;font-family:monospace;padding-top:10px">${money(q.totals.gross, { symbol: false })}</td></tr>
      ${q.totals.vat ? `<tr><td colspan="3">VAT ${q.vat_rate}%</td><td style="text-align:right;font-family:monospace">${money(q.totals.vat, { symbol: false })}</td></tr>` : ""}
      <tr><td colspan="3" style="font-weight:700">Quoted total</td><td style="text-align:right;font-family:monospace;font-weight:700">${money(q.totals.total)}</td></tr>
    </table>
    <p style="margin-top:26px;color:#93A9A4;font-size:11px">A quotation reserves nothing — made with tredi</p>
  </body></html>`;
}

export default function QuotePreview() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["quote", id], queryFn: () => api(`/quotes/${id}`) });
  const d = q.data;

  const convert = useMutation({
    mutationFn: () => api(`/quotes/${id}/convert`, { method: "POST" }),
    onSuccess: (inv: any) => { qc.invalidateQueries(); toast.show("Stock has moved now", inv.number); router.replace(`/invoices/${inv.id}`); },
    onError: (e: any) => toast.show(e.message),
  });

  const share = async () => {
    if (!d) return;
    setBusy(true);
    try {
      if (Platform.OS === "web") await Print.printAsync({ html: html(d) });
      else {
        const { uri } = await Print.printToFileAsync({ html: html(d) });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } finally { setBusy(false); }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="quote-preview-screen">
      <AppBar title={d?.number ?? "Quotation"} back mono right={<IconBtn name="share-outline" testID="quote-share" onPress={share} />} />
      {!d ? <Loading /> : (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad + 58 }}>
            <View style={s.doc} testID="quote-doc">
              <Row between>
                <View><Text style={s.title}>{d.business?.name}</Text><Sub>{d.business?.address}</Sub></View>
                <Badge tone={d.state === "accepted" ? "paid" : "info"}>{d.state}</Badge>
              </Row>
              <Divider />
              <Row between><Lbl>Quotation</Lbl><Sub style={{ fontFamily: fonts.mono }}>{d.number}</Sub></Row>
              <Row between><Lbl>Valid to</Lbl><Sub style={{ fontFamily: fonts.mono }}>{longDate(d.valid_until)}</Sub></Row>
              <Row between><Lbl>For</Lbl><Sub>{d.customer_name}</Sub></Row>
              <Divider />
              <Row between><Text style={s.head}>Item</Text><Text style={s.head}>Amount</Text></Row>
              {d.lines.map((l: any, i: number) => (
                <Row key={i} between style={{ marginTop: 8 }}>
                  <View style={{ flex: 1 }}><H4>{l.name}</H4><Sub style={{ fontFamily: fonts.mono }}>{l.quantity} × {money(l.unit_price, { symbol: false })}</Sub></View>
                  <Text style={s.cell}>{money(l.total, { symbol: false })}</Text>
                </Row>
              ))}
              <Divider />
              <Row between><Sub>Gross total</Sub><Money>{money(d.totals.gross)}</Money></Row>
              {d.totals.vat ? <Row between><Sub>VAT {d.vat_rate}%</Sub><Money>{money(d.totals.vat)}</Money></Row> : null}
              <Row between style={{ marginTop: 6 }}><H4>Quoted total</H4><Money size={15}>{money(d.totals.total)}</Money></Row>
            </View>
            <Sub style={{ marginTop: 10, textAlign: "center" }}>Viewed {d.views}× · nothing is deducted from stock</Sub>
          </ScrollView>
          <Row style={{ position: "absolute", left: 14, right: 14, bottom: pad, gap: 8 }}>
            <View style={{ flex: 1 }}><Btn label="Share PDF" variant="ghost" small loading={busy} testID="quote-share-pdf" onPress={share} /></View>
            <View style={{ flex: 1 }}><Btn label="Convert to invoice" small loading={convert.isPending} testID="quote-convert" onPress={() => convert.mutate()} /></View>
          </Row>
        </>
      )}
    </View>
  );
}
