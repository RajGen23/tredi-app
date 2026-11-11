// 05.4 Item detail — what it costs, what it sells for, what it has earned since
// inception, where it came from, how long it has been sitting, and 05.5 Adjust
// stock (reason required, priced live). An item with history is archived, never
// deleted, so old invoices and reports keep telling the truth.
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { photoSource, pickAndUploadPhoto } from "@/src/uploads";
import { useAuth } from "@/src/auth";
import { AppBar, Av, Badge, Btn, Card, Divider, Field, H4, IconBtn, Li, Lbl, Loading, Money, Radio, Row, Seg, Sub, Tag } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { compact, group, money, parseNum, shortDate } from "@/src/format";
import { useShops } from "@/src/lookups";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const REASONS = ["Damaged or expired", "Miscount at last stock take", "Theft or loss", "Used internally", "New delivery received"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  cell: { flex: 1, alignItems: "center" },
  cellMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.border },
  amber: { backgroundColor: c.warning, borderColor: "#F3E2BE", paddingVertical: 8, paddingHorizontal: 10, marginTop: 10 },
  red: { backgroundColor: c.error, borderColor: "#F7D6D7" },
  mint: { backgroundColor: c.brandTertiary, borderColor: c.mint2 },
  bigInput: { fontFamily: fonts.monoSemibold, fontSize: 26, color: c.onSurface, textAlign: "center", paddingVertical: 4 },
  audit: { paddingVertical: 8, paddingHorizontal: 11, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bold: { fontFamily: fonts.bold },
}));

