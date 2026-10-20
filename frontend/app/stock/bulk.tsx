// Add several new items in one go. Shared supplier / category / unit up top,
// one row per item below. Any opening stock lands as a single purchase order.
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Btn, Card, Field, Lbl, Row, Sub } from "@/src/components/ui";
import { PickerField } from "@/src/components/picker";
import { useToast } from "@/src/components/sheet";
import { useLookup } from "@/src/lookups";
import { parseNum, sym } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { makeStyles, useTheme } from "@/src/theme";

type RowT = { key: string; name: string; qty: string; cost: string; sell: string };
let seq = 0;
const blank = (): RowT => ({ key: `r${seq++}`, name: "", qty: "", cost: "", sell: "" });

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  footer: { paddingTop: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surfaceSecondary },
}));

export default function BulkItems() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useLookup("item_category");
  const units = useLookup("unit");
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: () => api("/suppliers") });
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState("General");
  const [unit, setUnit] = useState("Piece");
  const [rows, setRows] = useState<RowT[]>([blank(), blank(), blank()]);
  const set = (key: string, patch: Partial<RowT>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const filled = rows.filter((r) => r.name.trim());

  const save = useMutation({
    mutationFn: () => api<any>("/items/bulk", { method: "POST", json: {
      supplier, category, unit,
      items: filled.map((r) => ({ name: r.name.trim(), quantity: parseNum(r.qty), cost_price: parseNum(r.cost), selling_price: parseNum(r.sell),
                                  supplier, category, unit })),
    } }),
    onSuccess: (r) => {
      ["items", "items-stats", "low-stock", "dashboard", "purchases", "suppliers"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.show(`${r.count} item${r.count > 1 ? "s" : ""} added to stock`, "Saved.");
      router.back();
    },
    onError: (e: any) => toast.show(e.message, "Not saved", "bad"),
  });

  const supplierOptions = ((suppliersQ.data as any)?.suppliers ?? []).map((x: any) => ({ key: x.name, label: x.name, sub: x.phone || x.category }));

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="bulk-items-screen">
      <AppBar title="Add several items" close />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 16 }} bottomOffset={80} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 8 }}>
          <PickerField label="Supplier" value={supplier} options={supplierOptions} onPick={setSupplier} searchable
            placeholder="Optional — who you bought them from" title="Which supplier?" testID="bulk-supplier" />
          <Row style={{ gap: 8 }}>
            <PickerField label="Category" value={category} options={cats.options} onPick={setCategory} onAdd={(v) => { cats.add(v); setCategory(v); }}
              addLabel="Add a category" searchable style={{ flex: 1 }} testID="bulk-category" />
            <PickerField label="Unit" value={unit} options={units.options} onPick={setUnit} onAdd={(v) => { units.add(v); setUnit(v); }}
              addLabel="Add a unit" style={{ flex: 1 }} testID="bulk-unit" />
          </Row>
        </Card>
        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Items · {filled.length}</Lbl>
        {rows.map((r, i) => (
          <Card key={r.key} style={{ marginBottom: 8, gap: 6 }} testID={`bulk-row-${i}`}>
            <Row style={{ gap: 8 }}>
              <Field placeholder={`Item ${i + 1} name`} value={r.name} onChangeText={(v) => set(r.key, { name: v })} style={{ flex: 1, minHeight: 40 }} testID={`bulk-name-${i}`} />
              {rows.length > 1 ? (
                <Pressable hitSlop={10} onPress={() => setRows((x) => x.filter((y) => y.key !== r.key))} testID={`bulk-remove-${i}`}>
                  <Ionicons name="close-circle" size={22} color={colors.ink40} />
                </Pressable>
              ) : null}
            </Row>
            <Row style={{ gap: 8 }}>
              <Field label="Qty" placeholder="0" keyboardType="decimal-pad" mono value={r.qty} onChangeText={(v) => set(r.key, { qty: v })} style={{ flex: 1 }} testID={`bulk-qty-${i}`} />
              <Field label="Cost" placeholder={`${sym()} 0`} keyboardType="decimal-pad" mono value={r.cost} onChangeText={(v) => set(r.key, { cost: v })} style={{ flex: 1.3 }} testID={`bulk-cost-${i}`} />
              <Field label="Sell" placeholder={`${sym()} 0`} keyboardType="decimal-pad" mono value={r.sell} onChangeText={(v) => set(r.key, { sell: v })} style={{ flex: 1.3 }} testID={`bulk-sell-${i}`} />
            </Row>
          </Card>
        ))}
        <Btn label="Add another row" variant="ghost" small icon="add" onPress={() => setRows((r) => [...r, blank()])} testID="bulk-add-row" />
        <Sub style={{ textAlign: "center", marginTop: 10 }}>Stock you enter here is saved as one purchase order, so it shows in your Purchases list.</Sub>
      </KeyboardAwareScrollView>
      <View style={[s.footer, { paddingBottom: pad }]}>
        <Btn label={filled.length ? `Save ${filled.length} item${filled.length > 1 ? "s" : ""}` : "Name at least one item"} disabled={!filled.length}
          loading={save.isPending} onPress={() => save.mutate()} testID="bulk-save" />
      </View>
    </View>
  );
}
