// 07.3 Profit & loss — read on the phone, print for the accountant.
import { useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { api } from "@/src/api";
import { AppBar, Btn, Card, H4, IconBtn, Lbl, Loading, Money, Row, Sub } from "@/src/components/ui";
import { SingleBars } from "@/src/components/charts";
import { PeriodSheet, usePeriod } from "@/src/period";
import { useToast } from "@/src/components/sheet";
import { useAuth } from "@/src/auth";
import { money } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  indent: { paddingLeft: 8 },
  mintRow: { backgroundColor: c.brandTertiary, marginHorizontal: -12, paddingHorizontal: 12, paddingVertical: 9 },
  deepRow: { backgroundColor: c.deep, marginHorizontal: -12, paddingHorizontal: 12, paddingVertical: 11, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  white: { color: "#FFFFFF" },
}));

function pnlHtml(d: any, bizName: string) {
  const line = (l: string, v: string, bold = false) =>
    `<tr><td style="padding:6px 0;${bold ? "font-weight:700" : ""}">${l}</td><td style="text-align:right;font-family:monospace;${bold ? "font-weight:700" : ""}">${v}</td></tr>`;
  return `<html><head><meta name="viewport" content="width=device-width"/></head>
  <body style="font-family:-apple-system,Helvetica,sans-serif;padding:28px;color:#06241F">
    <h2 style="margin:0">${bizName}</h2>
    <p style="margin:2px 0 18px;color:#5C7570">Profit &amp; loss · ${d.label}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${line("Sales revenue", money(d.revenue))}
      ${line("Less returns", `(${money(d.returns, { symbol: false })})`)}
      ${line("Cost of goods sold", `(${money(d.cogs, { symbol: false })})`)}
      ${line("Gross profit", money(d.gross), true)}
      ${d.expense_lines.map((e: any) => line(e.label, `(${money(e.amount, { symbol: false })})`)).join("")}
      ${line("Net profit", money(d.net), true)}
      ${line("Margin", `${d.margin}%`)}
    </table>
    <p style="margin-top:26px;color:#93A9A4;font-size:11px">Made with tredi</p>
  </body></html>`;
}

export default function Pnl() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const { query } = usePeriod();
  const { business } = useAuth();
  const toast = useToast();
  const q = useQuery({ queryKey: ["reports-pnl", query], queryFn: () => api(`/reports/pnl?${query}`) });
  const d = q.data;

  const print = async () => {
    if (!d) return;
    setBusy(true);
    try {
      const html = pnlHtml(d, business?.name ?? "TREDI");
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
      toast.show("Profit & loss ready", "PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="pnl-screen">
      <AppBar title="Profit & loss" back right={<IconBtn name="calendar-outline" testID="pnl-period" onPress={() => setSheet(true)} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 90 }}>
        {!d ? <Loading /> : (
          <>
            <Card testID="pnl-headline">
              <Row between style={{ alignItems: "flex-start" }}>
                <View>
                  <Lbl>Net profit · {d.label}</Lbl>
                  <Money size={22} tone={d.net >= 0 ? "pos" : "neg"} testID="pnl-net">{money(d.net)}</Money>
                </View>
                <View style={{ alignItems: "flex-end" }}><Lbl>Margin</Lbl><Money size={15}>{d.margin}%</Money></View>
              </Row>
              <View style={{ marginTop: 11 }}><SingleBars data={d.bars} /></View>
            </Card>
            <Card style={{ marginTop: 9, paddingVertical: 4 }} testID="pnl-statement">
              <View style={s.row}><H4 style={{ flex: 1 }}>Sales revenue</H4><Money>{money(d.revenue, { symbol: false })}</Money></View>
              <View style={s.row}><Sub style={[{ flex: 1 }, s.indent]}>Less returns</Sub><Money tone="pos">({money(d.returns, { symbol: false })})</Money></View>
              <View style={s.row}><Sub style={[{ flex: 1 }, s.indent]}>Cost of goods sold</Sub><Money>({money(d.cogs, { symbol: false })})</Money></View>
              <View style={[s.row, s.mintRow]}><H4 style={{ flex: 1 }}>Gross profit</H4><Money>{money(d.gross, { symbol: false })}</Money></View>
              {d.expense_lines.map((e: any) => (
                <View key={e.label} style={s.row}><Sub style={[{ flex: 1 }, s.indent]}>{e.label}</Sub><Money>({money(e.amount, { symbol: false })})</Money></View>
              ))}
              {d.expense_lines.length === 0 ? <View style={s.row}><Sub style={[{ flex: 1 }, s.indent]}>No expenses recorded</Sub><Money>(0)</Money></View> : null}
              <View style={[s.row, s.deepRow, { borderBottomWidth: 0 }]}>
                <H4 style={[{ flex: 1 }, s.white]}>Net profit</H4>
                <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 14, color: colors.brandPrimary }}>{money(d.net, { symbol: false })}</Text>
              </View>
            </Card>
          </>
        )}
      </ScrollView>
      <Row style={{ position: "absolute", left: 14, right: 14, bottom: Math.max(insets.bottom, 12), gap: 8 }}>
        <View style={{ flex: 1 }}><Btn label="Export Excel" variant="ghost" small testID="pnl-export" onPress={() => toast.show("Use Print full report for now", "Excel")} /></View>
        <View style={{ flex: 1 }}><Btn label="Print full report" variant="deep" small loading={busy} testID="pnl-print" onPress={print} /></View>
      </Row>
      <PeriodSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
