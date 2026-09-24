// Sales summary — the same figures grouped by day, customer, product or shop.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Card, Chip, Empty, H4, IconBtn, Kpi, Li, Loading, Money, Row, Sub } from "@/src/components/ui";
import { ExportBar, useReportMeta } from "@/src/components/export";
import { PeriodBar, PeriodSheet, usePeriod } from "@/src/period";
import { money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Group = "day" | "customer" | "product" | "shop" | "rep";
const GROUPS: [Group, string][] = [["day", "By day"], ["customer", "By customer"], ["product", "By product"], ["shop", "By shop"], ["rep", "By rep"]];

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function SalesSummary() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [group, setGroup] = useState<Group>("day");
  const [sheet, setSheet] = useState(false);
  const { query, shortLabel } = usePeriod();
  const meta = useReportMeta();
  const q = useQuery({ queryKey: ["reports-sales", query, group], queryFn: () => api(`/reports/sales-summary?${query}&group=${group}`) });
  const d = q.data;

  const build = () => d && ({
    ...meta,
    title: `Sales summary — ${GROUPS.find(([k]) => k === group)?.[1].toLowerCase()}`,
    period: d.label,
    kpis: [{ label: "Total sales", value: money(d.total) }, { label: "Records", value: String(d.count) }],
    sections: [{
      columns: [{ label: GROUPS.find(([k]) => k === group)?.[1] ?? "Line" }, { label: "Records", right: true }, { label: "Amount", right: true }],
      rows: d.rows.map((r: any) => [r.label, r.count, money(r.amount)]),
      total: ["Total", d.count, money(d.total)],
    }],
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="sales-summary-screen">
      <AppBar title="Sales summary" back right={<IconBtn name="calendar-outline" testID="sales-summary-period" onPress={() => setSheet(true)} />} />
      <View style={{ height: 42 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {GROUPS.map(([k, l]) => <Chip key={k} label={l} on={group === k} onPress={() => setGroup(k)} testID={`sales-group-${k}`} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 94 }}>
        <PeriodBar label={d?.label ?? shortLabel} onPress={() => setSheet(true)} />
        {!d ? <Loading /> : (
          <>
            <Row style={{ gap: 8, marginTop: 9 }}>
              <View style={{ flex: 1 }}><Kpi label="Total sales" value={money(d.total)} small={`${d.count} records`} /></View>
              <View style={{ flex: 1 }}><Kpi label="Lines" value={String(d.rows.length)} small={GROUPS.find(([k]) => k === group)?.[1]} /></View>
            </Row>
            {d.rows.length === 0 ? <Card style={{ marginTop: 9 }}><Empty icon="receipt-outline" title="No sales in this period" /></Card> : (
              <Card style={{ marginTop: 9, paddingVertical: 4 }}>
                {d.rows.map((r: any, i: number) => (
                  <Li key={`${r.label}-${i}`} last={i === d.rows.length - 1} testID={`sales-row-${i}`}
                    onPress={() => router.push(group === "day"
                      ? `/reports/entries?kind=sales&start=${r.key}&end=${r.key}&title=${encodeURIComponent(r.label)}`
                      : `/reports/entries?kind=${group}&key=${encodeURIComponent(r.key ?? r.label)}&title=${encodeURIComponent(r.label)}`)}>
                    <View style={{ flex: 1 }}><H4>{r.label}</H4><Sub>{r.count} record{r.count === 1 ? "" : "s"} · tap for the entries</Sub></View>
                    <Money>{money(r.amount)}</Money>
                    <Ionicons name="chevron-forward" size={15} color={colors.ink40} />
                  </Li>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
      <ExportBar build={build} testID="sales-summary" />
      <PeriodSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
