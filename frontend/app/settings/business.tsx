// 04.2b Business profile — the details that head every invoice: name, TIN,
// country, the phone numbers and email addresses customers should use, and the
// registered address. Shops, addresses and the team live one tap away.
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Btn, Card, Chip, Field, H4, Lbl, Li, Loading, Row, Sub } from "@/src/components/ui";
import { PickerField } from "@/src/components/picker";
import { useToast } from "@/src/components/sheet";
import { CURRENCIES, setCurrency } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const COUNTRIES = [
  { key: "NG", label: "Nigeria", currency: "NGN" },
  { key: "GH", label: "Ghana", currency: "GHS" },
  { key: "KE", label: "Kenya", currency: "KES" },
  { key: "ZA", label: "South Africa", currency: "ZAR" },
  { key: "TZ", label: "Tanzania", currency: "TZS" },
  { key: "UG", label: "Uganda", currency: "UGX" },
  { key: "RW", label: "Rwanda", currency: "RWF" },
  { key: "ZM", label: "Zambia", currency: "ZMW" },
  { key: "CI", label: "Côte d’Ivoire", currency: "XOF" },
  { key: "CM", label: "Cameroon", currency: "XAF" },
  { key: "EG", label: "Egypt", currency: "EGP" },
  { key: "GB", label: "United Kingdom", currency: "GBP" },
  { key: "US", label: "United States", currency: "USD" },
  { key: "CA", label: "Canada", currency: "CAD" },
  { key: "IN", label: "India", currency: "INR" },
  { key: "OT", label: "Somewhere else", currency: "USD" },
];

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function BusinessProfile() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["business"], queryFn: () => api<any>("/business") });
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (q.data && !f) setF({ ...q.data, phones: q.data.phones ?? [], emails: q.data.emails ?? [] }); }, [q.data, f]);

  const save = useMutation({
    mutationFn: () => api("/business", { method: "PUT", json: {
      name: f.name, type: f.type ?? "Retail", currency: f.currency ?? "NGN", country: f.country ?? "NG",
      tin: f.tin ?? "", address: f.address ?? "", phone: f.phone ?? "", email: f.email ?? "",
      phones: (f.phones ?? []).filter((x: string) => x.trim()), emails: (f.emails ?? []).filter((x: string) => x.trim()),
    } }),
    onSuccess: () => {
      setCurrency(f.currency ?? "NGN");
      qc.invalidateQueries();
      toast.show("Profile saved — it heads every invoice", "Saved");
    },
    onError: (e: any) => toast.show(e.message),
  });

  if (!f) return <View style={[s.root, { paddingTop: insets.top }]}><AppBar title="Business profile" back /><Loading /></View>;

  const list = (key: "phones" | "emails", label: string, placeholder: string) => (
    <>
      <Lbl style={{ marginTop: 14, marginBottom: 6 }}>{label}</Lbl>
      <Card>
        {(f[key] as string[]).map((v, i) => (
          <Row key={i} style={{ gap: 8, marginBottom: 8 }}>
            <Field value={v} placeholder={placeholder} style={{ flex: 1 }} testID={`${key}-${i}`}
              keyboardType={key === "phones" ? "phone-pad" : "email-address"}
              onChangeText={(t) => setF({ ...f, [key]: (f[key] as string[]).map((x, j) => (j === i ? t : x)) })} />
            <Pressable testID={`${key}-remove-${i}`} hitSlop={8} style={{ paddingTop: 16 }}
              onPress={() => setF({ ...f, [key]: (f[key] as string[]).filter((_, j) => j !== i) })}>
              <Ionicons name="close-circle" size={20} color={colors.ink40} />
            </Pressable>
          </Row>
        ))}
        <Chip label={`＋ Add ${key === "phones" ? "another number" : "another email"}`} testID={`${key}-add`}
          onPress={() => setF({ ...f, [key]: [...(f[key] as string[]), ""] })} />
      </Card>
    </>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="business-profile-screen">
      <AppBar title="Business profile" back rightText="Save" onRightText={() => save.mutate()} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        <Lbl style={{ marginBottom: 6 }}>Registered details</Lbl>
        <Card>
          <Field label="Business name" value={f.name ?? ""} onChangeText={(v) => setF({ ...f, name: v })} testID="profile-name" />
          <Field label="Tax ID (TIN)" value={f.tin ?? ""} onChangeText={(v) => setF({ ...f, tin: v })} placeholder="12345678-0001" mono style={{ marginTop: 8 }} testID="profile-tin" />
          <Row style={{ gap: 8, marginTop: 8 }}>
            <PickerField label="Country" style={{ flex: 1 }} testID="profile-country" searchable
              value={f.country ?? "NG"}
              options={COUNTRIES.map((c) => ({ key: c.key, label: c.label }))}
              onPick={(key) => {
                const c = COUNTRIES.find((x) => x.key === key);
                setF({ ...f, country: key, currency: c?.currency ?? f.currency });
              }} />
            <PickerField label="Currency" style={{ flex: 1 }} testID="profile-currency" searchable title="Which currency do you sell in?"
              value={f.currency ?? "NGN"}
              options={CURRENCIES.map((c) => ({ key: c.code, label: `${c.symbol} ${c.code}`, sub: c.name }))}
              onPick={(code) => setF({ ...f, currency: code })} />
          </Row>
          <Sub style={{ marginTop: 6 }}>Every amount in the app, on your invoices and on your receipts prints in this currency.</Sub>
          <Field label="Registered address" value={f.address ?? ""} onChangeText={(v) => setF({ ...f, address: v })} multiline style={{ marginTop: 8 }} testID="profile-address" />
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Main contact</Lbl>
        <Card>
          <Field label="Phone" value={f.phone ?? ""} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" testID="profile-phone" />
          <Field label="Email" value={f.email ?? ""} onChangeText={(v) => setF({ ...f, email: v })} keyboardType="email-address" style={{ marginTop: 8 }} testID="profile-email" />
        </Card>

        {list("phones", "Other phone numbers", "+234 802 000 0000")}
        {list("emails", "Other email addresses", "accounts@business.com")}

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Also under this business</Lbl>
        <Card style={{ paddingVertical: 2 }}>
          <Li testID="profile-shops" onPress={() => router.push("/shops")}>
            <Av icon="storefront-outline" tone="mint" /><View style={{ flex: 1 }}><H4>Shops & locations</H4><Sub>Each shop keeps its own stock and terms</Sub></View>
            <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
          </Li>
          <Li testID="profile-addresses" onPress={() => router.push("/settings/addresses")}>
            <Av icon="location-outline" tone="mint" /><View style={{ flex: 1 }}><H4>Delivery addresses</H4><Sub>Used on invoices and waybills</Sub></View>
            <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
          </Li>
          <Li last testID="profile-team" onPress={() => router.push("/team")}>
            <Av icon="people-outline" tone="mint" /><View style={{ flex: 1 }}><H4>Sales reps & team</H4><Sub>{"The rep's name prints in the From block"}</Sub></View>
            <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
          </Li>
        </Card>

        <Btn label="Save profile" style={{ marginTop: 16 }} loading={save.isPending} onPress={() => save.mutate()} testID="profile-save" />
      </KeyboardAwareScrollView>
    </View>
  );
}
