// 02.1 Summary — four numbers answer "how is the business doing"; everything
// deeper is a row you tap.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Card, Chip, H4, IconBtn, Kpi, Lbl, Li, Loading, Row, Sub, Tag } from "@/src/components/ui";
import { DeepKpi, InOutBars, Trend } from "@/src/components/charts";
import { PeriodSheet, PERIODS, usePeriod } from "@/src/period";
import { money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const QUICK = PERIODS.filter((p) => ["month", "last_month", "year", "custom"].includes(p.key));

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Summary() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const { query, period, set } = usePeriod();
  const q = useQuery({ queryKey: ["reports-summary", query], queryFn: () => api(`/reports/summary?${query}`) });
  const d = q.data;

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
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        {!d ? <Loading /> : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={{ width: "48.5%" }}>
                <Kpi label="Sales" value={money(d.sales)} />
                <View style={{ marginTop: -8, paddingHorizontal: 10, paddingBottom: 8 }}><Trend pct={d.sales_change} /></View>
              </View>
              <View style={{ width: "48.5%" }}>
                <Kpi label="Purchases" value={money(d.purchases)} />
                <View style={{ marginTop: -8, paddingHorizontal: 10, paddingBottom: 8 }}><Trend pct={d.purchases_change} /></View>
              </View>
              <View style={{ width: "48.5%" }}>
                <Kpi label="Expenses" value={money(d.expenses)} tone="neg" />
                <View style={{ marginTop: -8, paddingHorizontal: 10, paddingBottom: 8 }}><Trend pct={d.expenses_change} /></View>
              </View>
              <View style={{ width: "48.5%" }}>
                <DeepKpi label="Gross profit" value={money(d.gross_profit)} small={`${d.margin}% margin`} />
              </View>
            </View>
            <Card style={{ marginTop: 9 }} testID="summary-inout">
              <Row between><H4>Money in vs out</H4><Tag>{d.label}</Tag></Row>
              <View style={{ marginTop: 10 }}><InOutBars data={d.weeks} /></View>
            </Card>
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
      <PeriodSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
