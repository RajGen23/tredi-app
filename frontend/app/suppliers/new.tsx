// Add a supplier — name and phone are enough to start.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Btn, Card, Field, Lbl, Row, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { parseNum } from "@/src/format";
import { makeStyles } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function NewSupplier() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", category: "", opening_balance: "" });
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => api("/suppliers", { method: "POST", json: { ...form, category: form.category || "General", opening_balance: parseNum(form.opening_balance) } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.show("Supplier saved", r.name);
      router.replace(`/suppliers/${r.id}`);
    },
    onError: (e: any) => toast.show(e.message),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-supplier-screen">
      <AppBar title="New supplier" close />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 8 }}>
          <Field label="Supplier name" placeholder="Ade Foods Ltd" value={form.name} onChangeText={set("name")} testID="supplier-name" />
          <Field label="Phone" placeholder="+234 802 771 4400" keyboardType="phone-pad" value={form.phone} onChangeText={set("phone")} testID="supplier-phone" />
          <Field label="What they supply" placeholder="Grains" value={form.category} onChangeText={set("category")} testID="supplier-category" />
          <Field label="Address" placeholder="Ikeja, Lagos" value={form.address} onChangeText={set("address")} testID="supplier-address" />
          <Field label="Opening balance you owe" placeholder="0" keyboardType="numeric" mono value={form.opening_balance} onChangeText={set("opening_balance")} testID="supplier-opening" />
        </Card>
        <Sub style={{ marginTop: 10 }}>Purchases raise stock and what you owe in one entry.</Sub>
        <Btn label="Save supplier" style={{ marginTop: 14 }} disabled={!form.name.trim()} loading={save.isPending} testID="supplier-save" onPress={() => save.mutate()} />
      </ScrollView>
    </View>
  );
}
