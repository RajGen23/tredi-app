// 07.3 Profit & loss — read on the phone, print for the accountant.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Card, H4, IconBtn, Lbl, Loading, Money, Row, Sub } from "@/src/components/ui";
import { SingleBars } from "@/src/components/charts";
import { ExportBar, useReportMeta } from "@/src/components/export";
import { PeriodSheet, usePeriod } from "@/src/period";
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

export default function Pnl() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState(false);
  const { query } = usePeriod();
  const meta = useReportMeta();
  const q = useQuery({ queryKey: ["reports-pnl", query], queryFn: () => api(`/reports/pnl?${query}`) });
  const d = q.data;

  const build = () => d && ({
    ...meta,
    title: "Profit & loss",
    period: d.label,
    kpis: [{ label: "Net profit", value: money(d.net) }, { label: "Margin", value: `${d.margin}%` },
           { label: "Revenue", value: money(d.revenue) }, { label: "Cost of goods", value: money(d.cogs) }],
    sections: [{
      columns: [{ label: "Line" }, { label: "Amount", right: true }],
      rows: [["Sales revenue", money(d.revenue)], ["Less returns", `(${money(d.returns)})`],
             ["Cost of goods sold", `(${money(d.cogs)})`], ["Gross profit", money(d.gross)],
             ...d.expense_lines.map((e: any) => [e.label, `(${money(e.amount)})`])],
      total: ["Net profit", money(d.net)],
    }],
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="pnl-screen">
      <AppBar title="Profit & loss" back right={<IconBtn name="calendar-outline" testID="pnl-period" onPress={() => setSheet(true)} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 94 }}>
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
      <ExportBar build={build} testID="pnl" />
      <PeriodSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
