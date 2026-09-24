// 09.1b Account statement — money in and out of one account, line by line,
// with a running balance. Anything raised from an invoice links back to it.
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Card, Chip, Empty, H4, Li, Lbl, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { money, shortDate } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type P = "month" | "last_month" | "week" | "all";
const PERIODS: [P, string][] = [["month", "This month"], ["last_month", "Last month"], ["week", "This week"], ["all", "All time"]];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  num: { fontFamily: fonts.monoSemibold, fontSize: 12 },
}));

export default function AccountStatement() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [period, setPeriod] = useState<P>("month");
  const q = useQuery({ queryKey: ["account", id, period], queryFn: () => api(`/accounts/${id}?period=${period}`) });
  const d = q.data;

  const open = (r: any) => {
    if (r.ref_type === "invoice" && r.ref_id) return router.push(`/invoices/${r.ref_id}`);
    if (r.ref_type === "sale" && r.ref_id) return router.push(`/sales/${r.ref_id}`);
    if (r.ref_type === "expense" && r.ref_id) return router.push(`/expenses/${r.ref_id}`);
  };

  return (
    <View style={s.root} testID="account-statement-screen">
      <View style={[s.teal, { height: insets.top + 124 }]} />
      <View style={{ paddingTop: insets.top }}><AppBar teal back title={d?.account?.name ?? "Account"} /></View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        {!d ? <Card><Loading /></Card> : (
          <>
            <Card testID="account-balance-card">
              <Row between style={{ alignItems: "flex-start" }}>
                <View>
                  <Lbl>Balance now</Lbl>
                  <Money size={22} testID="account-balance">{money(d.closing)}</Money>
                  <Tag>{d.account.detail || d.account.kind}</Tag>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Lbl>In · {d.label}</Lbl><Money tone="pos">{money(d.in)}</Money>
                  <Lbl style={{ marginTop: 5 }}>Out · {d.label}</Lbl><Money tone="neg">{money(d.out)}</Money>
                </View>
              </Row>
              <Row between style={{ marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Sub>Opening balance</Sub><Money size={12.5}>{money(d.opening)}</Money>
              </Row>
            </Card>
            <View style={{ height: 44, marginTop: 4 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
                {PERIODS.map(([k, l]) => <Chip key={k} label={l} on={period === k} onPress={() => setPeriod(k)} testID={`account-period-${k}`} />)}
              </ScrollView>
            </View>
            {d.entries.length === 0 ? (
              <Card><Empty icon="swap-vertical-outline" title="Nothing moved in this period" sub="Try a longer period above." /></Card>
            ) : (
              <Card style={{ paddingVertical: 4 }} testID="account-entries">
                {d.entries.map((r: any, i: number) => (
                  <Li key={`${r.id}-${i}`} last={i === d.entries.length - 1} testID={`account-entry-${r.id}`}
                    onPress={r.ref_id ? () => open(r) : undefined}>
                    <Av icon={r.kind === "in" ? "arrow-down" : "arrow-up"} tone={r.kind === "in" ? "green" : "coral"} />
                    <View style={{ flex: 1 }}>
                      <Row between>
                        <H4 numberOfLines={1} style={{ flex: 1 }}>{r.title}</H4>
                        <Money tone={r.kind === "in" ? "pos" : "neg"}>{r.kind === "in" ? "+ " : "− "}{money(Math.abs(r.amount), { symbol: false })}</Money>
                      </Row>
                      <Row between style={{ marginTop: 1 }}>
                        <Sub numberOfLines={1} style={{ flex: 1 }}>{shortDate(r.date)} · {r.sub}{r.method ? ` · ${r.method}` : ""}</Sub>
                        <Tag style={s.num}>bal {money(r.balance, { symbol: false })}</Tag>
                      </Row>
                      {r.ref_number ? <Tag>from invoice {r.ref_number} ›</Tag> : null}
                    </View>
                    {r.ref_id ? <Ionicons name="chevron-forward" size={14} color={colors.ink40} /> : null}
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
