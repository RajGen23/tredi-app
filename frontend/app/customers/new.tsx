// 03.5 Add customer — duplicate phone detection while typing.
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Card, Field, H4, Row, Sub, Switch } from "@/src/components/ui";
import { PickerField } from "@/src/components/picker";
import { useToast } from "@/src/components/sheet";
import { money, parseNum } from "@/src/format";
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
  // Arrives from the invoice flow — save the customer and go straight back to it.
  // With ?edit=<id> the same screen corrects an existing customer.
  const params = useLocalSearchParams<{ return?: string; edit?: string }>();
  const backToInvoice = params.return === "invoice";
  const editId = params.edit || "";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [opening, setOpening] = useState("");
  const [type, setType] = useState<"owes_me" | "i_owe">("owes_me");
  const [priceList, setPriceList] = useState("Retail");
  const [limitOn, setLimitOn] = useState(true);
  const [limit, setLimit] = useState("150000");
  const [loaded, setLoaded] = useState(false);
  const existing = useQuery({ queryKey: ["customers"], queryFn: () => api<any[]>("/customers") });
  const editQ = useQuery({ queryKey: ["customer", editId], queryFn: () => api(`/customers/${editId}`), enabled: !!editId });
  const dupe = useMemo(() => {
    const p = phone.replace(/\D/g, "");
    if (p.length < 7) return undefined;
    return existing.data?.find((c) => c.id !== editId && c.phone.replace(/\D/g, "").endsWith(p.slice(-9)));
  }, [phone, existing.data, editId]);

  useEffect(() => {
    const c: any = editQ.data;
    if (!c || loaded) return;
    setLoaded(true);
    setName(c.name ?? "");
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setAddress(c.address ?? "");
    setOpening(c.opening_balance ? String(c.opening_balance) : "");
    setType(c.opening_type === "i_owe" ? "i_owe" : "owes_me");
    setPriceList(c.price_list ?? "Retail");
    setLimitOn(c.credit_limit != null);
    setLimit(c.credit_limit != null ? String(c.credit_limit) : "150000");
  }, [editQ.data, loaded]);

  const m = useMutation({
    mutationFn: () => {
      const json = { name, phone, email, address, opening_balance: parseNum(opening), opening_type: type, price_list: priceList, credit_limit: limitOn ? parseNum(limit) : null };
      return editId ? api(`/customers/${editId}`, { method: "PUT", json }) : api("/customers", { method: "POST", json });
    },
    onSuccess: (c: any) => {
      ["customers", "customer", "customer-summary", "activity"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.show(`${c.name} ${editId ? "updated" : "added"}`, "Saved.");
      if (backToInvoice) router.replace({ pathname: "/invoices/new", params: { customer_id: c.id } });
      else router.replace(`/customers/${c.id}`);
    },
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-customer-screen">
      <AppBar title={editId ? "Edit customer" : "New customer"} close rightText={m.isPending ? "Saving…" : "Save"} onRightText={() => (name.trim() ? m.mutate() : null)} />
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
        <PickerField testID="customer-price-list" label="Price list" value={priceList}
          options={[{ key: "Retail", label: "Retail", sub: "Normal shelf price" }, { key: "Wholesale", label: "Wholesale", sub: "Bulk price where you set one" }]}
          onPick={setPriceList} title="Which prices does this customer get?" />
        <Card>
          <Row between>
            <View style={{ flex: 1 }}><H4>Credit limit</H4><Sub>{limitOn ? `Warn when unpaid goes past ${money(parseNum(limit))}` : "No limit — you will not be warned"}</Sub></View>
            <Switch testID="customer-credit-limit" on={limitOn} onChange={setLimitOn} />
          </Row>
          {limitOn ? (
            <Field label="Limit for this customer" value={limit} onChangeText={setLimit} keyboardType="decimal-pad" mono
              placeholder="150000" style={{ marginTop: 9 }} testID="customer-credit-limit-amount" />
          ) : null}
        </Card>
        {m.error ? <Text style={s.err} testID="customer-error">{(m.error as Error).message}</Text> : null}
      </KeyboardAwareScrollView>
    </View>
  );
}
