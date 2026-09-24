// 00.4 Set up the business — TIN and address captured once.
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation } from "@tanstack/react-query";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Av, Btn, Card, Field, H4, Lbl, Sub, Switch } from "@/src/components/ui";
import { PickerField } from "@/src/components/picker";
import { CURRENCIES, setCurrency } from "@/src/format";
import { fonts, makeStyles } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  title: { fontFamily: fonts.extrabold, fontSize: 21, letterSpacing: -0.6, color: c.onSurface, marginVertical: 12 },
  err: { fontFamily: fonts.medium, fontSize: 12, color: c.coral, marginTop: 10, textAlign: "center" },
}));

export default function SetupBusiness() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState("Retail");
  const [tin, setTin] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [shop, setShop] = useState("Main branch");
  const [cur, setCur] = useState("NGN");
  const [track, setTrack] = useState(true);
  const [demo, setDemo] = useState(true);

  const m = useMutation({
    mutationFn: async () => {
      await api("/business", { method: "POST", json: { name, type, currency: cur, tin, address, phone, track_stock: track, shop_name: shop } });
      if (demo) await api("/seed/demo", { method: "POST" });
      setCurrency(cur);
      await refresh();
    },
    onSuccess: () => router.replace("/(tabs)"),
  });

  return (
    <View style={s.root} testID="setup-business-screen">
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24 }} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Lbl>Step 3 of 3</Lbl>
          <Sub>You can change all of this later</Sub>
        </View>
        <Text style={s.title}>Your business</Text>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Av icon="add" tone="sq" size={52} radiusOverride={14} />
            <Field testID="biz-name" label="Business name" value={name} onChangeText={setName} placeholder="Tredi Ventures" style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Field testID="biz-type" label="Type" value={type} onPress={() => setType(type === "Retail" ? "Wholesale" : type === "Wholesale" ? "Services" : "Retail")} style={{ flex: 1 }} right={<Sub>⌄</Sub>} />
            <PickerField label="Currency" testID="biz-currency" style={{ flex: 1 }} searchable title="Which currency do you sell in?"
              value={cur} options={CURRENCIES.map((c) => ({ key: c.code, label: `${c.symbol} ${c.code}`, sub: c.name }))} onPick={setCur} />
          </View>
          <Field testID="biz-tin" label="TIN" value={tin} onChangeText={setTin} placeholder="12345678-0001" mono />
          <Field testID="biz-address" label="Address on invoices" value={address} onChangeText={setAddress} placeholder="14 Awolowo Way, Ikeja, Lagos" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Field testID="biz-phone" label="Phone on invoices" value={phone} onChangeText={setPhone} placeholder="+234 …" keyboardType="phone-pad" mono style={{ flex: 1 }} />
            <Field testID="biz-shop" label="First shop" value={shop} onChangeText={setShop} style={{ flex: 1 }} />
          </View>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}><H4>Track stock quantities</H4><Sub>Turn off if you only sell services</Sub></View>
            <Switch testID="biz-track-stock" on={track} onChange={setTrack} />
          </Card>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}><H4>Start with sample data</H4><Sub>A few customers, items and invoices to explore. You can delete them later.</Sub></View>
            <Switch testID="biz-demo-data" on={demo} onChange={setDemo} />
          </Card>
        </View>
        {m.error ? <Text style={s.err} testID="biz-error">{(m.error as Error).message}</Text> : null}
        <Sub style={{ textAlign: "center", marginTop: 20, marginBottom: 9 }}>TIN and address are saved once and printed on every invoice.</Sub>
        <Btn testID="biz-submit" label="Start using TREDI" onPress={() => (name ? m.mutate() : null)} loading={m.isPending} disabled={!name} />
      </KeyboardAwareScrollView>
    </View>
  );
}
