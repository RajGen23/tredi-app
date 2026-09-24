// Add a business — each one keeps its own books.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Badge, Btn, Card, Chip, Field, H4, Lbl, Li, Row, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const TYPES = ["Retail", "Wholesale", "Services", "Pharmacy", "Building materials"];

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function NewBusiness() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", tin: "", address: "", phone: "", shop_name: "Main branch" });
  const [type, setType] = useState(TYPES[0]);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["businesses"], queryFn: () => api("/businesses") });

  const save = useMutation({
    mutationFn: () => api("/businesses", { method: "POST", json: { ...form, type, currency: "NGN", track_stock: true, copy_settings_from: copyFrom } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["businesses"] }); toast.show("Business added", form.name); router.back(); },
    onError: (e: any) => toast.show(e.message),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-business-screen">
      <AppBar title="Add a business" close />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 8 }}>
          <Field label="Business name" placeholder="Adaeze Pharmacy" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} testID="business-name" />
          <Field label="TIN" placeholder="12345678-0001" value={form.tin} onChangeText={(v) => setForm({ ...form, tin: v })} testID="business-tin" />
          <Field label="Address" placeholder="14 Awolowo Way, Ikeja" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} testID="business-address" />
          <Field label="Phone" placeholder="+234 …" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} testID="business-phone" />
          <Field label="First shop" placeholder="Main branch" value={form.shop_name} onChangeText={(v) => setForm({ ...form, shop_name: v })} testID="business-shop" />
        </Card>
        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>What kind of business</Lbl>
        <Row style={{ gap: 6, flexWrap: "wrap" }}>
          {TYPES.map((t) => <Chip key={t} label={t} on={type === t} onPress={() => setType(t)} testID={`business-type-${t}`} />)}
        </Row>
        {(list.data?.businesses ?? []).length ? (
          <>
            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Copy settings from</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {list.data.businesses.map((b: any, i: number, arr: any[]) => (
                <Li key={b.id} last={i === arr.length - 1} testID={`business-copy-${b.id}`} onPress={() => setCopyFrom(copyFrom === b.id ? null : b.id)}>
                  <View style={{ flex: 1 }}><H4>{b.name}</H4><Sub>Categories, units, conditions of sale</Sub></View>
                  {copyFrom === b.id ? <Badge tone="paid">Copying</Badge> : null}
                </Li>
              ))}
            </Card>
          </>
        ) : null}
        <Sub style={{ marginTop: 12 }}>Nothing is shared between businesses — customers, stock and reports all stay separate.</Sub>
        <Btn label="Create business" style={{ marginTop: 14 }} disabled={!form.name.trim()} loading={save.isPending} testID="business-save" onPress={() => save.mutate()} />
      </ScrollView>
    </View>
  );
}
