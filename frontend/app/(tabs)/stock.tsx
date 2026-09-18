// 05.1 Stock — segmented Items/Transfers/Adjustments, value card, chips, rows with stock bars.
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, H4, IconBtn, Li, Lbl, Loading, Money, Prog, Row, Seg, Sub, Tag } from "@/src/components/ui";
import { Photo } from "@/src/components/photo";
import { money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Chipk = "all" | "low" | "out" | "services";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  deepCard: { backgroundColor: c.deep, borderColor: c.deep, paddingVertical: 10 },
  rowPhoto: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.sqAv },
}));

export default function Stock() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [seg, setSeg] = useState<"items" | "transfers" | "adjustments">("items");
  const [chip, setChip] = useState<Chipk>("all");
  const q = useQuery({ queryKey: ["items"], queryFn: () => api<any[]>("/items") });
  const items = q.data ?? [];
  const value = items.reduce((a, i) => a + (i.track_stock ? i.quantity * i.cost_price : 0), 0);
  const low = items.filter((i) => i.track_stock && i.quantity > 0 && i.quantity <= i.alert_below).length;
  const out = items.filter((i) => i.track_stock && i.quantity <= 0).length;
  const noPhoto = items.filter((i) => !i.photo_url).length;
  const list = useMemo(() => items.filter((i) => chip === "all" || (chip === "low" ? i.track_stock && i.quantity > 0 && i.quantity <= i.alert_below : chip === "out" ? i.track_stock && i.quantity <= 0 : i.kind === "service")), [items, chip]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="stock-screen">
      <AppBar title="Stock" right={<><IconBtn name="search-outline" testID="stock-search" /><IconBtn name="images-outline" testID="stock-photos" onPress={() => router.push("/stock/photos")} /><IconBtn dark name="grid-outline" testID="stock-grid-view" /></>} />
      <View style={{ paddingHorizontal: 14 }}>
        <Seg testID="stock-seg" value={seg} onChange={setSeg} options={[{ key: "items", label: "Items" }, { key: "transfers", label: "Transfers" }, { key: "adjustments", label: "Adjustments" }]} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 9, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        <Card style={s.deepCard} testID="stock-value-card">
          <Row between>
            <View><Lbl style={{ color: colors.onDeepMuted }}>Stock value at cost</Lbl><Money tone="white" size={17}>{money(value)}</Money></View>
            <View style={{ alignItems: "flex-end" }}><Lbl style={{ color: colors.onDeepMuted }}>Items</Lbl><Money tone="green">{items.length}</Money></View>
          </Row>
        </Card>
        {seg === "items" ? (
          <>
            {noPhoto ? (
              <Card style={{ marginTop: 9, flexDirection: "row", alignItems: "center", gap: 10 }} testID="stock-photos-nudge">
                <Av icon="images-outline" tone="mint" />
                <View style={{ flex: 1 }}><H4>{noPhoto} items have no photo</H4><Sub>Add them in one go — photos print on invoices.</Sub></View>
                <Btn small label="Add photos" testID="stock-photos-cta" onPress={() => router.push("/stock/photos")} />
              </Card>
            ) : null}
            <View style={{ height: 44, marginTop: 5 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
                <Chip testID="stock-chip-all" label="All" on={chip === "all"} onPress={() => setChip("all")} />
                <Chip testID="stock-chip-low" label={`Low ${low}`} dotColor={colors.amber} on={chip === "low"} onPress={() => setChip("low")} />
                <Chip testID="stock-chip-out" label={`Out ${out}`} dotColor={colors.coral} on={chip === "out"} onPress={() => setChip("out")} />
                <Chip testID="stock-chip-services" label="Services" on={chip === "services"} onPress={() => setChip("services")} />
                <Chip label="Expiring" />
              </ScrollView>
            </View>
            {q.isLoading ? <Loading /> : list.length === 0 ? (
              <Card><Empty icon="cube-outline" title="Nothing in stock yet" sub="Add your first item to start tracking." action={<Btn label="Add item" testID="stock-empty-add" onPress={() => router.push("/stock/new")} />} /></Card>
            ) : (
              <Card style={{ paddingVertical: 4 }}>
                {list.map((it, i) => {
                  const isOut = it.track_stock && it.quantity <= 0;
                  const isLow = it.track_stock && !isOut && it.quantity <= it.alert_below;
                  const pct = it.alert_below ? Math.min(100, (it.quantity / (it.alert_below * 4)) * 100) : it.quantity > 0 ? 82 : 0;
                  return (
                    <Li key={it.id} testID={`stock-row-${it.id}`} last={i === list.length - 1} onPress={() => router.push(`/stock/${it.id}`)}>
                      {it.photo_url
                        ? <Photo url={it.photo_url} style={s.rowPhoto} testID={`stock-photo-${it.id}`} />
                        : <Av icon={it.kind === "service" ? "construct-outline" : "cube-outline"} tone={isOut ? "coral" : it.kind === "service" ? "blue" : "sq"} />}
                      <View style={{ flex: 1 }}>
                        <Row between><H4>{it.name}</H4><Money>{money(it.selling_price)}</Money></Row>
                        <Row between style={{ marginTop: 2 }}>
                          <Sub>{it.kind === "service" ? "Service · not tracked" : `${it.location || it.category} · ${it.unit.toLowerCase()}s`}</Sub>
                          {it.kind === "service" ? <Badge tone="info">Service</Badge> : isOut ? <Badge tone="over">Out of stock</Badge> : isLow ? <Badge tone="due">{it.quantity} left</Badge> : <Tag>{it.quantity} in stock</Tag>}
                        </Row>
                        {it.track_stock ? <View style={{ marginTop: 5 }}><Prog pct={isOut ? 2 : pct} tone={isOut ? "bad" : isLow ? "warn" : undefined} /></View> : null}
                      </View>
                    </Li>
                  );
                })}
              </Card>
            )}
          </>
        ) : (
          <Card style={{ marginTop: 9 }}>
            <Empty icon={seg === "transfers" ? "swap-horizontal-outline" : "time-outline"} title={seg === "transfers" ? "No transfers between shops" : "Adjustments live on each item"} sub={seg === "transfers" ? "Coming in the next pass — move stock between branches with approval." : "Open an item and tap Adjust stock. Every change is logged with a reason."} />
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
