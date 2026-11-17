// 05.1 Stock — segmented Items/Transfers/Adjustments, value card, working
// filters (including Archived and Expiring), list or photo grid, and how long
// each item has been sitting.
import { memo, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, H4, IconBtn, Li, Lbl, Loading, Money, Prog, Radio, Row, Seg, Sub, Tag } from "@/src/components/ui";
import { Photo } from "@/src/components/photo";
import { Sheet } from "@/src/components/sheet";
import { PickerField } from "@/src/components/picker";
import { SyncStamp } from "@/src/components/sync";
import { money } from "@/src/format";
import { makeStyles, radius, useTheme } from "@/src/theme";

type Chipk = "all" | "low" | "out" | "services" | "expiring" | "archived";
type Sort = "name" | "value" | "quantity" | "idle";
const SORTS: [Sort, string][] = [["name", "Name A–Z"], ["value", "Highest value"], ["quantity", "Most in stock"], ["idle", "Sitting longest"]];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  deepCard: { backgroundColor: c.deep, borderColor: c.deep, paddingVertical: 10 },
  rowPhoto: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.sqAv },
  tile: { width: "48.6%", borderWidth: 1, borderColor: c.border, borderRadius: 13, padding: 8, backgroundColor: c.surfaceSecondary },
  tilePhoto: { width: "100%", height: 104, borderRadius: 9, backgroundColor: c.sqAv },
  // each row is its own view now (the list only draws what's on screen), so the
  // card it used to sit in is drawn around the first and last rows instead
  rowCard: { backgroundColor: c.surfaceSecondary, borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.border, paddingHorizontal: 12 },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: 4 },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, paddingBottom: 4 },
}));

/** One stock row. Kept separate (and memoised) so scrolling doesn't redraw rows
 *  that haven't changed. */
const StockRow = memo(function StockRow({ it, last, onPress, sub }: { it: any; last: boolean; onPress: () => void; sub: string }) {
  const s = useStyles();
  const isOut = it.track_stock && it.quantity <= 0;
  const isLow = it.track_stock && !isOut && it.quantity <= it.alert_below;
  const pct = it.alert_below ? Math.min(100, (it.quantity / (it.alert_below * 4)) * 100) : it.quantity > 0 ? 82 : 0;
  return (
    <Li testID={`stock-row-${it.id}`} last={last} onPress={onPress}>
      {it.photo_url
        ? <Photo url={it.photo_url} size={40} style={s.rowPhoto} testID={`stock-photo-${it.id}`} />
        : <Av icon={it.kind === "service" ? "construct-outline" : "cube-outline"} tone={isOut ? "coral" : it.kind === "service" ? "blue" : "sq"} />}
      <View style={{ flex: 1 }}>
        <Row between><H4>{it.name}</H4><Money>{money(it.selling_price)}</Money></Row>
        <Row between style={{ marginTop: 2 }}>
          <Sub numberOfLines={1} style={{ flex: 1 }}>{sub}</Sub>
          {it.archived ? <Badge tone="draft">Archived</Badge>
            : it.kind === "service" ? <Badge tone="info">Service</Badge>
            : isOut ? <Badge tone="over">Out of stock</Badge>
            : isLow ? <Badge tone="due">{it.quantity} left</Badge>
            : <Tag>{it.quantity} in stock</Tag>}
        </Row>
        {it.track_stock && !it.archived ? <View style={{ marginTop: 5 }}><Prog pct={isOut ? 2 : pct} tone={isOut ? "bad" : isLow ? "warn" : undefined} /></View> : null}
      </View>
    </Li>
  );
});

