// 04.17 Quick sale + 04.18 Sale saved.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, H4, IconBtn, Li, Lbl, Loading, Money, Row, Sub } from "@/src/components/ui";
import { PickerField } from "@/src/components/picker";
import { Photo } from "@/src/components/photo";
import { Scanner } from "@/src/components/scanner";
import { Sheet, useToast } from "@/src/components/sheet";
import { money, parseNum } from "@/src/format";
import { buildReceiptHtml, DEFAULT_BRAND } from "@/src/invoice-templates";
import { useAccounts } from "@/src/lookups";
import { pdfName, printHtml, sharePdf } from "@/src/pdf";
import { photoDataUri } from "@/src/uploads";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Method = "cash" | "transfer" | "card" | "credit";
const TILE_COLORS = ["#CBE0D8", "#DCD1BD", "#D0D9D7", "#D9D0DD", "#D6DED0", "#E2D6CC"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 11, paddingHorizontal: 11, minHeight: 42 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: c.onSurface, paddingVertical: 8 },
  tile: { width: "48.5%", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 14, overflow: "hidden" },
  tileOn: { borderColor: c.brandPrimary, borderWidth: 2 },
  tileImg: { width: "100%", height: 118, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  tileName: { fontFamily: fonts.bold, fontSize: 13, color: c.onSurface },
  tilePrice: { fontFamily: fonts.monoSemibold, fontSize: 13, color: c.onSurface, marginTop: 2 },
  count: { position: "absolute", top: 8, right: 8, minWidth: 24, height: 24, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  countText: { fontFamily: fonts.bold, fontSize: 12.5, color: c.onSurfaceInverse },
  footer: { paddingTop: 9, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surfaceSecondary },
  bigInput: { fontFamily: fonts.monoSemibold, fontSize: 28, color: c.onSurface, textAlign: "center", paddingVertical: 4 },
  qty: { width: 54, minHeight: 34, borderWidth: 1, borderColor: c.border, borderRadius: 9, textAlign: "center", fontFamily: fonts.monoSemibold, fontSize: 13, color: c.onSurface, paddingVertical: 4 },
  amber: { backgroundColor: c.warning, borderColor: "#F3E2BE", paddingVertical: 9 },
}));

/** The item's own photo fills the tile; a shop that has not added one yet keeps
 *  the pastel block so the grid never looks broken. */
