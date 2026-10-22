// 01.1 Home — teal top, total sales card, shortcuts, KPIs, cash flow.
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Av, Bars, Card, H4, IconBtn, IonName, Kpi, Lbl, Li, Loading, Money, Prog, Row, Sub, Tag } from "@/src/components/ui";
import { money } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";


const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  bizName: { fontFamily: fonts.bold, fontSize: 13.5, color: c.onSurfaceInverse },
  shop: { fontFamily: fonts.regular, fontSize: 10.5, color: c.onDeepSoft },
  hero: { borderWidth: 0, boxShadow: `0 8px 22px ${c.shadow}`, elevation: 3 },
  big: { fontFamily: fonts.monoSemibold, fontSize: 23, letterSpacing: -0.8, color: c.onSurface },
  edit: { fontFamily: fonts.bold, fontSize: 12, color: c.green700 },
  scLabel: { fontFamily: fonts.semibold, fontSize: 10, color: c.onSurface, textAlign: "center", marginTop: 4 },
  legend: { width: 8, height: 8, borderRadius: 3 },
  split: { flexDirection: "row", alignItems: "center", marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: c.border },
  splitLine: { width: 1, alignSelf: "stretch", backgroundColor: c.border },
}));

export default function Home() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { business } = useAuth();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api("/dashboard") });
  const shortcuts = useQuery({ queryKey: ["shortcuts"], queryFn: () => api("/shortcuts") });
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications") });
  const shops = useQuery({ queryKey: ["shops"], queryFn: () => api("/shops") });
  const plan = useQuery({ queryKey: ["subscription"], queryFn: () => api<any>("/subscription") });
  const lowStock = useQuery({ queryKey: ["low-stock"], queryFn: () => api<any>("/low-stock") });
  const d = q.data;
  const list = shortcuts.data?.on ?? [];
  const pct = d && d.total_sales ? (d.received / d.total_sales) * 100 : 0;
  const weekIn = (d?.cashflow ?? []).reduce((a: number, c: any) => a + c.in, 0);
  const weekOut = (d?.cashflow ?? []).reduce((a: number, c: any) => a + c.out, 0);

  return (
    <View style={s.root} testID="home-screen">
      <View style={[s.teal, { height: insets.top + 146 }]} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: 12 }}>
        <IconBtn teal name="settings-outline" testID="home-settings" onPress={() => router.push("/(tabs)/more")} />
        <Pressable style={{ flex: 1, alignItems: "center", paddingHorizontal: 4 }} testID="home-business-switcher"
          onPress={() => router.push("/shops")} onLongPress={() => router.push("/businesses")}>
          <Text style={s.bizName} numberOfLines={1}>{business?.name ?? "TradaBooks"} ⌄</Text>
          <Text style={s.shop} numberOfLines={1}>{shops.data?.active || "All shops"}</Text>
        </Pressable>
        <IconBtn teal name="search-outline" testID="home-search" onPress={() => router.push("/search")} />
        <IconBtn teal name="notifications-outline" testID="home-notifications" dot={!!notifications.data?.count} onPress={() => router.push("/notifications")} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); lowStock.refetch(); }} tintColor={colors.brandPrimary} />}>
        {!d ? <Card style={s.hero}><Loading /></Card> : (
          <Pressable testID="home-total-sales-open" onPress={() => router.push("/reports/sales")} style={({ pressed }) => pressed && { opacity: 0.85 }}>
            <Card style={s.hero} testID="home-total-sales-card">
              <Row style={{ gap: 5 }}><Lbl>Total sales</Lbl><Ionicons name="chevron-forward" size={12} color={colors.ink40} /></Row>
              <Text style={s.big} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} testID="home-total-sales">{money(d.total_sales)}</Text>
              <Sub style={{ marginTop: 1 }}>
                {d.month}{d.change_pct !== null ? <> · <Text style={{ color: d.change_pct >= 0 ? colors.green700 : colors.coral, fontFamily: fonts.bold }}>{d.change_pct >= 0 ? "▲" : "▼"} {Math.abs(d.change_pct)}%</Text> vs last month</> : null}
              </Sub>
              {/* Received and Owed sit on their own row, so a long figure can never
                  run into them however narrow the phone is. */}
              <View style={s.split}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Lbl numberOfLines={1}>Received</Lbl>
                  <Money tone="pos" size={14} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="home-received">{money(d.received)}</Money>
                </View>
                <View style={s.splitLine} />
                <View style={{ flex: 1, paddingLeft: 10 }}>
                  <Lbl numberOfLines={1}>Owed</Lbl>
                  <Money tone="neg" size={14} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="home-owed">{money(d.owed)}</Money>
                </View>
              </View>
              <View style={{ marginTop: 10 }}><Prog pct={pct} /></View>
              <Sub style={{ marginTop: 7, fontSize: 10.5 }}>Tap to see this month&rsquo;s sales, by day, customer or product</Sub>
            </Card>
          </Pressable>
        )}

        {plan.data && plan.data.status !== "active" ? (
          <Pressable testID="home-plan-banner" onPress={() => router.push("/settings/plan")} style={({ pressed }) => pressed && { opacity: 0.85 }}>
            <Card style={{ marginTop: 12, backgroundColor: plan.data.status === "expired" ? colors.error : colors.warning, borderColor: "transparent" }}>
              <Row between>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <H4>{plan.data.status === "expired"
                    ? (plan.data.trialing ? "Your free trial has ended" : "Your subscription has lapsed")
                    : `${Math.max(0, plan.data.days_left ?? 0)} day${plan.data.days_left === 1 ? "" : "s"} left in your free trial`}</H4>
                  <Sub style={{ marginTop: 2 }}>{plan.data.status === "expired"
                    ? "Your books are safe and readable — pick a plan to start saving again."
                    : "Pick a plan whenever you are ready. Nothing is charged from the app."}</Sub>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink60} />
              </Row>
            </Card>
          </Pressable>
        ) : null}

        {lowStock.data && lowStock.data.count > 0 ? (
          <Pressable testID="home-low-stock-card" onPress={() => router.push("/stock/low")} style={({ pressed }) => pressed && { opacity: 0.85 }}>
            <Card style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Av icon="alert-circle-outline" tone={lowStock.data.out ? "coral" : "mint"} />
              <View style={{ flex: 1 }}>
                <H4 testID="home-low-stock-count">{lowStock.data.count} item{lowStock.data.count === 1 ? "" : "s"} about to run out</H4>
                <Sub numberOfLines={2} style={{ marginTop: 1 }}>
                  {lowStock.data.items.slice(0, 3).map((i: any) => i.name).join(", ")}
                  {lowStock.data.count > 3 ? ` +${lowStock.data.count - 3} more` : ""}
                </Sub>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink60} />
            </Card>
          </Pressable>
        ) : null}

        <Row between style={{ marginTop: 12, marginBottom: 8 }}>
          <Lbl>Shortcuts</Lbl>
          <Pressable testID="home-edit-shortcuts" onPress={() => router.push("/shortcuts")}><Text style={s.edit}>Edit</Text></Pressable>
        </Row>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {list.map((sc: any, i: number) => (
            <Pressable key={sc.key} testID={`shortcut-${sc.key}`} onPress={() => router.push(sc.route as any)} style={({ pressed }) => [{ width: "23.3%", alignItems: "center" }, pressed && { opacity: 0.7 }]}>
              <Av icon={sc.icon as IonName} tone={i === 0 ? "green" : "mint"} size={40} radiusOverride={13} />
              <Text style={s.scLabel}>{sc.label}</Text>
            </Pressable>
          ))}
        </View>

        {d ? (
          <>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Kpi label="Stock at cost" value={money(d.purchases)} small={`${d.low_stock} low on stock`}
                  testID="home-kpi-stock" onPress={() => router.push("/reports/stock")} />
              </View>
              <View style={{ flex: 1 }}>
                <Kpi label="Expenses" value={money(d.expenses)} small={`${d.expense_count} entries`} tone="neg"
                  testID="home-kpi-expenses" onPress={() => router.push("/expenses")} />
              </View>
            </View>
            <Card style={{ marginTop: 9 }} testID="home-cashflow-card">
              <Row between><Lbl>Money in / money out</Lbl><Tag>Last 7 days</Tag></Row>
              {/* Real figures, not just a chart: in, out and the net of the two. */}
              <View style={{ flexDirection: "row", marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Lbl numberOfLines={1}>Money in</Lbl>
                  <Money tone="pos" size={14} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="home-money-in">{money(weekIn)}</Money>
                </View>
                <View style={{ flex: 1 }}>
                  <Lbl numberOfLines={1}>Money out</Lbl>
                  <Money tone="neg" size={14} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="home-money-out">{money(weekOut)}</Money>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Lbl numberOfLines={1}>Net</Lbl>
                  <Money tone={d.net_week >= 0 ? "pos" : "neg"} size={14} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="home-net-week">
                    {d.net_week >= 0 ? "+ " : "− "}{money(Math.abs(d.net_week))}
                  </Money>
                </View>
              </View>
              <View style={{ marginTop: 9 }}>
                <Bars values={d.cashflow.flatMap((c: any) => [{ v: c.in, on: true }, { v: c.out }])} height={40} />
              </View>
              <Row style={{ marginTop: 7, gap: 12 }}>
                <Row style={{ gap: 5 }}><View style={[s.legend, { backgroundColor: colors.brandPrimary }]} /><Sub style={{ fontSize: 10 }}>In</Sub></Row>
                <Row style={{ gap: 5 }}><View style={[s.legend, { backgroundColor: colors.mint2 }]} /><Sub style={{ fontSize: 10 }}>Out</Sub></Row>
                <Pressable style={{ flex: 1, alignItems: "flex-end" }} onPress={() => router.push("/reports/cashflow")} testID="home-open-chart"><Tag>Open full chart ›</Tag></Pressable>
              </Row>
            </Card>
          </>
        ) : null}
        {d ? (
          <Card style={{ marginTop: 9, paddingVertical: 4 }} testID="home-rails">
            <Li testID="home-summary" onPress={() => router.push("/reports/summary")}>
              <Av icon="speedometer-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>Summary</H4><Sub>Sales, purchases, expenses and profit</Sub></View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            <Li last testID="home-activity" onPress={() => router.push("/activity")}>
              <Av icon="pulse-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>Activity</H4><Sub>Who did what, in which shop</Sub></View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
          </Card>
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
