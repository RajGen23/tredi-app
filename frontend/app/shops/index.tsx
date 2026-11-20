// 10.1 Switch shop — a warehouse is a shop with sales turned off.
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, H4, IconBtn, Li, Loading, Money, Radio, Row, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { initials, money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Shops() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["shops"], queryFn: () => api("/shops") });
  const d = q.data;

  const pick = useMutation({
    mutationFn: (shop: string) => api("/shops/active", { method: "POST", json: { shop } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.show(r.shop ? `Now working ${r.shop}` : "Showing all shops");
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)");
    },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="shops-screen">
      <AppBar title="Switch shop" back right={<Badge tone="info">{d?.count ?? 0} branches</Badge>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        {!d ? <Loading /> : (
          <>
            <Card style={{ paddingVertical: 4 }}>
              {d.can_see_all ? (
                <Li testID="shop-all" onPress={() => pick.mutate("")}>
                  <Radio on={!d.active} />
                  <View style={{ flex: 1 }}><H4>All shops</H4><Sub>Combined view · {d.count} branch{d.count === 1 ? "" : "es"}</Sub></View>
                  <Money>{money(d.total)}</Money>
                </Li>
              ) : null}
              {d.shops.map((sh: any, i: number) => (
                <Li key={sh.name} last={i === d.shops.length - 1} testID={`shop-${sh.name}`} onPress={() => (sh.dormant ? toast.show(`${sh.name} is dormant — reopen it to work there`) : pick.mutate(sh.name))}>
                  <Av text={initials(sh.name)} tone={d.active === sh.name ? "green" : "sq"} />
                  <View style={{ flex: 1 }}>
                    <Row between><H4>{sh.name}</H4>{sh.sells ? <Money>{money(sh.sales)}</Money> : <Badge tone="draft">Stock only</Badge>}</Row>
                    <Sub>{sh.is_main ? "Main · " : ""}{sh.dormant ? "Dormant — nothing new is recorded here" : sh.address || (sh.sells ? "this month" : "no sales")}</Sub>
                  </View>
                  {d.can_see_all ? <IconBtn name="create-outline" testID={`shop-edit-${sh.name}`} onPress={() => router.push(`/shops/new?edit=${encodeURIComponent(sh.name)}`)} /> : null}
                  {d.active === sh.name ? <Ionicons name="checkmark" size={16} color={colors.brandPrimary} /> : null}
                </Li>
              ))}
            </Card>
            {d.can_see_all ? <Btn label="Add a shop" variant="ghost" style={{ marginTop: 12 }} testID="shops-add" onPress={() => router.push("/shops/new")} /> : null}
            {d.can_see_all ? (
              <Li last style={{ marginTop: 12 }} testID="shops-overview" onPress={() => router.push("/shops/overview")}>
                <Av icon="stats-chart-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>Compare all shops</H4><Sub>Sales, stock and transfers side by side</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
            ) : null}
            <Sub style={{ marginTop: 12 }}>
              {d.can_see_all
                ? "Sales, stock, expenses and reports all follow the shop you pick here. A warehouse is a shop with sales turned off."
                : "You work in the shops your owner assigned to you, so every figure you see belongs to them."}
            </Sub>
          </>
        )}
      </ScrollView>
    </View>
  );
}
