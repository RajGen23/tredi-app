// 01.1 Home — teal top, total sales card, shortcuts, KPIs, cash flow.
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Av, Bars, Card, IconBtn, IonName, Kpi, Lbl, Loading, Money, Prog, Row, Sub, Tag } from "@/src/components/ui";
import { money } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const SHORTCUTS: { label: string; icon: IonName; route: string; green?: boolean; testID: string }[] = [
  { label: "Payment in", icon: "arrow-down", route: "/payments/new", green: true, testID: "shortcut-payment-in" },
  { label: "Expense", icon: "remove", route: "/expenses/new", testID: "shortcut-expense" },
  { label: "Add stock", icon: "cube-outline", route: "/stock/new", testID: "shortcut-add-stock" },
  { label: "Quick sale", icon: "flash-outline", route: "/quick-sale", testID: "shortcut-quick-sale" },
  { label: "Customer", icon: "happy-outline", route: "/customers/new", testID: "shortcut-customer" },
  { label: "Customers", icon: "people-outline", route: "/customers", testID: "shortcut-customers" },
  { label: "Expenses", icon: "wallet-outline", route: "/expenses", testID: "shortcut-expenses" },
  { label: "Accounts", icon: "card-outline", route: "/accounts", testID: "shortcut-accounts" },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  bizName: { fontFamily: fonts.bold, fontSize: 13.5, color: c.onSurfaceInverse },
  shop: { fontFamily: fonts.regular, fontSize: 10.5, color: c.onDeepSoft },
  hero: { borderWidth: 0, shadowColor: c.shadow, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  big: { fontFamily: fonts.monoSemibold, fontSize: 25, letterSpacing: -1, color: c.onSurface },
  edit: { fontFamily: fonts.bold, fontSize: 12, color: c.green700 },
  scLabel: { fontFamily: fonts.semibold, fontSize: 10, color: c.onSurface, textAlign: "center", marginTop: 4 },
  legend: { width: 8, height: 8, borderRadius: 3 },
}));

export default function Home() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { business } = useAuth();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api("/dashboard") });
  const d = q.data;
  const pct = d && d.total_sales ? (d.received / d.total_sales) * 100 : 0;

  return (
    <View style={s.root} testID="home-screen">
      <View style={[s.teal, { height: insets.top + 132 }]} />
      <View style={{ paddingTop: insets.top, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
        <IconBtn teal name="settings-outline" testID="home-settings" onPress={() => router.push("/(tabs)/more")} />
        <Pressable style={{ flex: 1, alignItems: "center" }} testID="home-business-switcher">
          <Text style={s.bizName}>{business?.name ?? "TREDI"} ⌄</Text>
          <Text style={s.shop}>{business?.shops?.[0]?.name ?? "Main branch"}</Text>
        </Pressable>
        <IconBtn teal name="search-outline" testID="home-search" onPress={() => router.push("/(tabs)/sales")} />
        <IconBtn teal name="notifications-outline" testID="home-notifications" dot />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        {!d ? <Card style={s.hero}><Loading /></Card> : (
          <Card style={s.hero} testID="home-total-sales-card">
            <Row between style={{ alignItems: "flex-start" }}>
              <View>
                <Lbl>Total sales</Lbl>
                <Text style={s.big} testID="home-total-sales">{money(d.total_sales)}</Text>
                <Sub style={{ marginTop: 1 }}>
                  {d.month} ⌄{d.change_pct !== null ? <> · <Text style={{ color: d.change_pct >= 0 ? colors.green700 : colors.coral, fontFamily: fonts.bold }}>{d.change_pct >= 0 ? "▲" : "▼"} {Math.abs(d.change_pct)}%</Text> vs last month</> : null}
                </Sub>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Lbl>Received</Lbl>
                <Money tone="pos" testID="home-received">{money(d.received)}</Money>
                <Lbl style={{ marginTop: 5 }}>Owed</Lbl>
                <Money tone="neg" testID="home-owed">{money(d.owed)}</Money>
              </View>
            </Row>
            <View style={{ marginTop: 10 }}><Prog pct={pct} /></View>
          </Card>
        )}

        <Row between style={{ marginTop: 12, marginBottom: 8 }}>
          <Lbl>Shortcuts</Lbl>
          <Pressable testID="home-edit-shortcuts"><Text style={s.edit}>Edit</Text></Pressable>
        </Row>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {SHORTCUTS.map((sc) => (
            <Pressable key={sc.label} testID={sc.testID} onPress={() => router.push(sc.route as any)} style={({ pressed }) => [{ width: "23.3%", alignItems: "center" }, pressed && { opacity: 0.7 }]}>
              <Av icon={sc.icon} tone={sc.green ? "green" : "mint"} size={40} radiusOverride={13} />
              <Text style={s.scLabel}>{sc.label}</Text>
            </Pressable>
          ))}
        </View>

        {d ? (
          <>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}><Kpi label="Stock at cost" value={money(d.purchases)} small={`${d.low_stock} low on stock`} /></View>
              <View style={{ flex: 1 }}><Kpi label="Expenses" value={money(d.expenses)} small={`${d.expense_count} entries`} tone="neg" /></View>
            </View>
            <Card style={{ marginTop: 9 }} testID="home-cashflow-card">
              <Row between><Lbl>Cash flow</Lbl><Tag>Last 7 days ⌄</Tag></Row>
              <Row between style={{ marginTop: 5 }}>
                <Money tone={d.net_week >= 0 ? "pos" : "neg"} size={16}>{d.net_week >= 0 ? "+ " : "− "}{money(d.net_week)}</Money>
                <Tag>net this week</Tag>
              </Row>
              <View style={{ marginTop: 9 }}>
                <Bars values={d.cashflow.flatMap((c: any) => [{ v: c.in, on: true }, { v: c.out }])} height={40} />
              </View>
              <Row style={{ marginTop: 7, gap: 12 }}>
                <Row style={{ gap: 5 }}><View style={[s.legend, { backgroundColor: colors.brandPrimary }]} /><Sub style={{ fontSize: 10 }}>In</Sub></Row>
                <Row style={{ gap: 5 }}><View style={[s.legend, { backgroundColor: colors.mint2 }]} /><Sub style={{ fontSize: 10 }}>Out</Sub></Row>
                <Pressable style={{ flex: 1, alignItems: "flex-end" }} onPress={() => router.push("/accounts")} testID="home-open-chart"><Tag>Open full chart ›</Tag></Pressable>
              </Row>
            </Card>
          </>
        ) : null}
        {q.error ? (
          <Card style={{ marginTop: 9, alignItems: "center" }}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.ink40} />
            <Sub style={{ marginTop: 4 }}>Could not load figures. Pull to retry.</Sub>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}
