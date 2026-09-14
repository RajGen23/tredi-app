// Sales summary — the same figures grouped by day, customer, product or shop.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Card, Chip, Empty, H4, IconBtn, Kpi, Lbl, Li, Loading, Money, Row, Sub } from "@/src/components/ui";
import { PeriodBar, PeriodSheet, usePeriod } from "@/src/period";
import { money } from "@/src/format";
import { makeStyles } from "@/src/theme";

type Group = "day" | "customer" | "product" | "shop";
const GROUPS: [Group, string][] = [["day", "By day"], ["customer", "By customer"], ["product", "By product"], ["shop", "By shop"]];

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function SalesSummary() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [group, setGroup] = useState<Group>("day");
  const [sheet, setSheet] = useState(false);
  const { query, shortLabel } = usePeriod();
  const q = useQuery({ queryKey: ["reports-sales", query, group], queryFn: () => api(`/reports/sales-summary?${query}&group=${group}`) });
  const d = q.data;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="sales-summary-screen">
      <AppBar title="Sales summary" back right={<IconBtn name="calendar-outline" testID="sales-summary-period" onPress={() => setSheet(true)} />} />
      <View style={{ height: 42 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {GROUPS.map(([k, l]) => <Chip key={k} label={l} on={group === k} onPress={() => setGroup(k)} testID={`sales-group-${k}`} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
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
                  <Li key={`${r.label}-${i}`} last={i === d.rows.length - 1}>
                    <View style={{ flex: 1 }}><H4>{r.label}</H4><Sub>{r.count} record{r.count === 1 ? "" : "s"}</Sub></View>
                    <Money>{money(r.amount)}</Money>
                  </Li>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
      <PeriodSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
