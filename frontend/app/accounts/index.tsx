// 09.1 Accounts — total balance, per-account lines, recent movement.
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Card, H4, IconBtn, Li, Lbl, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, deep: { backgroundColor: c.deep, borderColor: c.deep } }));

export default function Accounts() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["accounts"], queryFn: () => api("/accounts") });
  const d = q.data;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="accounts-screen">
      <AppBar title="Accounts" back right={<IconBtn name="add" testID="accounts-payment-in" onPress={() => router.push("/payments/new")} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        {!d ? <Loading /> : (
          <>
            <Card style={s.deep} testID="accounts-total-card">
              <Lbl style={{ color: colors.onDeepMuted }}>Total balance</Lbl>
              <Money tone="white" size={23} testID="accounts-total">{money(d.total)}</Money>
              <Row style={{ gap: 14, marginTop: 8 }}>
                <Sub style={{ color: colors.onDeepSoft }}>In <Money tone="green" size={12}>{money(d.in)}</Money></Sub>
                <Sub style={{ color: colors.onDeepSoft }}>Out <Money size={12} style={{ color: colors.coralSoft }}>{money(d.out)}</Money></Sub>
              </Row>
            </Card>
            <View style={{ gap: 6, marginTop: 9 }}>
              {d.accounts.map((a: any) => (
                <Card key={a.id} style={{ paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 9 }} testID={`account-${a.id}`}>
                  <Av icon={a.kind === "cash" ? "cash-outline" : a.kind === "bank" ? "business-outline" : "phone-portrait-outline"} tone={a.kind === "cash" ? "green" : a.kind === "bank" ? "blue" : "mint"} />
                  <View style={{ flex: 1 }}><H4>{a.name}</H4><Tag>{a.detail || `${a.entries} entries`}</Tag></View>
                  <Money>{money(a.balance)}</Money>
                </Card>
              ))}
            </View>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Recent movement</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {d.recent.length === 0 ? <Sub style={{ paddingVertical: 10 }}>No movement yet.</Sub> : d.recent.map((r: any, i: number) => (
                <Li key={r.id} last={i === d.recent.length - 1} testID={`movement-${r.id}`}>
                  <Av icon={r.amount >= 0 ? "arrow-down" : "arrow-up"} tone={r.amount >= 0 ? "green" : "coral"} />
                  <View style={{ flex: 1 }}><H4>{r.title}</H4><Sub>{r.sub}</Sub></View>
                  <Money tone={r.amount >= 0 ? "pos" : "neg"}>{r.amount >= 0 ? "+ " : "− "}{money(Math.abs(r.amount), { symbol: false })}</Money>
                </Li>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
