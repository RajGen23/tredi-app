// 08.1 Expenses — period chips, total + ring, category breakdown, list.
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle } from "react-native-svg";

import { api } from "@/src/api";
import { AppBar, Av, Btn, Card, Chip, Divider, Empty, H4, IconBtn, IonName, Li, Lbl, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Period = "month" | "last_month" | "week" | "all";
const ICONS: Record<string, IonName> = { Rent: "home-outline", "Transport & fuel": "car-outline", Salaries: "people-outline", Utilities: "flash-outline", Repairs: "build-outline" };

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, legend: { width: 8, height: 8, borderRadius: 3 } }));

export default function Expenses() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("month");
  const q = useQuery({ queryKey: ["expenses", period], queryFn: () => api(`/expenses?period=${period}`) });
  const d = q.data;
  const ringColors = [colors.deep, colors.brandPrimary, colors.amber, colors.surfaceTertiary];
  const cats = d ? d.by_category.slice(0, 3).concat(d.by_category.length > 3 ? [{ category: "Other", amount: d.by_category.slice(3).reduce((a: number, c: any) => a + c.amount, 0) }] : []) : [];
  let offset = 25;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="expenses-screen">
      <AppBar title="Expenses" back right={<><IconBtn name="options-outline" testID="expenses-filter" /><IconBtn name="add" testID="expenses-add" onPress={() => router.push("/expenses/new")} /></>} />
      <View style={{ height: 44 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {([["month", "This month"], ["last_month", "Last month"], ["week", "This week"], ["all", "All time"]] as [Period, string][]).map(([k, l]) => <Chip key={k} label={l} on={period === k} onPress={() => setPeriod(k)} testID={`expenses-period-${k}`} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        {!d ? <Loading /> : (
          <>
            <Card testID="expenses-summary-card">
              <Row between>
                <View><Lbl>{period === "month" ? "This month" : period === "last_month" ? "Last month" : period === "week" ? "This week" : "All time"}</Lbl><Money tone="neg" size={20} testID="expenses-total">{money(d.total)}</Money><Sub>{d.count} entries</Sub></View>
                <Svg width={78} height={78} viewBox="0 0 42 42">
                  <Circle cx="21" cy="21" r="15.9" fill="none" stroke={colors.surfaceTertiary} strokeWidth="7" />
                  {cats.map((c: any, i: number) => {
                    const pct = d.total ? (c.amount / d.total) * 100 : 0;
                    const el = <Circle key={c.category} cx="21" cy="21" r="15.9" fill="none" stroke={ringColors[i]} strokeWidth="7" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} />;
                    offset -= pct;
                    return el;
                  })}
                </Svg>
              </Row>
              <Divider />
              <View style={{ gap: 6 }}>
                {cats.map((c: any, i: number) => <Row key={c.category} between><Row style={{ gap: 6 }}><View style={[s.legend, { backgroundColor: ringColors[i] }]} /><Sub>{c.category}</Sub></Row><Money>{money(c.amount)}</Money></Row>)}
                {cats.length === 0 ? <Sub>No spending recorded for this period.</Sub> : null}
              </View>
            </Card>
            {d.items.length === 0 ? <Card style={{ marginTop: 9 }}><Empty icon="wallet-outline" title="No expenses yet" action={<Btn label="Add expense" onPress={() => router.push("/expenses/new")} testID="expenses-empty-add" />} /></Card> : (
              <Card style={{ marginTop: 9, paddingVertical: 4 }}>
                {d.items.map((e: any, i: number) => (
                  <Li key={e.id} testID={`expense-row-${e.id}`} last={i === d.items.length - 1}>
                    <Av icon={ICONS[e.category] ?? "receipt-outline"} tone="sq" />
                    <View style={{ flex: 1 }}>
                      <Row between><H4>{e.note || e.category}</H4><Money tone="neg">{money(e.amount)}</Money></Row>
                      <Row between><Sub>{e.category} · {e.account_name}</Sub><Tag>{e.receipt_url ? "⌾ receipt" : "no receipt"}</Tag></Row>
                    </View>
                  </Li>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
