// 07.1 Reports — four headline figures, then reports grouped the way an
// accountant asks for them.
import { useState } from "react";
import { ScrollView, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Card, H4, IconBtn, IonName, Lbl, Li, Loading, Row, Sub } from "@/src/components/ui";
import { PeriodBar, PeriodSheet, usePeriod } from "@/src/period";
import { money } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const GROUPS: { title: string; items: { label: string; sub?: string; icon: IonName; route: string; badge?: string; testID: string }[] }[] = [
  { title: "Sales", items: [
    { label: "Sales summary", sub: "By day, customer, product, shop", icon: "grid-outline", route: "/reports/sales", testID: "report-sales-summary" },
    { label: "Sales by rep", sub: "Who sold what, and how often", icon: "people-outline", route: "/reports/reps", testID: "report-reps" },
    { label: "Sales returns", icon: "return-down-back-outline", route: "/reports/returns", testID: "report-returns" },
  ] },
  { title: "Finance", items: [
    { label: "Profit & loss", icon: "cash-outline", route: "/reports/pnl", badge: "Most used", testID: "report-pnl" },
    { label: "Cash flow", icon: "pulse-outline", route: "/reports/cashflow", testID: "report-cashflow" },
    { label: "Debtors", sub: "Who owes, how much, how late", icon: "alert-circle-outline", route: "/reports/debtors", testID: "report-debtors" },
    { label: "Receivables & payables", icon: "albums-outline", route: "/reports/receivables", testID: "report-receivables" },
  ] },
  { title: "Inventory", items: [
    { label: "Stock summary & valuation", icon: "cube-outline", route: "/reports/stock", testID: "report-stock" },
    { label: "Product performance", sub: "Top, slow and most profitable", icon: "bar-chart-outline", route: "/reports/products", testID: "report-products" },
  ] },
  { title: "Business", items: [
    { label: "Summary", sub: "Sales, purchases, expenses, profit", icon: "speedometer-outline", route: "/reports/summary", testID: "report-summary" },
    { label: "Expenses by category", sub: "Every heading, and what is inside it", icon: "receipt-outline", route: "/expenses", testID: "report-expenses" },
  ] },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  deepValue: { fontFamily: fonts.monoSemibold, fontSize: 14, color: "#FFFFFF" },
  green: { color: c.brandPrimary },
}));

export default function Reports() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const { query, shortLabel, rep } = usePeriod();
  const sum = useQuery({ queryKey: ["reports-summary", query], queryFn: () => api(`/reports/summary?${query}`) });
  const rec = useQuery({ queryKey: ["reports-receivables"], queryFn: () => api("/reports/receivables") });
  const pnl = useQuery({ queryKey: ["reports-pnl", query], queryFn: () => api(`/reports/pnl?${query}`) });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="reports-screen">
      <AppBar title="Reports" back right={<IconBtn name="calendar-outline" testID="reports-period" onPress={() => setSheet(true)} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        <PeriodBar label={sum.data?.label ?? shortLabel} onPress={() => setSheet(true)} />
        <Card style={{ marginTop: 9, backgroundColor: colors.deep, borderColor: colors.deep }} testID="reports-glance">
          <Row between>
            <Lbl style={{ color: colors.onDeepMuted }}>At a glance{rep ? ` · ${rep}` : ""}</Lbl>
            <Lbl style={{ color: colors.onDeepSoft }}>tap a figure</Lbl>
          </Row>
          {!sum.data || !pnl.data ? <Loading /> : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
              {([["Sales", money(sum.data.sales), false, "/reports/entries?kind=sales"],
                ["Profit", money(pnl.data.net), true, "/reports/pnl"],
                ["Receivables", money(rec.data?.total ?? 0), false, "/reports/debtors"],
                ["Payables", money(rec.data?.payables ?? 0), false, "/suppliers"]] as [string, string, boolean, string][]).map(([l, v, green, route]) => (
                <Pressable key={l} style={{ width: "50%", marginBottom: 8 }} testID={`glance-open-${l}`} onPress={() => router.push(route as any)}>
                  <Sub style={{ color: colors.onDeepSoft }}>{l}</Sub>
                  <View><Sub style={[s.deepValue, green ? s.green : null]} testID={`glance-${l}`}>{v}</Sub></View>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
        {GROUPS.map((g) => (
          <View key={g.title}>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>{g.title}</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {g.items.map((it, i) => (
                <Li key={it.label} testID={it.testID} last={i === g.items.length - 1} onPress={() => router.push(it.route as any)}>
                  <Av icon={it.icon} tone="sq" />
                  <View style={{ flex: 1 }}><H4>{it.label}</H4>{it.sub ? <Sub>{it.sub}</Sub> : null}</View>
                  {it.badge ? <Badge tone="paid">{it.badge}</Badge> : <Ionicons name="chevron-forward" size={16} color={colors.ink40} />}
                </Li>
              ))}
            </Card>
          </View>
        ))}
        <Row style={{ marginTop: 12 }}><Sub>Choosing a period or a rep here sets it on every report.</Sub></Row>
      </ScrollView>
      <PeriodSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
