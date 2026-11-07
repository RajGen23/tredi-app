// Invite someone — they join with an email and a starter password.
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

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Invite() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [role, setRole] = useState("sales");
  const [shops, setShops] = useState<string[]>([]);

  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api("/roles") });
  const shopList = useQuery({ queryKey: ["shops"], queryFn: () => api("/shops") });

  const save = useMutation({
    mutationFn: () => api("/team", { method: "POST", json: { ...form, role, shops } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast.show(r.emailed ? `Login details emailed to ${r.email}` : `Email could not be sent — ${r.name} signs in with ${r.password ?? form.password}`, "Invited");
      router.back();
    },
    onError: (e: any) => toast.show(e.message),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="invite-screen">
      <AppBar title="Invite someone" close />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 8 }}>
          <Field label="Name" placeholder="Amina Yusuf" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} testID="invite-name" />
          <Field label="Email" placeholder="amina@shop.com" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} testID="invite-email" />
          <Field label="Phone" placeholder="+234 …" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} testID="invite-phone" />
          <Field label="Starter password — optional" placeholder="Leave blank to create one and email it" value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} testID="invite-password" />
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Role</Lbl>
        <Card style={{ paddingVertical: 4 }}>
          {(roles.data?.roles ?? []).map((r: any, i: number, arr: any[]) => (
            <Li key={r.key} last={i === arr.length - 1} testID={`invite-role-${r.key}`} onPress={() => setRole(r.key)}>
              <View style={{ flex: 1 }}><H4>{r.label}</H4><Sub>{r.note}</Sub></View>
              {role === r.key ? <Badge tone="paid">Chosen</Badge> : null}
            </Li>
          ))}
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Shops they cover</Lbl>
        <Row style={{ gap: 6, flexWrap: "wrap" }}>
          {(shopList.data?.shops ?? []).map((sh: any) => (
            <Chip key={sh.name} label={sh.name} on={shops.includes(sh.name)} testID={`invite-shop-${sh.name}`}
              onPress={() => setShops(shops.includes(sh.name) ? shops.filter((x) => x !== sh.name) : [...shops, sh.name])} />
          ))}
        </Row>
        <Sub style={{ marginTop: 8 }}>Leave empty to give them every shop.</Sub>
        <Btn label="Send invite" style={{ marginTop: 14 }} disabled={!form.name.trim() || !form.email.trim()} loading={save.isPending} testID="invite-save" onPress={() => save.mutate()} />
      </ScrollView>
    </View>
  );
}
