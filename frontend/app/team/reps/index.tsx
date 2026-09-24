// Reps performance — the page the old app had: every rep with their contact
// details, what they sold, how often, what they collected and what they spent.
// Tapping a rep opens their own transactions.
import { useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Card, Chip, Empty, H4, IconBtn, Lbl, Li, Loading, Money, Prog, Row, Sub, Tag } from "@/src/components/ui";
import { SyncStamp } from "@/src/components/sync";
import { initials, money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Period = "week" | "month" | "last_month" | "year" | "all";
const LABELS: Record<Period, string> = { week: "This week", month: "This month", last_month: "Last month", year: "This year", all: "All time" };

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, deep: { backgroundColor: c.deep, borderColor: c.deep } }));

export default function RepsPerformance() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("month");
  const q = useQuery({ queryKey: ["reports-reps", period], queryFn: () => api(`/reports/reps?period=${period}`) });
  const d = q.data;
  const rows: any[] = d?.rows ?? [];
  const best = Math.max(1, ...rows.map((r) => r.sales));

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="reps-screen">
      <AppBar title="Reps performance" back right={<IconBtn name="podium-outline" testID="reps-open-report" onPress={() => router.push("/reports/reps")} />} />
      <View style={{ height: 44 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {(Object.keys(LABELS) as Period[]).map((k) => <Chip key={k} label={LABELS[k]} on={period === k} onPress={() => setPeriod(k)} testID={`reps-period-${k}`} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        <SyncStamp at={q.dataUpdatedAt} busy={q.isFetching} onRefresh={q.refetch} testID="reps-sync" />
        {!d ? <Loading /> : (
          <>
            <Card style={s.deep} testID="reps-total-card">
              <Lbl style={{ color: colors.onDeepMuted }}>{LABELS[period]} · sold by the team</Lbl>
              <Money tone="white" size={22} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="reps-total">{money(d.total)}</Money>
              <Sub style={{ color: colors.onDeepSoft, marginTop: 4 }}>{d.best ? `${d.best} is ahead` : "Nothing recorded in this period"}</Sub>
            </Card>
            {rows.length === 0 ? <Card style={{ marginTop: 9 }}><Empty icon="people-outline" title="No reps yet" sub="Invite your staff and their figures appear here." /></Card> : (
              <View style={{ gap: 8, marginTop: 9 }}>
                {rows.map((r, i) => (
                  <Card key={r.rep} style={{ paddingVertical: 11 }} testID={`rep-card-${r.rep}`}>
                    <Row between>
                      <Row style={{ gap: 9, flex: 1 }}>
                        <Av text={initials(r.rep)} tone={i === 0 && r.sales > 0 ? "green" : "sq"} />
                        <View style={{ flex: 1 }}>
                          <H4 numberOfLines={1}>{r.rep}</H4>
                          <Sub numberOfLines={1}>{r.email || "No email"}{r.phone ? ` · ${r.phone}` : ""}</Sub>
                        </View>
                      </Row>
                      <Row style={{ gap: 4 }}>
                        {r.phone ? <IconBtn name="call-outline" testID={`rep-call-${r.rep}`} onPress={() => Linking.openURL(`tel:${String(r.phone).replace(/\s/g, "")}`)} /> : null}
                        {r.user_id ? <IconBtn name="create-outline" testID={`rep-edit-${r.rep}`} onPress={() => router.push(`/team/${r.user_id}`)} /> : null}
                      </Row>
                    </Row>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
                      <View style={{ width: "50%", marginBottom: 8 }}>
                        <Lbl>Sales value</Lbl>
                        <Money size={14} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID={`rep-sales-${r.rep}`}>{money(r.sales)}</Money>
                      </View>
                      <View style={{ width: "50%", marginBottom: 8 }}>
                        <Lbl>Invoices raised</Lbl>
                        <Money size={14} testID={`rep-invoices-${r.rep}`}>{r.invoices}{r.quick_sales ? ` + ${r.quick_sales} quick` : ""}</Money>
                      </View>
                      <View style={{ width: "50%" }}>
                        <Lbl>Collections</Lbl>
                        <Money tone="pos" size={14} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID={`rep-collected-${r.rep}`}>{money(r.collected)}</Money>
                      </View>
                      <View style={{ width: "50%" }}>
                        <Lbl>Expenses recorded</Lbl>
                        <Money tone="neg" size={14} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID={`rep-expenses-${r.rep}`}>{money(r.expenses)}</Money>
                      </View>
                    </View>
                    <View style={{ marginTop: 9 }}><Prog pct={(r.sales / best) * 100} /></View>
                    <Row between style={{ marginTop: 8 }}>
                      <Row style={{ gap: 6 }}>
                        <Badge tone="info">{r.frequency}/week</Badge>
                        <Tag>avg {money(r.average_sale)}</Tag>
                      </Row>
                      {r.user_id ? (
                        <Pressable testID={`rep-open-${r.rep}`} onPress={() => router.push(`/team/reps/${r.user_id}`)}>
                          <Row style={{ gap: 3 }}>
                            <Tag style={{ color: colors.green700 }}>Their transactions</Tag>
                            <Ionicons name="chevron-forward" size={13} color={colors.green700} />
                          </Row>
                        </Pressable>
                      ) : null}
                    </Row>
                  </Card>
                ))}
              </View>
            )}
            <Li last style={{ marginTop: 12 }} testID="reps-to-report" onPress={() => router.push("/reports/reps")}>
              <Av icon="bar-chart-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>Sales by rep report</H4><Sub>Printable, exportable, with the period you choose</Sub></View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
          </>
        )}
      </ScrollView>
    </View>
  );
}
