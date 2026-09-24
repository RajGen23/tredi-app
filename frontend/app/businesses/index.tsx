// 10.3 / 10.4 Your businesses — nothing is shared between them.
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppBar, Av, Badge, Btn, Card, Divider, H4, IconBtn, Kpi, Lbl, Li, Loading, Money, Row, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { initials, money } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  name: { fontFamily: fonts.extrabold, fontSize: 16, letterSpacing: -0.2, color: c.onSurface },
}));

export default function Businesses() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const q = useQuery({ queryKey: ["businesses"], queryFn: () => api("/businesses") });
  const d = q.data;

  const switchTo = useMutation({
    mutationFn: (id: string) => api(`/businesses/${id}/switch`, { method: "POST" }),
    onSuccess: async (b: any) => {
      qc.clear();
      await refresh();
      toast.show(`Working in ${b.name}`, "Switched");
      router.replace("/(tabs)");
    },
    onError: (e: any) => toast.show(e.message),
  });

  const active = d?.businesses?.find((b: any) => b.active);

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="businesses-screen">
      <AppBar title="Businesses" back right={<IconBtn name="add" testID="businesses-add" onPress={() => router.push("/businesses/new")} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        {!d ? <Loading /> : (
          <>
            {active ? (
              <Card testID="business-active">
                <Row style={{ gap: 10 }}>
                  <Av text={initials(active.name)} tone="green" size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{active.name}</Text>
                    <Sub>{active.type} · {active.address || "no address yet"}</Sub>
                  </View>
                  <Badge tone="paid">Active</Badge>
                </Row>
                <Divider />
                <Row style={{ gap: 8 }}>
                  <View style={{ flex: 1 }}><Kpi label="Shops" value={String(active.shops.length)} /></View>
                  <View style={{ flex: 1 }}><Kpi label="Users" value={String(active.users)} /></View>
                  <View style={{ flex: 1 }}><Kpi label="Plan" value={active.plan} /></View>
                </Row>
                <Row between style={{ marginTop: 10 }}>
                  <Sub>This month</Sub>
                  <Money>{money(active.sales)}</Money>
                </Row>
              </Card>
            ) : null}

            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Your other businesses</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {d.businesses.filter((b: any) => !b.active).map((b: any, i: number, arr: any[]) => (
                <Li key={b.id} last={i === arr.length - 1} testID={`business-${b.id}`} onPress={() => switchTo.mutate(b.id)}>
                  <Av text={initials(b.name)} tone="sq" />
                  <View style={{ flex: 1 }}><H4>{b.name}</H4><Sub>{b.shops.length} shop{b.shops.length === 1 ? "" : "s"} · {b.users} user{b.users === 1 ? "" : "s"} · {b.plan}</Sub></View>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
                </Li>
              ))}
              {d.businesses.length < 2 ? <Li last><Sub>Only one business so far. Each keeps its own customers, stock, invoices and reports.</Sub></Li> : null}
            </Card>

            <Card style={{ marginTop: 12, paddingVertical: 4 }}>
              <Li testID="businesses-copy" onPress={() => router.push("/businesses/new")}>
                <Av icon="copy-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>Copy settings to a new business</H4><Sub>Categories, units, conditions of sale</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
              <Li last testID="businesses-access" onPress={() => router.push("/team")}>
                <Av icon="people-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>Who can see which business</H4><Sub>Access is set per business</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
            </Card>
            <Btn label="Add a business" style={{ marginTop: 12 }} testID="businesses-add-btn" onPress={() => router.push("/businesses/new")} />
            <Sub style={{ marginTop: 12 }}>A customer who owes the pharmacy does not show a debt at the provisions shop. Billing sits per business.</Sub>
          </>
        )}
      </ScrollView>
    </View>
  );
}
