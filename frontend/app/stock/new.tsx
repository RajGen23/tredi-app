// 05.2 New item · details → 05.3 Pricing & stock.
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { photoSource, pickAndUploadPhoto } from "@/src/uploads";
import { AppBar, Av, Btn, Card, Divider, Field, H4, Lbl, Money, Seg, Sub, Switch, Tag } from "@/src/components/ui";
import { Scanner } from "@/src/components/scanner";
import { useToast } from "@/src/components/sheet";
import { money, parseNum, slashDate } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const CATS = ["Grains", "Oils", "Home", "Building", "Drinks", "General"];
const UNITS = ["Bag", "Piece", "Carton", "Litre", "Kg", "Service"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  faint: { backgroundColor: c.faint, paddingVertical: 9, paddingHorizontal: 11 },
  photo: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: c.radioBorder, alignItems: "center", justifyContent: "center" },
  mint: { backgroundColor: c.brandTertiary, borderColor: c.mint2, paddingVertical: 8, paddingHorizontal: 11 },
  footer: { paddingTop: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.border },
  err: { fontFamily: fonts.medium, fontSize: 12, color: c.coral, textAlign: "center", marginTop: 8 },
}));

export default function NewItem() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Arrives from a Quick sale scan that found nothing — the code is already known.
  const params = useLocalSearchParams<{ barcode?: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState<0 | 1>(0);
  const [photo, setPhoto] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<"product" | "service">("product");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Grains");
  const [unit, setUnit] = useState("Bag");
  const [supplier, setSupplier] = useState("");
  const [expiryOn, setExpiryOn] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
  const [barcode, setBarcode] = useState(params.barcode ?? "");
  const [scan, setScan] = useState(false);
  const [location, setLocation] = useState("Warehouse");
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState("");
  const [wholesale, setWholesale] = useState("");
  const [track, setTrack] = useState(true);
  const [alert, setAlert] = useState("10");
  const margin = parseNum(sell) - parseNum(cost);
  const marginPct = parseNum(sell) ? (margin / parseNum(sell)) * 100 : 0;

  const m = useMutation({
    mutationFn: () => api("/items", { method: "POST", json: { name, kind, category, unit, barcode, supplier, location, photo_url: photo, cost_price: parseNum(cost), selling_price: parseNum(sell), wholesale_price: wholesale ? parseNum(wholesale) : null, track_stock: kind === "product" && track, quantity: parseNum(qty), alert_below: parseNum(alert), expiry: expiryOn ? expiry : null } }),
    onSuccess: (it: any) => { ["items", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast.show(`${it.name} added to stock`, "Saved."); router.replace(`/stock/${it.id}`); },
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-item-screen">
      <AppBar title={step === 0 ? "New item" : "Pricing & stock"} close={step === 0} back={step === 1} onBack={() => (step === 1 ? setStep(0) : router.back())} rightText={step === 0 ? "Next" : undefined} onRightText={() => (name.trim() ? setStep(1) : toast.show("Give the item a name first"))} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }} bottomOffset={80} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
            <Card style={[s.faint, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
              <Av icon="business-outline" tone="sq" size={24} />
              <View style={{ flex: 1 }}><Field value={supplier} onChangeText={setSupplier} placeholder="Supplier — optional" style={{ borderWidth: 0, paddingHorizontal: 0, minHeight: 34, backgroundColor: "transparent" }} testID="item-supplier" /></View>
            </Card>
            <Pressable testID="item-photo-add" disabled={uploading} onPress={async () => {
              setUploading(true);
              try {
                const url = await pickAndUploadPhoto();
                if (url) {
                  setPhoto(url);
                  setPhotoUri((await photoSource(url)).uri);
                  toast.show("Photo added — it can print on invoices");
                }
              } catch (e: any) {
                toast.show(e.message ?? "Upload failed");
              } finally {
                setUploading(false);
              }
            }}>
              <Card style={{ marginTop: 9, padding: 9, flexDirection: "row", gap: 7, alignItems: "center" }}>
                {photoUri
                  ? <Image source={{ uri: photoUri }} style={{ width: 44, height: 44, borderRadius: 10 }} testID="item-photo-preview" />
                  : <View style={s.photo}><Ionicons name={uploading ? "cloud-upload-outline" : "add"} size={16} color={colors.ink40} /></View>}
                <View style={{ flex: 1 }}>
                  <H4>Photo</H4>
                  <Sub>{uploading ? "Uploading…" : photoUri ? "Tap to replace · prints beside the item on invoices" : "Compressed for slow data · prints beside the item on invoices"}</Sub>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.ink40} />
              </Card>
            </Pressable>
            <View style={{ marginTop: 9 }}><Seg testID="item-kind" value={kind} onChange={(k) => { setKind(k); if (k === "service") setUnit("Service"); }} options={[{ key: "product", label: "Product" }, { key: "service", label: "Service" }]} /></View>
            <View style={{ gap: 10, marginTop: 10 }}>
              <Field testID="item-name" label="Item name" value={name} onChangeText={setName} placeholder="Adeba Rice 50kg" autoFocus />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Field testID="item-category" label="Category" value={category} onPress={() => setCategory(CATS[(CATS.indexOf(category) + 1) % CATS.length])} right={<Sub>⌄</Sub>} style={{ flex: 1 }} />
                <Field testID="item-unit" label="Unit" value={unit} onPress={() => setUnit(UNITS[(UNITS.indexOf(unit) + 1) % UNITS.length])} right={<Sub>⌄</Sub>} style={{ flex: 1 }} />
              </View>
              {kind === "product" ? (
                <>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Field label="Date received" value={slashDate()} onPress={() => {}} mono style={{ flex: 1 }} />
                    <Field testID="item-expiry" label="Expiry" value={expiryOn ? expiry : ""} onChangeText={setExpiry} placeholder={expiryOn ? "DD/MM/YYYY" : "Off"} mono editable={expiryOn} style={{ flex: 1 }} right={<Switch on={expiryOn} onChange={setExpiryOn} testID="item-expiry-toggle" />} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Field testID="item-qty" label="Quantity supplied" value={qty} onChangeText={setQty} keyboardType="decimal-pad" mono placeholder="0" style={{ flex: 1 }} />
                    <Field testID="item-barcode" label="Barcode" value={barcode} onChangeText={setBarcode} placeholder="Scan" mono style={{ flex: 1 }} right={<Pressable onPress={() => setScan(true)} hitSlop={8} testID="item-barcode-scan"><Ionicons name="barcode-outline" size={18} color={colors.green700} /></Pressable>} />
                  </View>
                  <Field testID="item-location" label="Store in" value={location} onChangeText={setLocation} placeholder="Warehouse · Ikeja" />
                </>
              ) : null}
            </View>
            <Sub style={{ textAlign: "center", marginTop: 9 }}>Expiry is off by default — switch it on only for items that need it.</Sub>
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Field testID="item-cost" label="Cost price" value={cost} onChangeText={setCost} keyboardType="decimal-pad" mono placeholder="₦ 0" style={{ flex: 1 }} />
              <Field testID="item-sell" label="Selling price" value={sell} onChangeText={setSell} keyboardType="decimal-pad" mono placeholder="₦ 0" style={{ flex: 1 }} autoFocus />
            </View>
            <Card style={[s.mint, { marginTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
              <Sub>Margin on retail</Sub><Money tone={margin >= 0 ? "pos" : "neg"} testID="item-margin">{marginPct.toFixed(1)}% · {money(margin)}</Money>
            </Card>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Other prices</Lbl>
            <Card style={{ paddingVertical: 9, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}><H4>Wholesale</H4><Tag>Applied to wholesale customers</Tag></View>
              <Field testID="item-wholesale" value={wholesale} onChangeText={setWholesale} keyboardType="decimal-pad" mono placeholder="₦ 0" style={{ width: 120, minHeight: 40 }} />
            </Card>
            <Card style={{ marginTop: 6, paddingVertical: 12, paddingHorizontal: 11, borderStyle: "dashed", flexDirection: "row", justifyContent: "space-between" }}><H4 style={{ color: colors.ink60 }}>Add customer-specific price</H4><Text style={{ color: colors.green700, fontFamily: fonts.extrabold }}>＋</Text></Card>
            <Divider />
            {kind === "product" ? (
              <>
                <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ flex: 1 }}><H4>Track stock quantity</H4><Sub>Off for services and made-to-order items</Sub></View><Switch on={track} onChange={setTrack} testID="item-track" /></Card>
                {track ? (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                    <Field testID="item-opening" label="Opening qty" value={qty} onChangeText={setQty} keyboardType="decimal-pad" mono style={{ flex: 1 }} />
                    <Field testID="item-alert" label="Alert me below" value={alert} onChangeText={setAlert} keyboardType="decimal-pad" mono style={{ flex: 1 }} />
                  </View>
                ) : null}
              </>
            ) : null}
            {m.error ? <Text style={s.err} testID="item-error">{(m.error as Error).message}</Text> : null}
          </>
        )}
      </KeyboardAwareScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {step === 0 ? <Btn testID="item-next" label="Continue to pricing" onPress={() => (name.trim() ? setStep(1) : toast.show("Give the item a name first"))} /> : <Btn testID="item-save" label="Save item" onPress={() => m.mutate()} loading={m.isPending} disabled={!sell} />}
      </View>
      <Scanner visible={scan} onClose={() => setScan(false)} onScan={(code) => { setBarcode(code); setScan(false); toast.show(`Bar code ${code} saved to this item`); }} title="Scan the bar code" hint="The code lands in the Barcode field" />
    </View>
  );
}
