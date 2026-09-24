// 02.1 Summary — four numbers answer "how is the business doing"; everything
// deeper is a row you tap.
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Card, Chip, H4, IconBtn, Kpi, Li, Loading, Row, Sub, Tag } from "@/src/components/ui";
import { DeepKpi, InOutBars, Trend } from "@/src/components/charts";
import { ExportBar, useReportMeta } from "@/src/components/export";
import { PeriodSheet, PERIODS, usePeriod } from "@/src/period";
import { money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const QUICK = PERIODS.filter((p) => ["month", "last_month", "year", "custom"].includes(p.key));

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Summary() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const { query, period, set } = usePeriod();
  const meta = useReportMeta();
  const q = useQuery({ queryKey: ["reports-summary", query], queryFn: () => api(`/reports/summary?${query}`) });
  const d = q.data;

  const build = () => d && ({
    ...meta,
    title: "Business summary",
    period: d.label,
    kpis: [{ label: "Sales", value: money(d.sales) }, { label: "Purchases", value: money(d.purchases) },
           { label: "Expenses", value: money(d.expenses) }, { label: "Gross profit", value: `${money(d.gross_profit)} · ${d.margin}%` }],
    sections: [
      { heading: "Headline",
        columns: [{ label: "Figure" }, { label: "This period", right: true }, { label: "Change", right: true }],
        rows: [["Sales", money(d.sales), `${d.sales_change ?? 0}%`],
               ["Purchases", money(d.purchases), `${d.purchases_change ?? 0}%`],
               ["Expenses", money(d.expenses), `${d.expenses_change ?? 0}%`],
               ["Gross profit", money(d.gross_profit), `${d.margin}% margin`],
               ["Receivables over 30 days", money(d.receivables_over_30), ""]] },
      { heading: "Money in vs out",
        columns: [{ label: "Week" }, { label: "In", right: true }, { label: "Out", right: true }],
        rows: (d.weeks ?? []).map((w: any) => [w.label, money(w.in), money(w.out)]) },
      { heading: "By shop",
        columns: [{ label: "Shop" }, { label: "Sales", right: true }],
        rows: (d.shops ?? []).map((sh: any) => [sh.name, money(sh.amount)]) },
    ],
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="summary-screen">
      <AppBar title="Summary" back right={<IconBtn name="share-outline" testID="summary-share" onPress={() => router.push("/reports")} />} />
      <View style={{ height: 42 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {QUICK.map((p) => (
            <Chip key={p.key} label={p.label} on={period === p.key} testID={`summary-period-${p.key}`}
              onPress={() => (p.key === "custom" ? setSheet(true) : set(p.key))} />
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad + 54 }}>
        {!d ? <Loading /> : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={{ width: "48.5%" }}>
                <Kpi label="Sales" value={money(d.sales)} footer={<Trend pct={d.sales_change} />}
                  testID="summary-kpi-sales" onPress={() => router.push("/reports/sales")} />
              </View>
              <View style={{ width: "48.5%" }}>
                <Kpi label="Purchases" value={money(d.purchases)} footer={<Trend pct={d.purchases_change} />}
                  testID="summary-kpi-purchases" onPress={() => router.push("/suppliers")} />
              </View>
              <View style={{ width: "48.5%" }}>
                <Kpi label="Expenses" value={money(d.expenses)} tone="neg" footer={<Trend pct={d.expenses_change} />}
                  testID="summary-kpi-expenses" onPress={() => router.push("/expenses")} />
              </View>
              <View style={{ width: "48.5%" }}>
                <DeepKpi label="Gross profit" value={money(d.gross_profit)} small={`${d.margin}% margin`} />
              </View>
            </View>
            <Pressable testID="summary-inout-open" onPress={() => router.push("/reports/cashflow")} style={({ pressed }) => pressed && { opacity: 0.85 }}>
              <Card style={{ marginTop: 9 }} testID="summary-inout">
                <Row between><H4>Money in vs out</H4><Tag>{d.label}</Tag></Row>
                <View style={{ marginTop: 10 }}><InOutBars data={d.weeks} /></View>
                <Sub style={{ marginTop: 8, fontSize: 10.5 }}>Tap for the full cash flow, account by account</Sub>
              </Card>
            </Pressable>
            <Card style={{ marginTop: 9, paddingVertical: 4 }}>
              <Li testID="summary-ageing" onPress={() => router.push("/reports/receivables")}>
                <Av icon="time-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>Receivables ageing</H4><Sub>{money(d.receivables_over_30)} over 30 days</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
              <Li testID="summary-products" onPress={() => router.push("/reports/products")}>
                <Av icon="grid-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>Product performance</H4><Sub>Top, slow and most profitable</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
              <Li last testID="summary-shops" onPress={() => router.push("/shops/overview")}>
                <Av icon="home-outline" tone="sq" />
                <View style={{ flex: 1 }}>
                  <H4>Shop comparison</H4>
                  <Sub>{d.shops.length > 1 ? `${d.shops[0].name} leads by ${money(d.shop_lead)}` : "One shop so far"}</Sub>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
            </Card>
          </>
        )}
      </ScrollView>
      <ExportBar build={build} testID="summary" />
      <PeriodSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
