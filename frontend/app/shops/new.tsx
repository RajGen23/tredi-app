// Add a shop — or a warehouse, which is the same thing with sales turned off.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Btn, Card, Field, H4, Row, Sub, Switch } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function NewShop() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [sells, setSells] = useState(true);

  const save = useMutation({
    mutationFn: () => api("/shops", { method: "POST", json: { ...form, sells, is_main: false } }),
    onSuccess: () => { qc.invalidateQueries(); toast.show("Shop added", form.name); router.back(); },
    onError: (e: any) => toast.show(e.message),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-shop-screen">
      <AppBar title="Add a shop" close />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 8 }}>
          <Field label="Shop name" placeholder="Surulere" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} testID="shop-name" />
          <Field label="Address" placeholder="22 Ojuelegba Rd, Lagos" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} testID="shop-address" />
          <Field label="Phone" placeholder="+234 …" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} testID="shop-phone" />
        </Card>
        <Card style={{ marginTop: 9 }}>
          <Row between>
            <View style={{ flex: 1 }}><H4>Sells to customers</H4><Sub>Turn off for a warehouse that only holds stock</Sub></View>
            <Switch on={sells} onChange={setSells} testID="shop-sells" />
          </Row>
        </Card>
        <Btn label="Save shop" style={{ marginTop: 14 }} disabled={!form.name.trim()} loading={save.isPending} testID="shop-save" onPress={() => save.mutate()} />
      </ScrollView>
    </View>
  );
}
