// 02.3 Product performance — volume and margin kept deliberately apart.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Badge, Card, Empty, H4, IconBtn, Lbl, Li, Loading, Money, Prog, Row, Seg, Sub } from "@/src/components/ui";
import { RankRow } from "@/src/components/charts";
import { ExportBar, useReportMeta } from "@/src/components/export";
import { PeriodBar, PeriodSheet, usePeriod } from "@/src/period";
import { money } from "@/src/format";
import { makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

type Tab = "top" | "slow" | "profit";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Products() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("top");
  const [sheet, setSheet] = useState(false);
  const { query, shortLabel } = usePeriod();
  const meta = useReportMeta();
  const q = useQuery({ queryKey: ["reports-products", query], queryFn: () => api(`/reports/products?${query}`) });
  const d = q.data;

  const build = () => d && ({
    ...meta,
    title: "Product performance",
    kpis: [{ label: "Stock turnover", value: `${d.turnover}×` }, { label: "Health", value: d.turnover_health },
           { label: "Stock at cost", value: money(d.stock_value) }],
    sections: [
      { heading: "Top sellers",
        columns: [{ label: "#", right: true }, { label: "Item" }, { label: "Qty", right: true }, { label: "Revenue", right: true }],
        rows: (d.top ?? []).map((r: any, i: number) => [i + 1, r.name, `${r.qty} ${r.unit}`, money(r.revenue)]) },
      { heading: "Slow moving",
        columns: [{ label: "Item" }, { label: "Idle days", right: true }, { label: "Cash tied up", right: true }],
        rows: (d.slow ?? []).map((r: any) => [r.name, r.days > 300 ? "never sold" : r.days, money(r.tied)]) },
      { heading: "Most profitable",
        columns: [{ label: "Item" }, { label: "Margin", right: true }, { label: "Profit", right: true }],
        rows: (d.profit ?? []).map((r: any) => [r.name, `${r.margin}%`, money(r.profit)]) },
    ],
  });
  const top = d?.top ?? [];
  const maxRev = Math.max(1, ...top.map((r: any) => r.revenue));
  const slowest = Math.max(1, ...(d?.slow ?? []).map((r: any) => r.days));

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="products-screen">
      <AppBar title="Product performance" back right={<IconBtn name="calendar-outline" testID="products-period" onPress={() => setSheet(true)} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad + 54 }}>
        <PeriodBar label={shortLabel} onPress={() => setSheet(true)} />
        <View style={{ marginTop: 9 }}>
          <Seg
            testID="products-seg"
            value={tab}
            onChange={setTab}
            options={[{ key: "top", label: "Top sellers" }, { key: "slow", label: "Slow moving" }, { key: "profit", label: "Profit" }]}
          />
        </View>
        {!d ? <Loading /> : (
          <>
            <Card style={{ marginTop: 10, paddingVertical: 4 }} testID={`products-list-${tab}`}>
              {tab === "top" && (top.length ? top.map((r: any, i: number) => (
                <RankRow key={r.name} rank={i + 1} name={r.name} pct={(r.revenue / maxRev) * 100} primary={money(r.revenue)} secondary={`${r.qty} ${r.unit}`}
                  testID={`product-top-${i}`} onPress={r.id ? () => router.push(`/stock/${r.id}`) : undefined} />
              )) : <Empty icon="grid-outline" title="No sales in this period" />)}
              {tab === "slow" && (d.slow.length ? d.slow.map((r: any) => (
                <RankRow key={r.name} name={r.name} pct={(r.days / slowest) * 100} tone="warn" primary={money(r.tied)} secondary={`${r.days > 300 ? "never sold" : `${r.days} days`}`}
                  testID={`product-slow-${r.id}`} onPress={r.id ? () => router.push(`/stock/${r.id}`) : undefined} />
              )) : <Empty icon="checkmark-circle-outline" title="Everything is moving" sub="No item has been idle for a week." />)}
              {tab === "profit" && (d.profit.length ? d.profit.map((r: any) => (
                <RankRow key={r.name} name={r.name} pct={Math.max(4, Math.min(100, r.margin))} tone={r.margin < 12 ? "warn" : undefined} primary={`${r.margin}%`} secondary={money(r.profit)}
                  testID={`product-profit-${r.id}`} onPress={r.id ? () => router.push(`/stock/${r.id}`) : undefined} />
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
            <Li last testID="products-stock-value" onPress={() => router.push("/reports/stock")}>
              <View style={{ flex: 1 }}><H4>Value of everything on the shelf</H4><Sub>Open the stock valuation</Sub></View>
              <Money>{money(d.stock_value)}</Money>
            </Li>
            <Sub style={{ marginTop: 10 }}>Tap any product to open its stock card.</Sub>
          </>
        )}
      </ScrollView>
      <ExportBar build={build} testID="products" />
      <PeriodSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
