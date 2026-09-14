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
  const d = q.data;
  const list = shortcuts.data?.on ?? [];
  const pct = d && d.total_sales ? (d.received / d.total_sales) * 100 : 0;

  return (
    <View style={s.root} testID="home-screen">
      <View style={[s.teal, { height: insets.top + 146 }]} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: 12 }}>
        <IconBtn teal name="settings-outline" testID="home-settings" onPress={() => router.push("/(tabs)/more")} />
        <Pressable style={{ flex: 1, alignItems: "center", paddingHorizontal: 4 }} testID="home-business-switcher"
          onPress={() => router.push("/shops")} onLongPress={() => router.push("/businesses")}>
          <Text style={s.bizName} numberOfLines={1}>{business?.name ?? "TREDI"} ⌄</Text>
          <Text style={s.shop} numberOfLines={1}>{shops.data?.active || "All shops"}</Text>
        </Pressable>
        <IconBtn teal name="search-outline" testID="home-search" onPress={() => router.push("/search")} />
        <IconBtn teal name="notifications-outline" testID="home-notifications" dot={!!notifications.data?.count} onPress={() => router.push("/notifications")} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        {!d ? <Card style={s.hero}><Loading /></Card> : (
          <Card style={s.hero} testID="home-total-sales-card">
            <Row between style={{ alignItems: "flex-start" }}>
              <View style={{ flexShrink: 1, paddingRight: 10 }}>
                <Lbl>Total sales</Lbl>
                <Text style={s.big} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} testID="home-total-sales">{money(d.total_sales)}</Text>
                <Sub style={{ marginTop: 1 }}>
                  {d.month} ⌄{d.change_pct !== null ? <> · <Text style={{ color: d.change_pct >= 0 ? colors.green700 : colors.coral, fontFamily: fonts.bold }}>{d.change_pct >= 0 ? "▲" : "▼"} {Math.abs(d.change_pct)}%</Text> vs last month</> : null}
                </Sub>
              </View>
              <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
                <Lbl numberOfLines={1}>Received</Lbl>
                <Money tone="pos" numberOfLines={1} testID="home-received">{money(d.received)}</Money>
                <Lbl style={{ marginTop: 5 }} numberOfLines={1}>Owed</Lbl>
                <Money tone="neg" numberOfLines={1} testID="home-owed">{money(d.owed)}</Money>
              </View>
            </Row>
            <View style={{ marginTop: 10 }}><Prog pct={pct} /></View>
          </Card>
        )}

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
