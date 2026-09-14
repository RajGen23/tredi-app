// 02.2 Cash flow — closing balance, the curve, then where the money is sitting.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Card, H4, IconBtn, Kpi, Lbl, Li, Loading, Money, Row, Sub } from "@/src/components/ui";
import { AreaSpark, Axis } from "@/src/components/charts";
import { PeriodBar, PeriodSheet, usePeriod } from "@/src/period";
import { money } from "@/src/format";
import { makeStyles } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));
const TONE = { cash: "green", bank: "blue", mobile: "mint" } as const;
const ICON = { cash: "arrow-down-outline", bank: "card-outline", mobile: "phone-portrait-outline" } as const;

export default function CashFlow() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState(false);
  const { query, shortLabel } = usePeriod();
  const q = useQuery({ queryKey: ["reports-cashflow", query], queryFn: () => api(`/reports/cashflow?${query}`) });
  const d = q.data;
  const labels = d?.series?.length ? [d.series[0].label, d.series[Math.floor(d.series.length / 2)]?.label ?? "", d.series[d.series.length - 1].label] : [];

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="cashflow-screen">
      <AppBar title="Cash flow" back right={<IconBtn name="calendar-outline" testID="cashflow-period" onPress={() => setSheet(true)} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        <PeriodBar label={d?.label ?? shortLabel} icon="▤" onPress={() => setSheet(true)} />
        {!d ? <Loading /> : (
          <>
            <Card style={{ marginTop: 9 }} testID="cashflow-card">
              <Row between style={{ alignItems: "flex-start" }}>
                <View><Lbl>Closing balance</Lbl><Money size={20} testID="cashflow-closing">{money(d.closing)}</Money></View>
                <View style={{ alignItems: "flex-end" }}>
                  <Lbl>Net movement</Lbl>
                  <Money size={13} tone={d.net >= 0 ? "pos" : "neg"}>{d.net >= 0 ? "+ " : "− "}{money(d.net)}</Money>
                </View>
              </Row>
              <View style={{ marginTop: 12 }}><AreaSpark points={d.series.map((x: any) => x.value)} /></View>
              <Axis labels={labels} />
            </Card>
            <Row style={{ marginTop: 9, gap: 8 }}>
              <View style={{ flex: 1 }}><Kpi label="Money in" value={money(d.in)} small="Sales + payments" tone="pos" /></View>
              <View style={{ flex: 1 }}><Kpi label="Money out" value={money(d.out)} small="Purchases + expenses" tone="neg" /></View>
            </Row>
            <Card style={{ marginTop: 9, paddingVertical: 4 }} testID="cashflow-accounts">
              {d.accounts.map((a: any, i: number) => (
                <Li key={a.id} last={i === d.accounts.length - 1} testID={`cashflow-account-${a.id}`}>
                  <Av icon={ICON[a.kind as keyof typeof ICON] ?? "wallet-outline"} tone={TONE[a.kind as keyof typeof TONE] ?? "mint"} />
                  <View style={{ flex: 1 }}><H4>{a.name}</H4><Sub>{a.detail || a.kind} · {a.entries} entries</Sub></View>
                  <Money>{money(a.balance)}</Money>
                </Li>
              ))}
            </Card>
            <Sub style={{ marginTop: 10 }}>Cash flow is split by account, so “where is the money actually sitting” is answered on the same screen.</Sub>
          </>
        )}
      </ScrollView>
      <PeriodSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
