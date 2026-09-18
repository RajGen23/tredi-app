// 04.17 Quick sale + 04.18 Sale saved.
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, H4, IconBtn, Li, Lbl, Loading, Money, Row, Sub } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { money, parseNum } from "@/src/format";
import { photoSource } from "@/src/uploads";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Method = "cash" | "transfer" | "card" | "credit";
const TILE_COLORS = ["#CBE0D8", "#DCD1BD", "#D0D9D7", "#D9D0DD", "#D6DED0", "#E2D6CC"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 11, paddingHorizontal: 11, minHeight: 42 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: c.onSurface, paddingVertical: 8 },
  tile: { width: "31.5%", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 14, overflow: "hidden" },
  tileOn: { borderColor: c.brandPrimary },
  tileImg: { width: "100%", height: 48, backgroundColor: c.surfaceTertiary },
  tileName: { fontFamily: fonts.bold, fontSize: 11, color: c.onSurface },
  tilePrice: { fontFamily: fonts.monoSemibold, fontSize: 10.5, color: c.onSurface },
  count: { position: "absolute", top: 6, right: 6, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  countText: { fontFamily: fonts.bold, fontSize: 11, color: c.onSurfaceInverse },
  footer: { paddingTop: 9, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surfaceSecondary },
  bigInput: { fontFamily: fonts.monoSemibold, fontSize: 28, color: c.onSurface, textAlign: "center", paddingVertical: 4 },
  amber: { backgroundColor: c.warning, borderColor: "#F3E2BE", paddingVertical: 9 },
}));

/** The item's own photo fills the tile; a shop that has not added one yet keeps
 *  the pastel block so the grid never looks broken. */
function TileImage({ url, fallback, style }: { url?: string; fallback: string; style: any }) {
  const [src, setSrc] = useState<any>(null);
  useEffect(() => {
    if (!url) return setSrc(null);
    let live = true;
    photoSource(url).then((s) => live && setSrc(s));
    return () => { live = false; };
  }, [url]);
  return src
    ? <Image source={src} style={style} resizeMode="cover" />
    : <View style={[style, { backgroundColor: fallback }]} />;
}