export default function Stock() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [seg, setSeg] = useState<"items" | "transfers" | "adjustments">("items");
  const [chip, setChip] = useState<Chipk>("all");
  const [grid, setGrid] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [place, setPlace] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const q = useQuery({ queryKey: ["items"], queryFn: () => api<any[]>("/items") });
  const archivedQ = useQuery({ queryKey: ["items-archived"], queryFn: () => api<any[]>("/items?include_archived=true"), enabled: chip === "archived" });
  const statsQ = useQuery({ queryKey: ["items-stats"], queryFn: () => api<{ stats: Record<string, any> }>("/items-stats") });
  const stats = useMemo(() => statsQ.data?.stats ?? {}, [statsQ.data]);
  const items = useMemo(() => q.data ?? [], [q.data]);
  const { user } = useAuth();
  const valueOk = user?.perms?.see_stock_value !== false;
  const editOk = user?.perms?.edit_stock !== false;
  const value = items.reduce((a, i) => a + (i.track_stock ? i.quantity * i.cost_price : 0), 0);
  const low = items.filter((i) => i.track_stock && i.quantity > 0 && i.quantity <= i.alert_below).length;
  const out = items.filter((i) => i.track_stock && i.quantity <= 0).length;
  const noPhoto = items.filter((i) => !i.photo_url).length;
  const soon = dayjs().add(90, "day");
  const expiring = items.filter((i) => i.expiry && dayjs(i.expiry).isBefore(soon)).length;
  const archived = (archivedQ.data ?? []).filter((i) => i.archived);

  const list = useMemo(() => {
    const base = chip === "archived" ? archived : items.filter((i) =>
      chip === "all" ? true
      : chip === "low" ? i.track_stock && i.quantity > 0 && i.quantity <= i.alert_below
      : chip === "out" ? i.track_stock && i.quantity <= 0
      : chip === "expiring" ? !!i.expiry && dayjs(i.expiry).isBefore(soon)
      : i.kind === "service");
    const filtered = base.filter((i) => (!category || i.category === category) && (!brand || i.brand === brand) && (!place || (i.location || "") === place));
    const idleOf = (it: any) => stats[it.id]?.idle_days ?? -1;
    return [...filtered].sort((a, b) =>
      sort === "value" ? (b.quantity * b.cost_price) - (a.quantity * a.cost_price)
      : sort === "quantity" ? b.quantity - a.quantity
      : sort === "idle" ? idleOf(b) - idleOf(a)
      : String(a.name).localeCompare(String(b.name)));
  }, [items, chip, archived, soon, category, brand, place, sort, stats]);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(), [items]);
  const brands = useMemo(() => Array.from(new Set(items.map((i) => i.brand).filter(Boolean))).sort(), [items]);
  const places = useMemo(() => Array.from(new Set(items.map((i) => i.location).filter(Boolean))).sort(), [items]);
  const extraFilters = (category ? 1 : 0) + (brand ? 1 : 0) + (place ? 1 : 0) + (sort !== "name" ? 1 : 0);

  const sub = (it: any) => {
    const idle = stats[it.id]?.idle_days;
    const bits = [it.brand, it.kind === "service" ? "Service · not tracked" : `${it.location || it.category}`];
    if (idle !== undefined && idle !== null && idle > 30) bits.push(`sitting ${idle}d`);
    return bits.filter(Boolean).join(" · ");
  };

  const showList = seg === "items" && !(q.isLoading || (chip === "archived" && archivedQ.isLoading)) && !(q.isError && !q.data) && list.length > 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="stock-screen">
      <AppBar title="Stock" right={<>
        <IconBtn name="search-outline" testID="stock-search" onPress={() => router.push("/search")} />
        <IconBtn name="pricetag-outline" testID="stock-price-check" onPress={() => router.push("/stock/price-check")} />
        <IconBtn name="options-outline" dot={extraFilters > 0} testID="stock-filter" onPress={() => setSheet(true)} />
        {editOk ? <IconBtn name="layers-outline" testID="stock-bulk-add" onPress={() => router.push("/stock/bulk")} /> : null}
        {editOk ? <IconBtn name="images-outline" testID="stock-photos" onPress={() => router.push("/stock/photos")} /> : null}
        <IconBtn dark name={grid ? "list-outline" : "grid-outline"} testID="stock-grid-view" onPress={() => setGrid(!grid)} />
      </>} />
      <View style={{ paddingHorizontal: 14 }}>
        <Seg testID="stock-seg" value={seg} onChange={setSeg} options={[{ key: "items", label: "Items" }, { key: "transfers", label: "Transfers" }, { key: "adjustments", label: "Adjustments" }]} />
      </View>
      <FlatList
        key={grid ? "grid" : "rows"}
        data={showList ? list : []}
        keyExtractor={(it) => it.id}
        numColumns={grid ? 2 : 1}
        columnWrapperStyle={grid ? { justifyContent: "space-between", marginBottom: 8 } : undefined}
        // draw a screenful at a time; photos further down load as they come into view
        initialNumToRender={grid ? 8 : 14}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 9, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
        renderItem={({ item: it, index: i }) => grid ? (
          <Pressable testID={`stock-tile-${it.id}`} onPress={() => router.push(`/stock/${it.id}`)} style={({ pressed }) => [s.tile, pressed && { opacity: 0.8 }]}>
            {it.photo_url ? <Photo url={it.photo_url} size={170} style={s.tilePhoto} /> : <View style={s.tilePhoto} />}
            <H4 style={{ marginTop: 7 }} numberOfLines={1}>{it.name}</H4>
            <Row between style={{ marginTop: 2 }}>
              <Money size={12.5}>{money(it.selling_price)}</Money>
              <Tag>{it.track_stock ? `${it.quantity} left` : "service"}</Tag>
            </Row>
          </Pressable>
        ) : (
          <View style={[s.rowCard, i === 0 && s.rowFirst, i === list.length - 1 && s.rowLast]}>
            <StockRow it={it} last={i === list.length - 1} onPress={() => router.push(`/stock/${it.id}`)} sub={sub(it)} />
          </View>
        )}
        ListHeaderComponent={<>
        <SyncStamp at={q.dataUpdatedAt} busy={q.isFetching} onRefresh={() => { q.refetch(); statsQ.refetch(); }} testID="stock-sync" />
        <Card style={s.deepCard} testID="stock-value-card">
          <Row between>
            <View><Lbl style={{ color: colors.onDeepMuted }}>{valueOk ? "Stock value at cost" : "Stock in view"}</Lbl>{valueOk ? <Money tone="white" size={17}>{money(value)}</Money> : <Money tone="white" size={17}>{`${low + out} need reordering`}</Money>}</View>
            <View style={{ alignItems: "flex-end" }}><Lbl style={{ color: colors.onDeepMuted }}>Items</Lbl><Money tone="green">{items.length}</Money></View>
          </Row>
        </Card>
        {seg === "items" ? (
          <>
            {low + out > 0 ? (
              <Card style={{ marginTop: 9, flexDirection: "row", alignItems: "center", gap: 10 }} testID="stock-low-nudge">
                <Av icon="alert-circle-outline" tone={out ? "coral" : "mint"} />
                <View style={{ flex: 1 }}>
                  <H4>{low + out} item{low + out === 1 ? "" : "s"} need reordering</H4>
                  <Sub>{out ? `${out} finished · ` : ""}{low} running low — see how much to buy.</Sub>
                </View>
                <Btn small label="Reorder list" testID="stock-low-cta" onPress={() => router.push("/stock/low")} />
              </Card>
            ) : null}
            {noPhoto && editOk ? (
              <Card style={{ marginTop: 9, flexDirection: "row", alignItems: "center", gap: 10 }} testID="stock-photos-nudge">
                <Av icon="images-outline" tone="mint" />
                <View style={{ flex: 1 }}><H4>{noPhoto} items have no photo</H4><Sub>Add them in one go — photos print on invoices.</Sub></View>
                <Btn small label="Add photos" testID="stock-photos-cta" onPress={() => router.push("/stock/photos")} />
              </Card>
            ) : null}
            <View style={{ height: 44, marginTop: 5 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
                <Chip testID="stock-chip-all" label={`All ${items.length}`} on={chip === "all"} onPress={() => setChip("all")} />
                <Chip testID="stock-chip-low" label={`Low ${low}`} dotColor={colors.amber} on={chip === "low"} onPress={() => setChip("low")} />
                <Chip testID="stock-chip-out" label={`Out ${out}`} dotColor={colors.coral} on={chip === "out"} onPress={() => setChip("out")} />
                <Chip testID="stock-chip-services" label="Services" on={chip === "services"} onPress={() => setChip("services")} />
                <Chip testID="stock-chip-expiring" label={`Expiring ${expiring}`} on={chip === "expiring"} onPress={() => setChip("expiring")} />
                <Chip testID="stock-chip-archived" label="Archived" on={chip === "archived"} onPress={() => setChip("archived")} />
              </ScrollView>
            </View>
            {chip === "archived" ? (
              <Card style={{ marginBottom: 9, paddingVertical: 9, backgroundColor: colors.faint }}>
                <Sub>Archived items stay on every invoice and report they appear on. Open one to put it back in your catalogue.</Sub>
              </Card>
            ) : null}
            {extraFilters > 0 ? (
              <Row style={{ gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
                {category ? <Chip label={category} on onPress={() => setCategory("")} testID="stock-clear-category" /> : null}
                {brand ? <Chip label={brand} on onPress={() => setBrand("")} testID="stock-clear-brand" /> : null}
                {place ? <Chip label={place} on onPress={() => setPlace("")} testID="stock-clear-location" /> : null}
                {sort !== "name" ? <Chip label={SORTS.find(([k]) => k === sort)?.[1] ?? ""} on onPress={() => setSort("name")} testID="stock-clear-sort" /> : null}
              </Row>
            ) : null}
            {q.isLoading || (chip === "archived" && archivedQ.isLoading) ? <Loading /> : q.isError && !q.data ? (
              <Card><Empty icon="cloud-offline-outline" title="Couldn't load stock" sub="Check your connection and try again."
                action={<Btn label="Try again" testID="stock-retry" onPress={() => q.refetch()} />} /></Card>
            ) : list.length === 0 ? (
              <Card><Empty icon="cube-outline" title={chip === "all" ? "Nothing in stock yet" : "Nothing matches this filter"}
                sub={chip === "all" ? "Add your first item to start tracking." : "Try another chip above."}
                action={chip === "all" && editOk ? <Btn label="Add item" testID="stock-empty-add" onPress={() => router.push("/stock/new")} /> : undefined} /></Card>
            ) : null}
          </>
        ) : null}
        </>}
        ListFooterComponent={seg !== "items" ? (
          <Card style={{ marginTop: 9 }}>
            {seg === "transfers" ? (
              <Empty icon="swap-horizontal-outline" title="Move stock between shops" sub="Create a transfer, have it approved, then received — with a reason for any shortfall."
                action={<Btn label="Open transfers" testID="stock-open-transfers" onPress={() => router.push("/transfers")} />} />
            ) : (
              <Empty icon="time-outline" title="Adjustments live on each item" sub="Open an item and tap Adjust stock. Every change is logged with a reason." />
            )}
          </Card>
        ) : null}
      />

      <Sheet visible={sheet} onClose={() => setSheet(false)} testID="stock-filter-sheet">
        <Row between>
          <H4>Filter stock</H4>
          <Sub style={{ color: colors.green700 }} onPress={() => { setCategory(""); setBrand(""); setPlace(""); setSort("name"); setChip("all"); }}>Reset</Sub>
        </Row>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Status</Lbl>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {([["all", "All"], ["low", "Low"], ["out", "Out of stock"], ["services", "Services"], ["expiring", "Expiring"], ["archived", "Archived"]] as [Chipk, string][])
            .map(([k, label]) => <Chip key={k} label={label} on={chip === k} onPress={() => setChip(k)} testID={`stock-filter-chip-${k}`} />)}
        </View>
        <PickerField label="Category" value={category} options={[{ key: "", label: "Every category" }].concat(categories.map((c) => ({ key: c, label: c })))}
          onPick={setCategory} searchable title="Which category?" style={{ marginTop: 12 }} testID="stock-filter-category" />
        <PickerField label="Brand" value={brand} options={[{ key: "", label: "Every brand" }].concat(brands.map((b) => ({ key: b, label: b })))}
          onPick={setBrand} searchable title="Which brand?" style={{ marginTop: 10 }} testID="stock-filter-brand" />
        <PickerField label="Location" value={place} options={[{ key: "", label: "Every location" }].concat(places.map((p) => ({ key: p, label: p })))}
          onPick={setPlace} searchable title="Where is it kept?" style={{ marginTop: 10 }} testID="stock-filter-location" />
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Sort by</Lbl>
        {SORTS.map(([k, label], i) => (
          <Li key={k} testID={`stock-sort-${k}`} onPress={() => setSort(k)} last={i === SORTS.length - 1}>
            <H4 style={{ flex: 1 }}>{label}</H4><Radio on={sort === k} />
          </Li>
        ))}
        <Btn label={`Show ${list.length} item${list.length === 1 ? "" : "s"}`} style={{ marginTop: 12 }} testID="stock-filter-apply" onPress={() => setSheet(false)} />
      </Sheet>
    </View>
  );
}
