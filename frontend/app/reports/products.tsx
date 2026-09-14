// 02.3 Product performance — volume and margin kept deliberately apart.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Badge, Card, Empty, H4, Lbl, Loading, Money, Prog, Row, Seg, Sub } from "@/src/components/ui";
import { RankRow } from "@/src/components/charts";
import { PeriodSheet, usePeriod } from "@/src/period";
import { money } from "@/src/format";
import { makeStyles } from "@/src/theme";

type Tab = "top" | "slow" | "profit";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Products() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("top");
  const [sheet, setSheet] = useState(false);
  const { query } = usePeriod();
  const q = useQuery({ queryKey: ["reports-products", query], queryFn: () => api(`/reports/products?${query}`) });
  const d = q.data;
  const top = d?.top ?? [];
  const maxRev = Math.max(1, ...top.map((r: any) => r.revenue));
  const slowest = Math.max(1, ...(d?.slow ?? []).map((r: any) => r.days));

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="products-screen">
      <AppBar title="Product performance" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        <Seg
          testID="products-seg"
          value={tab}
          onChange={setTab}
          options={[{ key: "top", label: "Top sellers" }, { key: "slow", label: "Slow moving" }, { key: "profit", label: "Profit" }]}
        />
        {!d ? <Loading /> : (
          <>
            <Card style={{ marginTop: 10, paddingVertical: 4 }} testID={`products-list-${tab}`}>
              {tab === "top" && (top.length ? top.map((r: any, i: number) => (
                <RankRow key={r.name} rank={i + 1} name={r.name} pct={(r.revenue / maxRev) * 100} primary={money(r.revenue)} secondary={`${r.qty} ${r.unit}`} />
              )) : <Empty icon="grid-outline" title="No sales in this period" />)}
              {tab === "slow" && (d.slow.length ? d.slow.map((r: any) => (
                <RankRow key={r.name} name={r.name} pct={(r.days / slowest) * 100} tone="warn" primary={money(r.tied)} secondary={`${r.days > 300 ? "never sold" : `${r.days} days`}`} />
              )) : <Empty icon="checkmark-circle-outline" title="Everything is moving" sub="No item has been idle for a week." />)}
              {tab === "profit" && (d.profit.length ? d.profit.map((r: any) => (
                <RankRow key={r.name} name={r.name} pct={Math.max(4, Math.min(100, r.margin))} tone={r.margin < 12 ? "warn" : undefined} primary={`${r.margin}%`} secondary={money(r.profit)} />
              )) : <Empty icon="cash-outline" title="No margin to show yet" />)}
            </Card>
            <Card style={{ marginTop: 9 }} testID="products-turnover">
              <Row between><H4>Stock turnover</H4><Badge tone={d.turnover >= 2 ? "paid" : "due"}>{d.turnover_health}</Badge></Row>
              <Row style={{ marginTop: 9, gap: 14 }}>
                <View><Money size={17}>{d.turnover}×</Money><Sub>this period</Sub></View>
                <View style={{ flex: 1 }}><Prog pct={Math.min(100, d.turnover * 20)} /></View>
              </Row>
              {d.slow[0] ? (
                <Sub style={{ marginTop: 8 }}>
                  {d.slow[0].name} has not moved in {d.slow[0].days > 300 ? "a long time" : `${d.slow[0].days} days`} — {money(d.slow[0].tied)} tied up.
                </Sub>
              ) : null}
            </Card>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Stock at cost</Lbl>
            <Card><Row between><Sub>Value of everything on the shelf</Sub><Money>{money(d.stock_value)}</Money></Row></Card>
          </>
        )}
      </ScrollView>
      <PeriodSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