export default function QuickSale() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const itemsQ = useQuery({ queryKey: ["items"], queryFn: () => api<any[]>("/items") });
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("Popular");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<Method>("cash");
  const [tender, setTender] = useState(false);
  const [tendered, setTendered] = useState("");
  const [saved, setSaved] = useState<any | null>(null);

  const items = itemsQ.data ?? [];
  const cats = useMemo(() => ["Popular", ...Array.from(new Set(items.map((i) => i.category)))], [items]);
  const grid = items.filter((i) => (cat === "Popular" || i.category === cat) && i.name.toLowerCase().includes(search.toLowerCase()));
  const lines = Object.entries(cart).map(([id, q]) => ({ item: items.find((i) => i.id === id)!, q })).filter((l) => l.item);
  const total = lines.reduce((a, l) => a + l.item.selling_price * l.q, 0);
  const change = Math.max(0, parseNum(tendered) - total);

  const m = useMutation({
    mutationFn: () => api("/sales", { method: "POST", json: { lines: lines.map((l) => ({ item_id: l.item.id, name: l.item.name, quantity: l.q, unit_price: l.item.selling_price, unit: l.item.unit })), method, tendered: method === "cash" ? parseNum(tendered) || total : total } }),
    onSuccess: (sale) => { ["items", "dashboard", "accounts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); setTender(false); setSaved(sale); },
    onError: (e: Error) => toast.show(e.message),
  });

  const reset = () => { setCart({}); setTendered(""); setSaved(null); setMethod("cash"); };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="quick-sale-screen">
      <AppBar title="Quick sale" close right={<IconBtn name="barcode-outline" testID="quick-sale-scan" />} />
      <View style={{ paddingHorizontal: 14 }}>
        <View style={s.search}><Ionicons name="search-outline" size={16} color={colors.ink60} /><TextInput testID="quick-sale-search" value={search} onChangeText={setSearch} placeholder="Search or scan" placeholderTextColor={colors.ink40} style={s.input} /></View>
      </View>
      <View style={{ height: 44, marginTop: 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {cats.map((c) => <Chip key={c} label={c} on={cat === c} onPress={() => setCat(c)} testID={`quick-sale-cat-${c}`} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        {itemsQ.isLoading ? <Loading /> : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {grid.map((it, i) => (
              <Pressable key={it.id} testID={`quick-sale-tile-${it.id}`} onPress={() => setCart((c) => ({ ...c, [it.id]: (c[it.id] ?? 0) + 1 }))} style={({ pressed }) => [s.tile, cart[it.id] ? s.tileOn : null, pressed && { opacity: 0.8 }]}>
                <TileImage url={it.photo_url} fallback={TILE_COLORS[i % TILE_COLORS.length]} style={s.tileImg} />
                <View style={{ padding: 7 }}><Text style={s.tileName} numberOfLines={1}>{it.name}</Text><Text style={s.tilePrice}>{money(it.selling_price, { symbol: false })}</Text></View>
                {cart[it.id] ? <View style={s.count}><Text style={s.countText}>{cart[it.id]}</Text></View> : null}
              </Pressable>
            ))}
            <Pressable testID="quick-sale-add-item" onPress={() => router.push("/stock/new")} style={[s.tile, { borderStyle: "dashed", alignItems: "center", justifyContent: "center", minHeight: 84 }]}><Ionicons name="add" size={20} color={colors.ink40} /></Pressable>
          </View>
        )}
        {lines.length ? (
          <Card style={{ marginTop: 9, paddingVertical: 4 }} testID="quick-sale-cart">
            {lines.map((l, i) => (
              <Li key={l.item.id} last={i === lines.length - 1} style={{ paddingVertical: 7 }}>
                <Pressable onPress={() => setCart((c) => { const n = { ...c }; if (n[l.item.id] > 1) n[l.item.id] -= 1; else delete n[l.item.id]; return n; })} testID={`quick-sale-cart-minus-${l.item.id}`} hitSlop={6}><Ionicons name="remove-circle-outline" size={18} color={colors.ink40} /></Pressable>
                <H4 style={{ flex: 1, fontSize: 12.5 }}>{l.item.name} × {l.q}</H4>
                <Money size={12}>{money(l.item.selling_price * l.q, { symbol: false })}</Money>
              </Li>
            ))}
          </Card>
        ) : null}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Row between style={{ marginBottom: 7 }}><H4>Total</H4><Money size={17} testID="quick-sale-total">{money(total)}</Money></Row>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          {(["cash", "transfer", "card", "credit"] as Method[]).map((k) => <Chip key={k} label={k === "credit" ? "On credit" : k[0].toUpperCase() + k.slice(1)} on={method === k} onPress={() => setMethod(k)} testID={`quick-sale-method-${k}`} />)}
        </View>
        <Btn label="Take payment" disabled={!lines.length} onPress={() => (method === "cash" ? setTender(true) : m.mutate())} loading={m.isPending && !tender} testID="quick-sale-take-payment" />
      </View>

      <Sheet visible={tender} onClose={() => setTender(false)} testID="tender-sheet">
        <H4>Cash received</H4>
        <Sub style={{ marginTop: 3 }}>Total <Money size={12}>{money(total)}</Money></Sub>
        <View style={{ marginTop: 10, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: 11, padding: 12 }}>
          <Lbl style={{ textAlign: "center" }}>Amount tendered</Lbl>
          <TextInput testID="tender-input" value={tendered} onChangeText={setTendered} keyboardType="decimal-pad" placeholder={money(total)} placeholderTextColor={colors.ink40} style={s.bigInput} autoFocus />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 }}>
          {[total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000].filter((v, i, a) => a.indexOf(v) === i).map((v) => <Chip key={v} label={v === total ? "Exact" : money(v)} on={parseNum(tendered) === v} onPress={() => setTendered(String(v))} testID={`tender-preset-${v}`} />)}
        </View>
        <Row between style={{ marginTop: 12 }}><H4>Change to give</H4><Money tone="pos" size={16} testID="tender-change">{money(change)}</Money></Row>
        <Btn label={`Save sale — ${money(total)}`} onPress={() => m.mutate()} loading={m.isPending} style={{ marginTop: 12 }} testID="tender-save" />
      </Sheet>

      <Sheet visible={!!saved} onClose={reset} testID="sale-saved-sheet">
        {saved ? (
          <>
            <View style={{ alignItems: "center", paddingTop: 6 }}>
              <Av icon="checkmark" tone="green" size={52} radiusOverride={18} />
              <Money size={24} style={{ marginTop: 11 }} testID="sale-saved-total">{money(saved.totals.total)}</Money>
              <Badge tone="paid" style={{ marginTop: 5 }}>{saved.method === "credit" ? "On credit" : `Paid · ${saved.method}`}</Badge>
            </View>
            <Card style={{ marginTop: 12, paddingVertical: 4 }}>
              {saved.method === "cash" ? <Li><Sub style={{ flex: 1 }}>Cash received</Sub><Money>{money(saved.tendered)}</Money></Li> : null}
              {saved.method === "cash" ? <Li><H4 style={{ flex: 1 }}>Change to give</H4><Money tone="pos" size={14} testID="sale-saved-change">{money(saved.change)}</Money></Li> : null}
              <Li last><Sub style={{ flex: 1 }}>Sale no.</Sub><Money size={11}>{saved.number}</Money></Li>
            </Card>
            <Card style={[s.amber, { marginTop: 9, flexDirection: "row", alignItems: "center", gap: 8 }]}><Sub style={{ flex: 1 }}>Saved and synced to your book</Sub><Badge tone="paid">Synced</Badge></Card>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 11 }}>
              <Btn small variant="ghost" label="Print receipt" style={{ flex: 1 }} onPress={() => toast.show("Receipt printing arrives with the Documents pass")} testID="sale-saved-print" />
              <Btn small label="New sale" style={{ flex: 1 }} onPress={reset} testID="sale-saved-new" />
            </View>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
