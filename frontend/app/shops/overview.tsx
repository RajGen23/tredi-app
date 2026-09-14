// 10.2 All shops — branch bars are relative to the best performer.
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, H4, Kpi, Lbl, Li, Loading, Money, Prog, Row, Sub } from "@/src/components/ui";
import { initials, money } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  big: { fontFamily: fonts.monoSemibold, fontSize: 24, letterSpacing: -0.9, color: c.onSurface },
}));

export default function ShopsOverview() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["shops-overview"], queryFn: () => api("/shops/overview") });
  const d = q.data;
  const best = Math.max(1, ...(d?.rows ?? []).map((r: any) => r.sales));

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="shops-overview-screen">
      <AppBar title="All shops" back right={<Badge tone="info">{d?.shop_count ?? 0} combined</Badge>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        {!d ? <Loading /> : (
          <>
            <Card testID="overview-total">
              <Lbl>Total sales · {d.label}</Lbl>
              <Text style={s.big} testID="overview-total-value">{money(d.total)}</Text>
              <Row between style={{ marginTop: 8 }}>
                <Sub>Profit after expenses</Sub>
                <Money tone={d.profit >= 0 ? "pos" : "neg"}>{money(d.profit)}</Money>
              </Row>
            </Card>
            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>By shop</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {d.rows.map((r: any, i: number) => (
                <Li key={r.name} last={i === d.rows.length - 1} testID={`overview-shop-${r.name}`}>
                  <Av text={initials(r.name)} tone="sq" />
                  <View style={{ flex: 1 }}>
                    <Row between><H4>{r.name}</H4>{r.sells ? <Money>{money(r.sales)}</Money> : <Badge tone="draft">Stock only</Badge>}</Row>
                    <View style={{ marginTop: 5 }}><Prog pct={(r.sales / best) * 100} /></View>
                  </View>
                </Li>
              ))}
            </Card>
            <Row style={{ gap: 8, marginTop: 9 }}>
              <View style={{ flex: 1 }}><Kpi label="Stock across shops" value={money(d.stock_value)} small={`${d.stock_count} items`} /></View>
              <View style={{ flex: 1 }}><Kpi label="Transfers pending" value={String(d.transfers_pending)} small="needs approval" /></View>
            </Row>
            {d.alert ? (
              <Card style={{ marginTop: 9, backgroundColor: colors.warning, borderColor: colors.warning }} testID="overview-alert">
                <Row style={{ gap: 10 }}>
                  <Ionicons name="alert-circle-outline" size={20} color={colors.amber} />
                  <View style={{ flex: 1 }}>
                    <H4 style={{ color: colors.amber }}>{d.alert.text}</H4>
                    <Sub style={{ color: colors.amber }}>Check its top sellers are in stock.</Sub>
                  </View>
                  <Btn label="Open" small variant="deep" testID="overview-alert-open" onPress={() => router.push("/(tabs)/stock")} />
                </Row>
              </Card>
            ) : null}
            <Btn label="Move stock between shops" variant="ghost" style={{ marginTop: 12 }} testID="overview-transfers" onPress={() => router.push("/transfers")} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
