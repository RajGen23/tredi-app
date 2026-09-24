// One rep's own transactions, each badged Paid, Part paid or Unpaid, with the
// expenses they recorded underneath.
import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Card, Chip, Empty, H4, IconBtn, Kpi, Lbl, Li, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { initials, money, shortDate } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

type Period = "week" | "month" | "last_month" | "year" | "all";
const LABELS: Record<Period, string> = { week: "This week", month: "This month", last_month: "Last month", year: "This year", all: "All time" };
const TONE: Record<string, "paid" | "due" | "over" | "draft"> = { paid: "paid", part_paid: "due", unpaid: "over", overdue: "over", pending: "due" };

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function RepTransactions() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [period, setPeriod] = useState<Period>("month");
  const q = useQuery({ queryKey: ["rep-transactions", id, period], queryFn: () => api(`/reps/${id}/transactions?period=${period}`) });
  const d = q.data;
  const rep = d?.rep;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="rep-transactions-screen">
      <AppBar title={rep?.name ?? "Rep"} back right={rep?.phone
        ? <IconBtn name="call-outline" testID="rep-detail-call" onPress={() => Linking.openURL(`tel:${String(rep.phone).replace(/\s/g, "")}`)} />
        : undefined} />
      <View style={{ height: 44 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {(Object.keys(LABELS) as Period[]).map((k) => <Chip key={k} label={LABELS[k]} on={period === k} onPress={() => setPeriod(k)} testID={`rep-period-${k}`} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        {!d ? <Loading /> : (
          <>
            <Card testID="rep-detail-card">
              <Row style={{ gap: 10 }}>
                <Av text={initials(rep.name)} tone="green" size={40} />
                <View style={{ flex: 1 }}>
                  <H4>{rep.name}</H4>
                  <Sub numberOfLines={1}>{rep.email || "No email"}{rep.phone ? ` · ${rep.phone}` : ""}</Sub>
                  <Tag>{rep.shops?.length ? rep.shops.join(", ") : "All shops"}</Tag>
                </View>
                <IconBtn name="create-outline" testID="rep-detail-edit" onPress={() => router.push(`/team/${id}`)} />
              </Row>
            </Card>
            <Row style={{ gap: 8, marginTop: 9 }}>
              <View style={{ flex: 1 }}><Kpi label="Sold" value={money(d.sold)} small={`${d.count} transaction${d.count === 1 ? "" : "s"}`} testID="rep-detail-sold" /></View>
              <View style={{ flex: 1 }}><Kpi label="Still unpaid" value={money(d.unpaid)} small="On their sales" tone="neg" testID="rep-detail-unpaid" /></View>
            </Row>
            <Row style={{ gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Kpi label="Average sale" value={money(d.average)} small={LABELS[period]} /></View>
              <View style={{ flex: 1 }}><Kpi label="Expenses recorded" value={money(d.expense_total)} small={`${d.expenses.length} entr${d.expenses.length === 1 ? "y" : "ies"}`} tone="neg" testID="rep-detail-expenses" /></View>
            </Row>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Their transactions</Lbl>
            {d.rows.length === 0 ? <Card><Empty icon="receipt-outline" title="Nothing in this period" sub="Try a wider period above." /></Card> : (
              <Card style={{ paddingVertical: 4 }} testID="rep-transactions-list">
                {d.rows.map((r: any, i: number) => (
                  <Li key={`${r.kind}-${r.id}`} last={i === d.rows.length - 1} testID={`rep-txn-${r.number}`} onPress={() => router.push(r.route as any)}>
                    <Av icon={r.kind === "sale" ? "flash-outline" : "receipt-outline"} tone={r.kind === "sale" ? "green" : "sq"} />
                    <View style={{ flex: 1 }}>
                      <Row between><H4>{r.number}</H4><Money>{money(r.amount)}</Money></Row>
                      <Row between style={{ marginTop: 2 }}>
                        <Sub numberOfLines={1} style={{ flex: 1 }}>{r.customer} · {shortDate(r.date)}{r.shop ? ` · ${r.shop}` : ""}</Sub>
                        <Badge tone={TONE[r.status] ?? "due"}>{r.status === "part_paid" ? "Part paid" : r.status === "pending" ? "Pending" : r.status === "paid" ? "Paid" : "Unpaid"}</Badge>
                      </Row>
                    </View>
                  </Li>
                ))}
              </Card>
            )}
            {d.expenses.length ? (
              <>
                <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Expenses they recorded</Lbl>
                <Card style={{ paddingVertical: 4 }} testID="rep-expenses-list">
                  {d.expenses.map((e: any, i: number) => (
                    <Li key={e.id} last={i === d.expenses.length - 1} testID={`rep-expense-${e.id}`} onPress={() => router.push(`/expenses/${e.id}`)}>
                      <Av icon="receipt-outline" tone="sq" />
                      <View style={{ flex: 1 }}>
                        <Row between><H4>{e.title}</H4><Money tone="neg">{money(e.amount)}</Money></Row>
                        <Sub>{e.category} · {shortDate(e.date)}{e.shop ? ` · ${e.shop}` : ""}</Sub>
                      </View>
                      <Ionicons name="chevron-forward" size={15} color={colors.ink40} />
                    </Li>
                  ))}
                </Card>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
