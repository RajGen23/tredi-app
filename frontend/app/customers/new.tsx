// 03.5 Add customer — duplicate phone detection while typing.
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Card, Field, H4, Sub, Switch } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { parseNum } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  warn: { backgroundColor: c.warning, borderColor: "#F3E2BE", paddingVertical: 9 },
  err: { fontFamily: fonts.medium, fontSize: 12, color: c.coral },
}));

export default function NewCustomer() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [opening, setOpening] = useState("");
  const [type, setType] = useState<"owes_me" | "i_owe">("owes_me");
  const [priceList, setPriceList] = useState("Retail");
  const [limitOn, setLimitOn] = useState(true);
  const existing = useQuery({ queryKey: ["customers"], queryFn: () => api<any[]>("/customers") });
  const dupe = useMemo(() => {
    const p = phone.replace(/\D/g, "");
    return p.length >= 7 ? existing.data?.find((c) => c.phone.replace(/\D/g, "").endsWith(p.slice(-9))) : undefined;
  }, [phone, existing.data]);

  const m = useMutation({
    mutationFn: () => api("/customers", { method: "POST", json: { name, phone, email, address, opening_balance: parseNum(opening), opening_type: type, price_list: priceList, credit_limit: limitOn ? 150000 : null } }),
    onSuccess: (c: any) => { qc.invalidateQueries({ queryKey: ["customers"] }); toast.show(`${c.name} added`, "Saved."); router.replace(`/customers/${c.id}`); },
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-customer-screen">
      <AppBar title="New customer" close rightText={m.isPending ? "Saving…" : "Save"} onRightText={() => (name.trim() ? m.mutate() : null)} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24, gap: 10 }} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Field testID="customer-name" label="Name" value={name} onChangeText={setName} placeholder="Kunle Stores" autoFocus autoCapitalize="words" />
        <Field testID="customer-phone" label="Phone" value={phone} onChangeText={setPhone} placeholder="+234 706 118 9002" keyboardType="phone-pad" mono />
        {dupe ? (
          <Card style={s.warn} testID="customer-duplicate-warning">
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ color: colors.amber, fontFamily: fonts.bold }}>!</Text>
              <Sub style={{ flex: 1 }}>A customer with this phone already exists — <Text style={{ fontFamily: fonts.bold }}>{dupe.name}</Text>. <Text style={{ color: colors.deep, fontFamily: fonts.bold, textDecorationLine: "underline" }} onPress={() => router.replace(`/customers/${dupe.id}`)}>Open it instead?</Text></Sub>
            </View>
          </Card>
        ) : null}
        <Field testID="customer-email" label="Email — optional" value={email} onChangeText={setEmail} placeholder="Add email" keyboardType="email-address" autoCapitalize="none" />
        <Field testID="customer-address" label="Address" value={address} onChangeText={setAddress} placeholder="Add billing address" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Field testID="customer-opening" label="Opening balance" value={opening} onChangeText={setOpening} placeholder="0.00" keyboardType="decimal-pad" mono style={{ flex: 1 }} />
          <Field testID="customer-opening-type" label="Type" value={type === "owes_me" ? "Owes me" : "I owe them"} onPress={() => setType(type === "owes_me" ? "i_owe" : "owes_me")} right={<Sub>⌄</Sub>} style={{ flex: 1 }} />
        </View>
        <Field testID="customer-price-list" label="Price list" value={priceList} onPress={() => setPriceList(priceList === "Retail" ? "Wholesale" : "Retail")} right={<Sub>⌄</Sub>} />
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}><H4>Credit limit</H4><Sub>Warn when unpaid goes past ₦ 150,000</Sub></View>
          <Switch testID="customer-credit-limit" on={limitOn} onChange={setLimitOn} />
        </Card>
        {m.error ? <Text style={s.err} testID="customer-error">{(m.error as Error).message}</Text> : null}
      </KeyboardAwareScrollView>
    </View>
  );
}
