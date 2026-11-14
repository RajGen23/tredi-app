// 05.2 New item · details → 05.3 Pricing & stock. The same screen edits an
// existing item (`?edit=<id>`), so a price or a photo is never retyped from
// scratch — and every dropdown is a list the shop can extend itself.
import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { photoSource, pickAndUploadPhoto } from "@/src/uploads";
import { AppBar, Btn, Card, Divider, Field, H4, Lbl, Money, Row, Seg, Sub, Switch, Tag } from "@/src/components/ui";
import { PickerField } from "@/src/components/picker";
import { DateField } from "@/src/components/date-field";
import { Scanner } from "@/src/components/scanner";
import { useToast } from "@/src/components/sheet";
import { useLookup, useShops } from "@/src/lookups";
import { money, parseNum, sym } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { bulkDraft } from "@/src/bulk-draft";
import { fonts, makeStyles, useTheme } from "@/src/theme";

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
  const pad = useBottomPad();
  const router = useRouter();
  // Arrives from a Quick sale scan that found nothing — the code is already known.
  const params = useLocalSearchParams<{ barcode?: string; edit?: string; collect?: string; row?: string }>();
  const editId = params.edit || "";
  // ?collect=1 — filling one entry of "Add several items": Save puts it on that list instead
  const collect = params.collect === "1";
  const draftRow = params.row ? bulkDraft.find(params.row) : undefined;
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useLookup("item_category");
  const brands = useLookup("brand");
  const units = useLookup("unit");
  const locations = useLookup("location");
  const { writeShop } = useShops();
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: () => api("/suppliers") });
  const editQ = useQuery({ queryKey: ["item", editId], queryFn: () => api(`/items/${editId}`), enabled: !!editId });

  const [step, setStep] = useState<0 | 1>(0);
  const [photo, setPhoto] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<"product" | "service">("product");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("General");
  const [unit, setUnit] = useState("Piece");
  const [supplier, setSupplier] = useState("");
  const [expiryOn, setExpiryOn] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
  const [barcode, setBarcode] = useState(params.barcode ?? "");
  const [scan, setScan] = useState(false);
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState("");
  const [wholesale, setWholesale] = useState("");
  const [track, setTrack] = useState(true);
  const [alert, setAlert] = useState("10");
  const margin = parseNum(sell) - parseNum(cost);
  const marginPct = parseNum(sell) ? (margin / parseNum(sell)) * 100 : 0;

  useEffect(() => { if (!location && writeShop) setLocation(writeShop); }, [writeShop, location]);

  useEffect(() => {
    const it: any = editQ.data ?? draftRow;
    if (!it || name) return;
    setKind(it.kind ?? "product");
    setName(it.name ?? "");
    setBrand(it.brand ?? "");
    setCategory(it.category ?? "General");
    setUnit(it.unit ?? "Piece");
    setSupplier(it.supplier ?? "");
    setLocation(it.location ?? "");
    setBarcode(it.barcode ?? "");
    setCost(it.cost_price ? String(it.cost_price) : "");
    setSell(it.selling_price ? String(it.selling_price) : "");
    setWholesale(it.wholesale_price ? String(it.wholesale_price) : "");
    setTrack(it.track_stock !== false);
    setAlert(String(it.alert_below ?? 0));
    setExpiryOn(!!it.expiry);
    setExpiry(it.expiry ?? "");
    setPhoto(it.photo_url ?? "");
    if (it.quantity) setQty(String(it.quantity));
  }, [editQ.data, name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!photo) return setPhotoUri("");
    photoSource(photo).then((src) => setPhotoUri(src.uri));
  }, [photo]);

  const payload = () => ({
    name, kind, brand, category, unit, barcode, supplier, location, photo_url: photo,
    cost_price: parseNum(cost), selling_price: parseNum(sell), wholesale_price: wholesale ? parseNum(wholesale) : null,
    track_stock: kind === "product" && track, quantity: parseNum(qty), alert_below: parseNum(alert),
    expiry: expiryOn && expiry ? expiry : null,
  });

  const m = useMutation({
    mutationFn: () => (editId ? api(`/items/${editId}`, { method: "PUT", json: payload() }) : api("/items", { method: "POST", json: payload() })),
    onSuccess: (it: any) => {
      ["items", "item", "items-stats", "low-stock", "dashboard", "lookup"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.show(editId ? `${it.name} updated` : `${it.name} added to stock`, "Saved.");
      router.replace(`/stock/${it.id}`);
    },
  });

  const addToList = () => {
    bulkDraft.put({ ...payload(), name: name.trim(), key: params.row });
    toast.show(`${name.trim()} ${params.row ? "updated" : "added to the list"}`, "Saved.");
    router.back();
  };

  const addPhoto = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadPhoto({ crop: true });
      if (url) {
        setPhoto(url);
        toast.show(editId ? "Photo replaced — save to keep it" : "Photo added — it can print on invoices");
      }
    } catch (e: any) {
      toast.show(e.message ?? "Upload failed", undefined, "bad");
    } finally {
      setUploading(false);
    }
  };

  const supplierOptions = ((suppliersQ.data as any)?.suppliers ?? []).map((x: any) => ({ key: x.name, label: x.name, sub: x.phone || x.category }));
  const addSupplier = useMutation({
    mutationFn: (data: { name: string; phone: string; address: string; note: string }) => api("/suppliers", { method: "POST", json: data }),
    onSuccess: (sup: any) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setSupplier(sup.name);
      toast.show(`${sup.name} added as a supplier`, "Saved.");
    },
    onError: () => toast.show("Couldn't save that supplier — check your connection and try again", "Not saved", "bad"),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-item-screen">
      <AppBar title={collect ? (params.row ? "Edit list item" : "Add to list") : editId ? (step === 0 ? "Edit item" : "Prices & stock") : step === 0 ? "New item" : "Pricing & stock"}
        close={step === 0} back={step === 1} onBack={() => (step === 1 ? setStep(0) : router.back())}
        right={!editId && !collect && step === 0 ? (
          <Pressable hitSlop={8} onPress={() => router.replace("/stock/bulk")} testID="item-add-several" style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons name="add-circle" size={22} color={colors.green700} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.green700 }}>Several</Text>
          </Pressable>
        ) : undefined}
        rightText={step === 0 && (editId || collect) ? "Next" : undefined} onRightText={() => (name.trim() ? setStep(1) : toast.show("Give the item a name first"))} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }} bottomOffset={80} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
            <PickerField label="Supplier" value={supplier} options={supplierOptions} onPick={setSupplier} searchable
              onAdd={(name, x) => { setSupplier(name); addSupplier.mutate({ name, phone: x.phone ?? "", address: x.address ?? "", note: x.note ?? "" }); }}
              addLabel="Supplier name" addTitle="New supplier"
              addFields={[
                { key: "phone", label: "Phone", placeholder: "+234 803 000 0000", keyboardType: "phone-pad" },
                { key: "address", label: "Address", placeholder: "Shop 12, Alaba market" },
                { key: "note", label: "Additional info", placeholder: "What they supply, delivery days, terms…", multiline: true },
              ]}
              addHint="Only the name is required — email and opening balance can go on their profile later."
              placeholder="Optional — who you buy it from" title="Which supplier?" testID="item-supplier" />
            <Pressable testID="item-photo-add" disabled={uploading} onPress={addPhoto}>
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
            <View style={{ marginTop: 9 }}>
              <Seg testID="item-kind" value={kind} onChange={(k) => { setKind(k); if (k === "service") setUnit("Service"); }}
                options={[{ key: "product", label: "Product" }, { key: "service", label: "Service" }]} />
            </View>
            <View style={{ gap: 10, marginTop: 10 }}>
              <Field testID="item-name" label="Item name" value={name} onChangeText={setName} placeholder="Adeba Rice 50kg" autoFocus={!editId} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <PickerField label="Brand" value={brand} options={brands.options} onPick={setBrand} manage={brands.manage} onAdd={(v) => { brands.add(v); setBrand(v); }}
                  addLabel="Add a brand" searchable placeholder="Optional" style={{ flex: 1 }} testID="item-brand" />
                <PickerField label="Category" value={category} options={cats.options} onPick={setCategory} manage={cats.manage} onAdd={(v) => { cats.add(v); setCategory(v); }}
                  addLabel="Add a category" searchable style={{ flex: 1 }} testID="item-category" />
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <PickerField label="Unit" value={unit} options={units.options} onPick={setUnit} manage={units.manage} onAdd={(v) => { units.add(v); setUnit(v); }}
                  addLabel="Add a unit" style={{ flex: 1 }} testID="item-unit" />
                <Field testID="item-barcode" label="Barcode" value={barcode} onChangeText={setBarcode} placeholder="Scan" mono style={{ flex: 1 }}
                  right={<Pressable onPress={() => setScan(true)} hitSlop={8} testID="item-barcode-scan"><Ionicons name="barcode-outline" size={18} color={colors.green700} /></Pressable>} />
              </View>
              {kind === "product" ? (
                <>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <PickerField label="Store in" value={location} options={locations.options} onPick={setLocation} manage={locations.manage} onAdd={(v) => { locations.add(v); setLocation(v); }}
                      addLabel="Add a location" style={{ flex: 1 }} testID="item-location" />
                    {expiryOn
                      ? <DateField label="Expiry" value={expiry} onChange={setExpiry} allowClear style={{ flex: 1 }} testID="item-expiry" />
                      : <Field label="Expiry" value="" placeholder="Off" onPress={() => setExpiryOn(true)} style={{ flex: 1 }} testID="item-expiry-off" right={<Switch on={expiryOn} onChange={setExpiryOn} testID="item-expiry-toggle" />} />}
                  </View>
                  {!editId ? (
                    <Field testID="item-qty" label="Quantity supplied" value={qty} onChangeText={setQty} keyboardType="decimal-pad" mono placeholder="0" />
                  ) : null}
                </>
              ) : null}
            </View>
            <Sub style={{ textAlign: "center", marginTop: 9 }}>
              {editId ? "The count itself is changed with Adjust stock, so every movement keeps its reason." : "Expiry is off by default — switch it on only for items that need it."}
            </Sub>
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Field testID="item-cost" label="Cost price" value={cost} onChangeText={setCost} keyboardType="decimal-pad" mono placeholder={`${sym()} 0`} style={{ flex: 1 }} />
              <Field testID="item-sell" label="Selling price" value={sell} onChangeText={setSell} keyboardType="decimal-pad" mono placeholder={`${sym()} 0`} style={{ flex: 1 }} autoFocus={!editId} />
            </View>
            <Card style={[s.mint, { marginTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
              <Sub>Margin on retail</Sub><Money tone={margin >= 0 ? "pos" : "neg"} testID="item-margin">{marginPct.toFixed(1)}% · {money(margin)}</Money>
            </Card>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Other prices</Lbl>
            <Card style={{ paddingVertical: 9, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}><H4>Wholesale</H4><Tag>Applied to wholesale customers</Tag></View>
              <Field testID="item-wholesale" value={wholesale} onChangeText={setWholesale} keyboardType="decimal-pad" mono placeholder={`${sym()} 0`} style={{ width: 120, minHeight: 40 }} />
            </Card>
            <Divider />
            {kind === "product" ? (
              <>
                <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1 }}><H4>Track stock quantity</H4><Sub>Off for services and made-to-order items</Sub></View>
                  <Switch on={track} onChange={setTrack} testID="item-track" />
                </Card>
                {track ? (
                  <Row style={{ gap: 8, marginTop: 8 }}>
                    {!editId ? <Field testID="item-opening" label="Opening qty" value={qty} onChangeText={setQty} keyboardType="decimal-pad" mono style={{ flex: 1 }} /> : null}
                    <Field testID="item-alert" label="Alert me below" value={alert} onChangeText={setAlert} keyboardType="decimal-pad" mono style={{ flex: 1 }} />
                  </Row>
                ) : null}
              </>
            ) : null}
            {m.error ? <Text style={s.err} testID="item-error">{(m.error as Error).message}</Text> : null}
          </>
        )}
      </KeyboardAwareScrollView>
      <View style={[s.footer, { paddingBottom: pad }]}>
        {step === 0
          ? <Btn testID="item-next" label={editId ? "Continue to prices" : "Continue to pricing"} onPress={() => (name.trim() ? setStep(1) : toast.show("Give the item a name first"))} />
          : <Btn testID="item-save" label={collect ? (params.row ? "Update item on list" : "Add item to list") : editId ? "Save changes" : "Save item"}
              onPress={() => (collect ? addToList() : m.mutate())} loading={m.isPending} disabled={!sell} />}
      </View>
      <Scanner visible={scan} onClose={() => setScan(false)} onScan={(code) => { setBarcode(code); setScan(false); toast.show(`Bar code ${code} saved to this item`); }} title="Scan the bar code" hint="The code lands in the Barcode field" />
    </View>
  );
}