export default function ItemDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const { writeShop } = useShops();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["item", id], queryFn: () => api(`/items/${id}`) });
  const [photoUri, setPhotoUri] = useState("");
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"set" | "add" | "remove">("set");
  const [val, setVal] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [showMoves, setShowMoves] = useState(false);
  const [killOpen, setKillOpen] = useState(false);
  const [killReason, setKillReason] = useState("");
  const it = q.data;

  useEffect(() => {
    const url = q.data?.photo_url;
    if (!url) return setPhotoUri("");
    photoSource(url).then((src) => setPhotoUri(src.uri));
  }, [q.data?.photo_url]);

  const fresh = () => ["item", "items", "items-stats", "low-stock", "dashboard", "activity"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const setPhoto = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadPhoto({ crop: true });
      if (!url) return;
      await api(`/items/${id}/photo`, { method: "PATCH", json: { photo_url: url } });
      fresh();
      toast.show("Photo saved — it prints beside this item on invoices");
    } catch (e: any) {
      toast.show(e.message ?? "Upload failed", undefined, "bad");
    } finally {
      setUploading(false);
    }
  };

  const n = parseNum(val);
  const newQty = it ? (mode === "set" ? n : mode === "add" ? it.quantity + n : it.quantity - n) : 0;
  const diff = it ? newQty - it.quantity : 0;

  const m = useMutation({
    mutationFn: () => api(`/items/${id}/adjust`, { method: "POST", json: { mode, quantity: n, reason, note } }),
    onSuccess: () => { fresh(); setOpen(false); setVal(""); setNote(""); toast.show(`${it.name} now ${newQty} ${it.unit.toLowerCase()}s`, "Adjusted."); },
    onError: (e: Error) => toast.show(e.message),
  });

  const kill = useMutation({
    mutationFn: () => api(`/items/${id}?reason=${encodeURIComponent(killReason)}`, { method: "DELETE" }),
    onSuccess: (r: any) => {
      fresh();
      setKillOpen(false);
      setKillReason("");
      toast.show(r.message, r.mode === "archived" ? "Archived." : "Deleted.");
      if (r.mode === "deleted") router.back();
    },
    onError: (e: any) => toast.show(e.message),
  });

  const restore = useMutation({
    mutationFn: () => api(`/items/${id}/restore`, { method: "POST" }),
    onSuccess: () => { fresh(); toast.show("Back in your catalogue", "Restored."); },
    onError: (e: any) => toast.show(e.message),
  });

  const low = it && it.track_stock && it.quantity <= it.alert_below;
  const unitCost = it?.cost_price ?? 0;
  const unitProfit = (it?.selling_price ?? 0) - unitCost;
  const unitMargin = it?.selling_price ? (unitProfit / it.selling_price) * 100 : 0;

  return (
    <View style={s.root} testID="item-detail-screen">
      <View style={[s.teal, { height: insets.top + 132 }]} />
      <View style={{ paddingTop: insets.top }}>
        <AppBar teal back title="Item" right={user?.perms?.edit_stock === false ? undefined : <>
          <IconBtn teal name="create-outline" testID="item-edit" onPress={() => router.push(`/stock/new?edit=${id}`)} />
          <IconBtn teal name="trash-outline" testID="item-more" onPress={() => setKillOpen(true)} />
        </>} />
      </View>
      {!it ? <Card style={{ marginHorizontal: 14 }}><Loading /></Card> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
          <Card>
            <Row>
              <Pressable testID="item-photo" onPress={setPhoto} disabled={uploading}>
                {photoUri
                  ? <Image source={{ uri: photoUri }} style={{ width: 44, height: 44, borderRadius: 11 }} testID="item-photo-image" />
                  : <Av icon={uploading ? "cloud-upload-outline" : it.kind === "service" ? "construct-outline" : "cube-outline"} tone="sq" size={44} />}
              </Pressable>
              <View style={{ flex: 1 }}>
                <H4 style={{ fontSize: 15 }} testID="item-name">{it.name}</H4>
                <Sub>
                  {it.brand ? `${it.brand} · ` : ""}{it.category} · {it.unit.toLowerCase()}
                  {it.barcode ? <Text style={{ fontFamily: fonts.mono }}> · {it.barcode}</Text> : null}
                </Sub>
                {!photoUri ? <Tag>{uploading ? "Uploading photo…" : "Tap the box to add a photo"}</Tag> : null}
              </View>
              {it.archived ? <Badge tone="draft">Archived</Badge> : null}
            </Row>
            <Divider />
            <View style={{ flexDirection: "row" }}>
              <View style={s.cell}><Lbl>In stock</Lbl><Money size={16} style={low ? { color: colors.amber } : undefined} testID="item-qty">{it.track_stock ? it.quantity : "—"}</Money></View>
              <View style={[s.cell, s.cellMid]}><Lbl>Selling</Lbl><Money size={16}>{money(it.selling_price, { symbol: false })}</Money></View>
              {user?.perms?.see_stock_value === false ? null : <View style={s.cell}><Lbl>Value</Lbl><Money size={16}>{compact(it.quantity * it.cost_price)}</Money></View>}
            </View>
            {low && !it.archived ? <Card style={s.amber}><Sub><Text style={s.bold}>Below your alert level of {it.alert_below}.</Text>{it.supplier ? ` Last supplier: ${it.supplier}.` : " Reorder soon."}</Sub></Card> : null}
            {it.track_stock && !it.archived ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
                {user?.perms?.adjust_stock === false ? null : <Btn small variant="ghost" label="Adjust stock" style={{ flex: 1 }} onPress={() => setOpen(true)} testID="item-adjust" />}
                {user?.perms?.see_suppliers === false ? null : <Btn small variant="deep" label="Reorder" style={{ flex: 1 }} onPress={() => router.push(`/purchases/new?item=${id}`)} testID="item-reorder" />}
              </View>
            ) : null}
          </Card>

          {it.archived ? (
            <Card style={[s.red, { marginTop: 9 }]} testID="item-archived-card">
              <H4>This item is archived</H4>
              <Sub style={{ marginTop: 2 }}>
                It stays on every invoice and report it ever appeared on, but it no longer shows in your catalogue or on new invoices.
                {it.archived_reason ? ` Reason: “${it.archived_reason}”.` : ""}
              </Sub>
              <Btn small variant="ghost" label="Put it back in the catalogue" style={{ marginTop: 11 }} loading={restore.isPending} testID="item-restore" onPress={() => restore.mutate()} />
            </Card>
          ) : null}

          {/* Cost, sell, and what this item has actually earned since it was first stocked */}
          {it.profit === null ? null : <Card style={{ marginTop: 9 }} testID="item-money-card">
            <Row between><Lbl>Prices &amp; profit</Lbl><Tag>since inception</Tag></Row>
            <Row between style={{ marginTop: 8 }}>
              <View><Lbl>Cost</Lbl><Money size={14}>{money(unitCost)}</Money></View>
              <View style={{ alignItems: "center" }}><Lbl>Sells at</Lbl><Money size={14}>{money(it.selling_price)}</Money></View>
              <View style={{ alignItems: "flex-end" }}>
                <Lbl>Per unit</Lbl>
                <Money size={14} tone={unitProfit >= 0 ? "pos" : "neg"}>{money(unitProfit)} · {unitMargin.toFixed(0)}%</Money>
              </View>
            </Row>
            {it.wholesale_price ? <Tag style={{ marginTop: 6 }}>Wholesale {money(it.wholesale_price)}</Tag> : null}
            <Divider />
            <Row between><Sub>Units sold</Sub><Money size={12.5} testID="item-sold">{it.sold_qty}</Money></Row>
            <Row between style={{ marginTop: 5 }}><Sub>Money it brought in</Sub><Money size={12.5}>{money(it.revenue)}</Money></Row>
            <Row between style={{ marginTop: 5 }}><Sub>Cost of those sales</Sub><Money size={12.5} tone="neg">− {money(it.cost_of_sales)}</Money></Row>
            {it.returned_qty ? <Row between style={{ marginTop: 5 }}><Sub>Came back ({it.returned_qty})</Sub><Money size={12.5} tone="neg">− {money(it.returned_value)}</Money></Row> : null}
            <Row between style={{ marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.border }}>
              <H4>Profit so far</H4>
              <Money size={16} tone={it.profit >= 0 ? "pos" : "neg"} testID="item-profit">{money(it.profit)}{it.revenue ? ` · ${it.margin}%` : ""}</Money>
            </Row>
          </Card>}

          {/* How long it has been sitting — the reorder and dead-stock question */}
          {it.track_stock ? (
            <Card style={{ marginTop: 9 }} testID="item-aging-card">
              <Row between><Lbl>Stock aging</Lbl><Tag>{it.idle_days === null || it.idle_days === undefined ? "no movement yet" : `${it.idle_days} day${it.idle_days === 1 ? "" : "s"} since it last moved`}</Tag></Row>
              <Row between style={{ marginTop: 8 }}>
                <View><Lbl>Last sold</Lbl><Sub>{it.last_sold_at ? shortDate(it.last_sold_at) : "Never"}</Sub></View>
                <View style={{ alignItems: "flex-end" }}><Lbl>Last received</Lbl><Sub>{it.last_received_at ? shortDate(it.last_received_at) : "—"}</Sub></View>
              </Row>
              {(it.idle_days ?? 0) > 60 ? (
                <Card style={s.amber}><Sub><Text style={s.bold}>Sitting {it.idle_days} days.</Text>{it.cost_price == null ? " Money is tied up here." : ` ${money(it.quantity * it.cost_price)} of your money is tied up here.`}</Sub></Card>
              ) : null}
              {it.stock_by_shop?.length ? (
                <View style={{ marginTop: 9 }}>
                  <Lbl>Where it is</Lbl>
                  {it.stock_by_shop.map((r: any) => (
                    <Row between key={r.shop} style={{ marginTop: 5 }} testID={`item-shop-${r.shop}`}>
                      <Sub>{r.shop}{r.shop === writeShop ? " · this store" : ""}</Sub><Money size={12.5}>{r.qty}</Money>
                    </Row>
                  ))}
                </View>
              ) : null}
            </Card>
          ) : null}

          {/* Where it came from: supplier and the purchase orders behind the shelf */}
          {it.supply_history?.length ? (
            <>
              <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Supply history</Lbl>
              <Card style={{ paddingVertical: 4 }} testID="item-supply-history">
                {it.supply_history.map((sp: any, i: number) => (
                  <Li key={`${sp.id}-${i}`} last={i === it.supply_history.length - 1} testID={`item-supply-${sp.id}`}
                    onPress={() => router.push(`/purchases/${sp.id}`)}>
                    <Av icon="cart-outline" tone="sq" />
                    <View style={{ flex: 1 }}>
                      <Row between><H4>{sp.number}</H4><Money>{money(sp.unit_cost)}</Money></Row>
                      <Row between><Sub>{sp.supplier || "Unknown supplier"} · {shortDate(sp.date)}</Sub><Tag>{sp.quantity} {it.unit.toLowerCase()}</Tag></Row>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={colors.ink40} />
                  </Li>
                ))}
              </Card>
            </>
          ) : it.supplier ? (
            <Card style={[s.mint, { marginTop: 9, paddingVertical: 9 }]}>
              <Sub>Supplied by <Text style={s.bold}>{it.supplier}</Text>. Record a purchase and the order will be listed here.</Sub>
            </Card>
          ) : null}

          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            <Li testID="item-movements" onPress={() => setShowMoves(!showMoves)}>
              <Av icon="swap-vertical-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>Stock movement</H4><Sub>{it.movements.length} entries · {it.adjustments.length} manual change{it.adjustments.length === 1 ? "" : "s"}</Sub></View>
              <Ionicons name={showMoves ? "chevron-up" : "chevron-forward"} size={16} color={colors.ink40} />
            </Li>
            <Li last testID="item-history" onPress={() => router.push(`/history/${id}`)}>
              <Av icon="time-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>Record history</H4><Sub>Who changed what, and why</Sub></View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
          </Card>
          {showMoves && it.movements.length ? (
            <Card style={{ marginTop: 9, paddingVertical: 4 }} testID="item-movement-list">
              {it.movements.map((mv: any, i: number) => (
                <Li key={mv.id} last={i === it.movements.length - 1}>
                  <View style={{ width: 40 }}><Tag>{dayjs(mv.created_at).format("DD MMM")}</Tag></View>
                  <View style={{ flex: 1 }}>
                    <H4>{mv.kind === "sale" ? "Sold" : mv.kind === "sale_reversed" ? "Sale cancelled" : mv.kind === "adjustment" ? "Adjusted" : mv.kind === "purchase" ? "Received" : "Opening"}</H4>
                    <Sub>{mv.ref}{mv.note ? ` · ${mv.note}` : ""}{mv.by ? ` · ${mv.by}` : ""}</Sub>
                  </View>
                  <View style={{ alignItems: "flex-end" }}><Money tone={mv.delta < 0 ? "neg" : "pos"}>{mv.delta > 0 ? "+" : ""}{mv.delta}</Money><Tag>bal {mv.balance}</Tag></View>
                </Li>
              ))}
            </Card>
          ) : null}
        </ScrollView>
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} testID="adjust-stock-sheet">
        <H4>Adjust stock quantity</H4>
        <Sub style={{ marginTop: 3 }}>Current count: <Money size={12}>{it?.quantity} {it?.unit.toLowerCase()}s</Money></Sub>
        <View style={{ marginTop: 11 }}><Seg testID="adjust-mode" value={mode} onChange={setMode} options={[{ key: "set", label: "Set new count" }, { key: "add", label: "Add" }, { key: "remove", label: "Remove" }]} /></View>
        <View style={{ marginTop: 10, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: 11, padding: 10 }}>
          <TextInput testID="adjust-input" value={group(val)} onChangeText={(v) => setVal(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.ink40} style={s.bigInput} autoFocus />
        </View>
        <Row between style={{ marginTop: 8 }}><Sub>Difference</Sub><Money tone={diff < 0 ? "neg" : "pos"} testID="adjust-diff">{diff > 0 ? "+ " : diff < 0 ? "− " : ""}{Math.abs(diff)} {it?.unit.toLowerCase()}s · {money(Math.abs(diff) * (it?.cost_price ?? 0))}</Money></Row>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Reason — required</Lbl>
        {REASONS.map((r, i) => <Li key={r} testID={`adjust-reason-${i}`} onPress={() => setReason(r)} last={i === REASONS.length - 1} style={{ paddingVertical: 8 }}><H4 style={{ flex: 1 }}>{r}</H4><Radio on={reason === r} /></Li>)}
        <Field label="Note" value={note} onChangeText={setNote} placeholder="2 bags soaked in Tuesday’s rain" style={{ marginTop: 9 }} testID="adjust-note" />
        <Card style={[s.audit, { marginTop: 9 }]}><Sub>Recorded against <Text style={s.bold}>{user?.name}</Text> · {dayjs().format("DD MMM, H:mm")}</Sub><Tag>Audit ✓</Tag></Card>
        <Btn label="Save adjustment" onPress={() => m.mutate()} loading={m.isPending} disabled={!val} style={{ marginTop: 10 }} testID="adjust-save" />
      </Sheet>

      <Sheet visible={killOpen} onClose={() => setKillOpen(false)} testID="item-kill-sheet">
        <H4>Remove {it?.name}?</H4>
        <Sub style={{ marginTop: 3 }}>
          If it has ever been sold, bought or supplied, it is <Text style={s.bold}>archived</Text> instead of deleted — your old invoices and
          reports must keep telling the truth. An item nobody ever touched is deleted outright.
        </Sub>
        {it?.sold_qty || it?.supply_history?.length ? (
          <Card style={[s.amber, { marginTop: 9, paddingVertical: 9 }]}>
            <Sub><Text style={s.bold}>This one has history</Text> — {it.sold_qty} sold{it.supply_history?.length ? ` and ${it.supply_history.length} supply record${it.supply_history.length === 1 ? "" : "s"}` : ""}. It will be archived.</Sub>
          </Card>
        ) : null}
        <Field label="Reason" value={killReason} onChangeText={setKillReason} placeholder="Discontinued by the supplier" style={{ marginTop: 9 }} testID="item-kill-reason" />
        <Btn variant="coral" label="Remove from catalogue" style={{ marginTop: 12 }} loading={kill.isPending} testID="item-kill-confirm" onPress={() => kill.mutate()} />
        <Btn variant="ghost" small label="Keep it" style={{ marginTop: 8 }} testID="item-kill-abort" onPress={() => setKillOpen(false)} />
      </Sheet>
    </View>
  );
}
