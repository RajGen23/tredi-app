// 05.4 Item detail + 05.5 Adjust stock sheet (reason required, priced live).
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { photoSource, pickAndUploadPhoto } from "@/src/uploads";
import { useAuth } from "@/src/auth";
import { AppBar, Av, Btn, Card, Divider, Field, H4, IconBtn, Li, Lbl, Loading, Money, Radio, Row, Seg, Sub, Tag } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { compact, money, parseNum } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const REASONS = ["Damaged or expired", "Miscount at last stock take", "Theft or loss", "Used internally", "New delivery received"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  cell: { flex: 1, alignItems: "center" },
  cellMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.border },
  amber: { backgroundColor: c.warning, borderColor: "#F3E2BE", paddingVertical: 8, paddingHorizontal: 10, marginTop: 10 },
  bigInput: { fontFamily: fonts.monoSemibold, fontSize: 26, color: c.onSurface, textAlign: "center", paddingVertical: 4 },
  audit: { paddingVertical: 8, paddingHorizontal: 11, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
}));

export default function ItemDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["item", id], queryFn: () => api(`/items/${id}`) });
  const [photoUri, setPhotoUri] = useState("");
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    const url = q.data?.photo_url;
    if (!url) return setPhotoUri("");
    photoSource(url).then((src) => setPhotoUri(src.uri));
  }, [q.data?.photo_url]);

  const setPhoto = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadPhoto();
      if (!url) return;
      const it = q.data;
      await api(`/items/${id}`, { method: "PUT", json: {
        name: it.name, kind: it.kind, category: it.category, unit: it.unit, barcode: it.barcode ?? "",
        supplier: it.supplier ?? "", location: it.location ?? "", photo_url: url, cost_price: it.cost_price,
        selling_price: it.selling_price, wholesale_price: it.wholesale_price ?? null, track_stock: it.track_stock,
        alert_below: it.alert_below ?? 0, expiry: it.expiry ?? null,
      } });
      qc.invalidateQueries({ queryKey: ["item", id] });
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.show("Photo saved — it prints beside this item on invoices");
    } catch (e: any) {
      toast.show(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  const it = q.data;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"set" | "add" | "remove">("set");
  const [val, setVal] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [showMoves, setShowMoves] = useState(false);

  const n = parseNum(val);
  const newQty = it ? (mode === "set" ? n : mode === "add" ? it.quantity + n : it.quantity - n) : 0;
  const diff = it ? newQty - it.quantity : 0;

  const m = useMutation({
    mutationFn: () => api(`/items/${id}/adjust`, { method: "POST", json: { mode, quantity: n, reason, note } }),
    onSuccess: () => { ["item", "items", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); setOpen(false); setVal(""); setNote(""); toast.show(`${it.name} now ${newQty} ${it.unit.toLowerCase()}s`, "Adjusted."); },
    onError: (e: Error) => toast.show(e.message),
  });

  const low = it && it.track_stock && it.quantity <= it.alert_below;
  return (
    <View style={s.root} testID="item-detail-screen">
      <View style={[s.teal, { height: insets.top + 132 }]} />
      <View style={{ paddingTop: insets.top }}><AppBar teal back title="Item" right={<><IconBtn teal name="create-outline" testID="item-edit" /><IconBtn teal name="ellipsis-horizontal" testID="item-more" /></>} /></View>
      {!it ? <Card style={{ marginHorizontal: 14 }}><Loading /></Card> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
          <Card>
            <Row>
              <Pressable testID="item-photo" onPress={setPhoto} disabled={uploading}>
                {photoUri
                  ? <Image source={{ uri: photoUri }} style={{ width: 40, height: 40, borderRadius: 11 }} testID="item-photo-image" />
                  : <Av icon={uploading ? "cloud-upload-outline" : it.kind === "service" ? "construct-outline" : "cube-outline"} tone="sq" size={40} />}
              </Pressable>
              <View style={{ flex: 1 }}><H4 style={{ fontSize: 15 }} testID="item-name">{it.name}</H4><Sub>{photoUri ? "" : uploading ? "Uploading photo… " : "Tap the box to add a photo · "}{it.category} · {it.unit.toLowerCase()}{it.barcode ? <Text style={{ fontFamily: fonts.mono }}> · {it.barcode}</Text> : null}</Sub></View>
            </Row>
            <Divider />
            <View style={{ flexDirection: "row" }}>
              <View style={s.cell}><Lbl>In stock</Lbl><Money size={16} style={low ? { color: colors.amber } : undefined} testID="item-qty">{it.track_stock ? it.quantity : "—"}</Money></View>
              <View style={[s.cell, s.cellMid]}><Lbl>Selling</Lbl><Money size={16}>{money(it.selling_price, { symbol: false })}</Money></View>
              <View style={s.cell}><Lbl>Value</Lbl><Money size={16}>{compact(it.quantity * it.cost_price)}</Money></View>
            </View>
            {low ? <Card style={s.amber}><Sub><Text style={{ fontFamily: fonts.bold }}>Below your alert level of {it.alert_below}.</Text>{it.supplier ? ` Last supplier: ${it.supplier}.` : " Reorder soon."}</Sub></Card> : null}
            {it.track_stock ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
                <Btn small variant="ghost" label="Adjust stock" style={{ flex: 1 }} onPress={() => setOpen(true)} testID="item-adjust" />
                <Btn small variant="deep" label="Reorder" style={{ flex: 1 }} onPress={() => toast.show("Supplier purchases arrive in the next pass")} testID="item-reorder" />
              </View>
            ) : null}
          </Card>
          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            <Li testID="item-prices"><Av icon="pricetag-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Prices</H4><Sub>Retail {money(it.selling_price)}{it.wholesale_price ? ` · Wholesale ${money(it.wholesale_price)}` : ""} · Cost {money(it.cost_price)}</Sub></View></Li>
            <Li testID="item-movements" onPress={() => setShowMoves(!showMoves)}><Av icon="swap-vertical-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Stock movement</H4><Sub>{it.movements.length} entries</Sub></View><Ionicons name={showMoves ? "chevron-up" : "chevron-forward"} size={16} color={colors.ink40} /></Li>
            <Li last testID="item-adjustments"><Av icon="time-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Adjustment history</H4><Sub>{it.adjustments.length} manual changes</Sub></View></Li>
          </Card>
          {showMoves && it.movements.length ? (
            <Card style={{ marginTop: 9, paddingVertical: 4 }} testID="item-movement-list">
              {it.movements.map((mv: any, i: number) => (
                <Li key={mv.id} last={i === it.movements.length - 1}>
                  <View style={{ width: 40 }}><Tag>{dayjs(mv.created_at).format("DD MMM")}</Tag></View>
                  <View style={{ flex: 1 }}><H4>{mv.kind === "sale" ? "Sold" : mv.kind === "adjustment" ? "Adjusted" : "Opening"}</H4><Sub>{mv.ref}{mv.note ? ` · ${mv.note}` : ""}{mv.by ? ` · ${mv.by}` : ""}</Sub></View>
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
          <TextInput testID="adjust-input" value={val} onChangeText={setVal} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.ink40} style={s.bigInput} autoFocus />
        </View>
        <Row between style={{ marginTop: 8 }}><Sub>Difference</Sub><Money tone={diff < 0 ? "neg" : "pos"} testID="adjust-diff">{diff > 0 ? "+ " : diff < 0 ? "− " : ""}{Math.abs(diff)} {it?.unit.toLowerCase()}s · {money(Math.abs(diff) * (it?.cost_price ?? 0))}</Money></Row>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Reason — required</Lbl>
        {REASONS.map((r, i) => <Li key={r} testID={`adjust-reason-${i}`} onPress={() => setReason(r)} last={i === REASONS.length - 1} style={{ paddingVertical: 8 }}><H4 style={{ flex: 1 }}>{r}</H4><Radio on={reason === r} /></Li>)}
        <Field label="Note" value={note} onChangeText={setNote} placeholder="2 bags soaked in Tuesday’s rain" style={{ marginTop: 9 }} testID="adjust-note" />
        <Card style={[s.audit, { marginTop: 9 }]}><Sub>Recorded against <Text style={{ fontFamily: fonts.bold }}>{user?.name}</Text> · {dayjs().format("DD MMM, H:mm")}</Sub><Tag>Audit ✓</Tag></Card>
        <Btn label="Save adjustment" onPress={() => m.mutate()} loading={m.isPending} disabled={!val} style={{ marginTop: 10 }} testID="adjust-save" />
      </Sheet>
    </View>
  );
}
