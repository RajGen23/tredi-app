// 01.5 Activity — shop · person above every action, the time below it.
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "@/src/api";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppBar, Av, Card, Chip, Empty, H4, IonName, Li, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const ICON: Record<string, IonName> = {
  invoice: "receipt-outline", sale: "flash-outline", payment: "arrow-down-outline", payment_out: "arrow-up-outline",
  stock: "cube-outline", discount: "pricetag-outline", transfer: "swap-horizontal-outline", purchase: "cart-outline",
  quote: "document-text-outline", user: "person-outline", role: "shield-checkmark-outline", supplier: "business-outline",
  waybill: "car-outline", reminder: "chatbubble-ellipses-outline", import: "cloud-upload-outline", backup: "cloud-done-outline",
  return: "return-down-back-outline",
};

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Activity() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [shop, setShop] = useState("");
  const [who, setWho] = useState("");
  const [kind, setKind] = useState("");
  const q = useQuery({ queryKey: ["activity", shop, who, kind], queryFn: () => api(`/activity?shop=${encodeURIComponent(shop)}&who=${encodeURIComponent(who)}&kind=${kind}`) });
  const d = q.data;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="activity-screen">
      <AppBar title="Activity" back />
      <View style={{ height: 42 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          <Chip label={shop ? shop : "All shops"} on={!!shop} testID="activity-shop" onPress={() => {
            const list = d?.shops ?? [];
            const idx = list.indexOf(shop);
            setShop(idx + 1 >= list.length ? "" : list[idx + 1]);
          }} />
          <Chip label={who ? who : "Everyone"} on={!!who} testID="activity-who" onPress={() => {
            const list = d?.people ?? [];
            const idx = list.indexOf(who);
            setWho(idx + 1 >= list.length ? "" : list[idx + 1]);
          }} />
          {(d?.kinds ?? []).map((k: string) => (
            <Chip key={k} label={k[0].toUpperCase() + k.slice(1)} on={kind === k} onPress={() => setKind(kind === k ? "" : k)} testID={`activity-kind-${k}`} />
          ))}
        </ScrollView>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {!d ? <Loading /> : d.rows.length === 0 ? (
          <Card><Empty icon="pulse-outline" title="Nothing recorded yet" sub="Every sale, discount and stock change lands here with who did it." /></Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {d.rows.map((r: any, i: number) => (
              <Li key={r.id} last={i === d.rows.length - 1} testID={`activity-${r.id}`}
                onPress={r.route ? () => router.push(r.route as any) : undefined}
                style={{ alignItems: "flex-start" }}>
                <Av icon={ICON[r.kind] ?? "ellipse-outline"} tone="sq" />
                <View style={{ flex: 1 }}>
                  <Tag>{(r.shop || "Head office")} · {r.by || "—"}</Tag>
                  <Row between><H4 style={{ flex: 1 }}>{r.title}</H4>{r.amount ? <Money tone={r.amount < 0 ? "neg" : undefined}>{money(r.amount)}</Money> : null}</Row>
                  <Sub>{dayjs(r.created_at).format("DD/MM/YYYY, HH:mm")}{r.reason ? ` · ${r.reason}` : r.sub ? ` · ${r.sub}` : ""}</Sub>
                </View>
                {r.route ? <Ionicons name="chevron-forward" size={15} color={colors.ink40} style={{ marginTop: 10 }} /> : null}
              </Li>
            ))}
          </Card>
        )}
        <Sub style={{ marginTop: 12 }}>Tap any line to open the invoice, sale, payment or item it happened to.</Sub>
      </ScrollView>
    </View>
  );
}
