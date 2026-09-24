// Low stock — today's reorder list. What is finished, what is nearly finished,
// how fast each one sells and how much to buy to cover the next month.
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, H4, IconBtn, Li, Lbl, Loading, Money, Prog, Row, Sub, Tag } from "@/src/components/ui";
import { Photo } from "@/src/components/photo";
import { SyncStamp } from "@/src/components/sync";
import { money } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { makeStyles, useTheme } from "@/src/theme";

type Filter = "all" | "out" | "low";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  deepCard: { backgroundColor: c.deep, borderColor: c.deep, paddingVertical: 11 },
  photo: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.sqAv },
  footer: { paddingTop: 10, paddingHorizontal: 14, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
}));

/** How urgent this line is, in the trader's words. */
function cover(r: any): string {
  if (r.status === "out") return "Finished — none left";
  if (r.days_left === null || r.days_left === undefined) return "Below your alert level";
  if (r.days_left <= 1) return "About a day left";
  return `About ${Math.round(r.days_left)} days left`;
}

export default function LowStock() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const q = useQuery({ queryKey: ["low-stock"], queryFn: () => api<any>("/low-stock") });
  const d = q.data;
  const rows: any[] = d?.items ?? [];

  const list = useMemo(() => rows.filter((r) => (filter === "all" ? true : r.status === filter)), [rows, filter]);
  const orderCost = list.reduce((a, r) => a + r.reorder_cost, 0);

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="low-stock-screen">
      <AppBar back title="Low stock" onBack={() => router.back()}
        right={<IconBtn name="refresh-outline" testID="low-stock-refresh" onPress={() => q.refetch()} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        <SyncStamp at={q.dataUpdatedAt} busy={q.isFetching} onRefresh={() => q.refetch()} testID="low-stock-sync" />
        <Card style={s.deepCard} testID="low-stock-summary">
          <Row between>
            <View>
              <Lbl style={{ color: colors.onDeepMuted }}>{dayjs(d?.as_of).format("ddd D MMM")}{d?.shop ? ` · ${d.shop}` : ""}</Lbl>
              <Money tone="white" size={17} testID="low-stock-count">{d ? `${d.count} item${d.count === 1 ? "" : "s"}` : "—"}</Money>
              <Sub style={{ color: colors.onDeepSoft, marginTop: 2 }}>need reordering</Sub>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Lbl style={{ color: colors.onDeepMuted }}>Finished</Lbl>
              <Money tone="green" size={15} testID="low-stock-out">{d?.out ?? 0}</Money>
              <Sub style={{ color: colors.onDeepSoft, marginTop: 2 }}>at cost {money(d?.reorder_cost ?? 0)}</Sub>
            </View>
          </Row>
        </Card>

        <Row style={{ gap: 6, marginTop: 10, marginBottom: 9 }}>
          <Chip label={`All ${d?.count ?? 0}`} on={filter === "all"} onPress={() => setFilter("all")} testID="low-stock-chip-all" />
          <Chip label={`Finished ${d?.out ?? 0}`} dotColor={colors.coral} on={filter === "out"} onPress={() => setFilter("out")} testID="low-stock-chip-out" />
          <Chip label={`Running low ${d?.low ?? 0}`} dotColor={colors.amber} on={filter === "low"} onPress={() => setFilter("low")} testID="low-stock-chip-low" />
        </Row>

        {q.isLoading ? <Loading /> : list.length === 0 ? (
          <Card><Empty icon="checkmark-circle-outline" title={filter === "all" ? "Nothing is running out" : "Nothing in this group"}
            sub={filter === "all" ? "Every tracked item is above its alert level. Set an alert level on an item to be told earlier." : "Try another chip above."} /></Card>
        ) : (
          <Card style={{ paddingVertical: 4 }} testID="low-stock-list">
            {list.map((r, i) => (
              <Li key={r.id} last={i === list.length - 1} testID={`low-stock-row-${r.id}`} onPress={() => router.push(`/stock/${r.id}`)}>
                {r.photo_url ? <Photo url={r.photo_url} style={s.photo} /> : <Av icon="cube-outline" tone={r.status === "out" ? "coral" : "sq"} />}
                <View style={{ flex: 1 }}>
                  <Row between>
                    <H4 style={{ flex: 1 }} numberOfLines={1}>{r.name}</H4>
                    {r.status === "out" ? <Badge tone="over">Out of stock</Badge> : <Badge tone="due">{r.quantity} left</Badge>}
                  </Row>
                  <Sub numberOfLines={1} style={{ marginTop: 2 }}>
                    {cover(r)}{r.per_day > 0 ? ` · sells ${r.per_day.toFixed(r.per_day < 1 ? 2 : 1)}/day` : " · no sales in 30 days"}
                  </Sub>
                  <View style={{ marginTop: 5 }}>
                    <Prog pct={r.alert_below ? Math.max(2, Math.min(100, (r.quantity / r.alert_below) * 100)) : 2} tone={r.status === "out" ? "bad" : "warn"} />
                  </View>
                  <Row between style={{ marginTop: 5 }}>
                    <Tag numberOfLines={1} style={{ flex: 1 }}>{r.supplier || "No supplier on file"}{r.location ? ` · ${r.location}` : ""}</Tag>
                    <Money size={11.5} testID={`low-stock-suggest-${r.id}`}>order {r.suggest} {r.unit}</Money>
                  </Row>
                </View>
              </Li>
            ))}
          </Card>
        )}
        {list.length ? (
          <Card style={{ marginTop: 9, paddingVertical: 10 }} testID="low-stock-order-total">
            <Row between><Sub>Buying everything on this list costs about</Sub><Money size={14}>{money(orderCost)}</Money></Row>
            <Tag style={{ marginTop: 4, lineHeight: 15 }}>Worked out at your own cost prices, enough to cover the next 30 days at the rate each item has been selling.</Tag>
          </Card>
        ) : null}
      </ScrollView>
      {list.length ? (
        <View style={[s.footer, { paddingBottom: pad }]}>
          <Btn label="Record a purchase" icon="cart-outline" testID="low-stock-record-purchase" onPress={() => router.push("/purchases/new")} />
        </View>
      ) : null}
    </View>
  );
}