export default function QuickSale() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const itemsQ = useQuery({ queryKey: ["items"], queryFn: () => api<any[]>("/items") });
  const settings = useQuery({ queryKey: ["invoice-settings"], queryFn: () => api("/settings/invoice") });
  const { accounts, options: accountOptions } = useAccounts();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("Popular");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<Method>("cash");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [tender, setTender] = useState(false);
  const [tendered, setTendered] = useState("");
  const [saved, setSaved] = useState<any | null>(null);
  const [scan, setScan] = useState(false);
  const [unknown, setUnknown] = useState("");

  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const account = accounts.find((a: any) => a.id === accountId) ?? accounts.find((a: any) => (method === "cash" ? a.kind === "cash" : a.kind !== "cash")) ?? accounts[0];
  const cats = useMemo(() => ["Popular", ...Array.from(new Set(items.map((i) => i.category)))], [items]);
  const grid = items.filter((i) => (cat === "Popular" || i.category === cat) && i.name.toLowerCase().includes(search.toLowerCase()));
  const lines = Object.entries(cart).map(([id, q]) => ({ item: items.find((i) => i.id === id)!, q })).filter((l) => l.item);
  const total = lines.reduce((a, l) => a + l.item.selling_price * l.q, 0);
  const change = Math.max(0, parseNum(tendered) - total);

  const m = useMutation({
    mutationFn: () => api("/sales", { method: "POST", json: { lines: lines.map((l) => ({ item_id: l.item.id, name: l.item.name, quantity: l.q, unit_price: l.item.selling_price, unit: l.item.unit })), method, account_id: account?.id ?? null, tendered: method === "cash" ? parseNum(tendered) || total : total } }),
    onSuccess: (sale) => { ["items", "dashboard", "accounts", "sales", "activity"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); setTender(false); setSaved(sale); },
    onError: (e: Error) => toast.show(e.message),
  });

  const reset = () => { setCart({}); setTendered(""); setSaved(null); setMethod("cash"); setAccountId(null); };

  const addToCart = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const setQty = (id: string, raw: string) => {
    const n = parseNum(raw);
    setCart((c) => {
      const next = { ...c };
      if (!raw.trim()) next[id] = 0;
      else if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  };

  // The receipt for the sale just saved: printed or shared straight from the
  // sheet, so the customer never waits for a second screen.
  const receipt = async (print: boolean) => {
    if (!saved?.id) return;
    try {
      const full = await api(`/sales/${saved.id}`);
      const chosen: any = settings.data ?? {};
      const logo = chosen.logo_url ? await photoDataUri(chosen.logo_url) : "";
      const html = buildReceiptHtml(full, { ...DEFAULT_BRAND, ...chosen, logo_url: logo });
      if (print) return await printHtml(html);
      const name = pdfName([(full as any).business?.name, (full as any).customer_name, (full as any).number]);
      const res = await sharePdf(html, name);
      if (!res.shared) toast.show(`${name} is ready — sharing is not available in this preview`);
    } catch (e: any) {
      toast.show(e.message ?? "Could not build the receipt");
    }
  };

  // A scan is matched against the barcode the shop typed on the item; a code
  // nobody has saved yet becomes a new item with the code already filled in.
  const onScan = (code: string) => {
    const hit = items.find((i) => (i.barcode ?? "").trim() === code);
    if (!hit) {
      setScan(false);
      setUnknown(code);
      return toast.show("No item carries that bar code yet");
    }
    addToCart(hit.id);
    toast.show(`${hit.name} added · ${money(hit.selling_price)}`);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="quick-sale-screen">
      <AppBar title="Quick sale" close right={<IconBtn name="barcode-outline" testID="quick-sale-scan" onPress={() => setScan(true)} />} />
      <View style={{ paddingHorizontal: 14 }}>
        <View style={s.search}><Ionicons name="search-outline" size={16} color={colors.ink60} /><TextInput testID="quick-sale-search" value={search} onChangeText={setSearch} placeholder="Search or scan" placeholderTextColor={colors.ink40} style={s.input} /><Pressable onPress={() => setScan(true)} hitSlop={8} testID="quick-sale-search-scan"><Ionicons name="barcode-outline" size={18} color={colors.green700} /></Pressable></View>
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
              <Pressable key={it.id} testID={`quick-sale-tile-${it.id}`} onPress={() => addToCart(it.id)} style={({ pressed }) => [s.tile, cart[it.id] ? s.tileOn : null, pressed && { opacity: 0.8 }]}>
                {it.photo_url
                  ? <Photo url={it.photo_url} style={s.tileImg} testID={`quick-sale-photo-${it.id}`} />
                  : <View style={[s.tileImg, { backgroundColor: TILE_COLORS[i % TILE_COLORS.length] }]}><Ionicons name="cube-outline" size={22} color={colors.ink40} /></View>}
                <View style={{ padding: 10 }}><Text style={s.tileName} numberOfLines={2}>{it.name}</Text><Text style={s.tilePrice}>{money(it.selling_price, { symbol: false })}</Text></View>
                {cart[it.id] ? <View style={s.count}><Text style={s.countText}>{cart[it.id]}</Text></View> : null}
              </Pressable>
            ))}
            <Pressable testID="quick-sale-add-item" onPress={() => router.push("/stock/new")} style={[s.tile, { borderStyle: "dashed", alignItems: "center", justifyContent: "center", minHeight: 150 }]}><Ionicons name="add" size={24} color={colors.ink40} /><Text style={[s.tilePrice, { color: colors.ink60 }]}>New item</Text></Pressable>
          </View>
        )}
        {lines.length ? (
          <Card style={{ marginTop: 9, paddingVertical: 4 }} testID="quick-sale-cart">
            {lines.map((l, i) => (
              <Li key={l.item.id} last={i === lines.length - 1} style={{ paddingVertical: 7 }}>
                <Pressable onPress={() => setCart((c) => { const n = { ...c }; if (n[l.item.id] > 1) n[l.item.id] -= 1; else delete n[l.item.id]; return n; })} testID={`quick-sale-cart-minus-${l.item.id}`} hitSlop={6}><Ionicons name="remove-circle-outline" size={20} color={colors.ink40} /></Pressable>
                {/* Tap to add one at a time, or type the number for a bulk buy. */}
                <TextInput testID={`quick-sale-qty-${l.item.id}`} value={String(l.q)} onChangeText={(v) => setQty(l.item.id, v)}
                  onBlur={() => { if (!l.q) setCart((c) => { const n = { ...c }; delete n[l.item.id]; return n; }); }}
                  keyboardType="decimal-pad" selectTextOnFocus style={s.qty} />
                <Pressable onPress={() => addToCart(l.item.id)} testID={`quick-sale-cart-plus-${l.item.id}`} hitSlop={6}><Ionicons name="add-circle-outline" size={20} color={colors.green700} /></Pressable>
                <H4 style={{ flex: 1, fontSize: 12.5 }} numberOfLines={1}>{l.item.name}</H4>
                <Money size={12}>{money(l.item.selling_price * l.q, { symbol: false })}</Money>
              </Li>
            ))}
          </Card>
        ) : null}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Row between style={{ marginBottom: 7 }}><H4>Total</H4><Money size={17} testID="quick-sale-total">{money(total)}</Money></Row>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          {(["cash", "transfer", "card", "credit"] as Method[]).map((k) => <Chip key={k} label={k === "credit" ? "On credit" : k[0].toUpperCase() + k.slice(1)} on={method === k} onPress={() => { setMethod(k); setAccountId(null); }} testID={`quick-sale-method-${k}`} />)}
        </View>
        {method !== "credit" && accountOptions.length ? (
          <PickerField label="Money goes into" value={account?.id ?? null} options={accountOptions} onPick={setAccountId}
            title="Which account takes this money?" style={{ marginBottom: 8, minHeight: 46 }} testID="quick-sale-account" />
        ) : null}
        <Btn label="Take payment" disabled={!lines.length} onPress={() => (method === "cash" ? setTender(true) : m.mutate())} loading={m.isPending && !tender} testID="quick-sale-take-payment" />
      </View>

      <Scanner visible={scan} onClose={() => setScan(false)} onScan={onScan} title="Scan to sell" hint="Point at the bar code — each scan adds one" />

      <Sheet visible={!!unknown} onClose={() => setUnknown("")} testID="quick-sale-unknown-sheet">
        <H4>No item with that code</H4>
        <Sub style={{ marginTop: 3 }}>Nothing in your stock carries this bar code yet.</Sub>
        <Card style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Av icon="barcode-outline" tone="sq" />
          <View style={{ flex: 1 }}><Lbl>Scanned code</Lbl><Money size={13} testID="quick-sale-unknown-code">{unknown}</Money></View>
        </Card>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}><Btn small variant="ghost" label="Scan again" onPress={() => { setUnknown(""); setScan(true); }} testID="quick-sale-unknown-retry" /></View>
          <View style={{ flex: 1.4 }}><Btn small label="Create this item" testID="quick-sale-unknown-create"
            onPress={() => { const code = unknown; setUnknown(""); router.push({ pathname: "/stock/new", params: { barcode: code } }); }} /></View>
        </View>
      </Sheet>

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
              <Btn small variant="ghost" label="Print receipt" style={{ flex: 1 }} onPress={() => receipt(true)} testID="sale-saved-print" />
              <Btn small variant="deep" label="Share" icon="logo-whatsapp" style={{ flex: 1 }} onPress={() => receipt(false)} testID="sale-saved-share" />
            </View>
            <Btn label="New sale" style={{ marginTop: 8 }} onPress={reset} testID="sale-saved-new" />
            <Btn small variant="ghost" label="Open this sale" style={{ marginTop: 8 }} testID="sale-saved-open"
              onPress={() => { const id = saved.id; setSaved(null); setCart({}); setTendered(""); router.push(`/sales/${id}`); }} />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
