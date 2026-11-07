// Special pricing — this customer's own price for chosen items. New invoices
// for them pick these prices up automatically.
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Btn, Card, Empty, Field, H4, Loading, Row, Sub } from "@/src/components/ui";
import { PickerField } from "@/src/components/picker";
import { useToast } from "@/src/components/sheet";
import { money, parseNum } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { useTheme } from "@/src/theme";

type P = { item_id: string; name: string; normal_price: number; price: string };

export default function CustomerPricing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["customer-prices", id], queryFn: () => api<any[]>(`/customers/${id}/prices`) });
  const items = useQuery({ queryKey: ["items"], queryFn: () => api<any[]>("/items") });
  const [rows, setRows] = useState<P[] | null>(null);
  useEffect(() => { if (q.data && rows === null) setRows(q.data.map((r) => ({ ...r, price: String(r.price) }))); }, [q.data, rows]);
  const list = rows ?? [];

  const save = useMutation({
    mutationFn: () => api(`/customers/${id}/prices`, { method: "PUT", json: { prices: Object.fromEntries(list.map((r) => [r.item_id, parseNum(r.price)])) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customer-prices", id] }); toast.show("Special prices saved", "Saved."); router.back(); },
    onError: (e: any) => toast.show(e.message),
  });

  const options = (items.data ?? []).filter((it) => !list.some((r) => r.item_id === it.id))
    .map((it) => ({ key: it.id, label: it.name, sub: `Normal price ${money(it.selling_price)}` }));
  const add = (key: string) => {
    const it = (items.data ?? []).find((x) => x.id === key);
    if (it) setRows([...list, { item_id: it.id, name: it.name, normal_price: it.selling_price, price: String(it.selling_price || "") }]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, paddingTop: insets.top }} testID="customer-pricing-screen">
      <AppBar title="Special pricing" back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 14, paddingBottom: pad + 70 }} bottomOffset={80} keyboardShouldPersistTaps="handled">
        <PickerField label="Add an item" value={null} options={options} onPick={add} searchable placeholder="Pick an item to price for this customer"
          title="Which item?" testID="pricing-add-item" />
        {q.isLoading ? <Loading /> : list.length === 0 ? (
          <Card style={{ marginTop: 10 }}><Empty icon="pricetag-outline" title="No special prices yet" sub="Add an item above and set this customer's price. Their new invoices use it automatically." /></Card>
        ) : list.map((r, i) => (
          <Card key={r.item_id} style={{ marginTop: 10, gap: 6 }} testID={`pricing-row-${i}`}>
            <Row between>
              <View style={{ flex: 1 }}><H4 numberOfLines={1}>{r.name}</H4><Sub>Normal price {money(r.normal_price)}</Sub></View>
              <Pressable hitSlop={10} onPress={() => setRows(list.filter((x) => x.item_id !== r.item_id))} testID={`pricing-remove-${i}`}>
                <Ionicons name="close-circle" size={22} color={colors.ink40} />
              </Pressable>
            </Row>
            <Field label="Price for this customer" keyboardType="decimal-pad" mono value={r.price}
              onChangeText={(v) => setRows(list.map((x) => (x.item_id === r.item_id ? { ...x, price: v } : x)))} testID={`pricing-price-${i}`} />
          </Card>
        ))}
      </KeyboardAwareScrollView>
      <View style={{ position: "absolute", left: 14, right: 14, bottom: pad }}>
        <Btn label="Save prices" loading={save.isPending} disabled={rows === null} onPress={() => save.mutate()} testID="pricing-save" />
      </View>
    </View>
  );
}
