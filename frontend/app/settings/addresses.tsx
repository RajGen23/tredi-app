// 00.5 Addresses & numbers — the details that print on documents.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, Field, H4, IconBtn, Lbl, Li, Loading, Row, Sub, Switch } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const KINDS: { key: "shop" | "billing" | "delivery" | "contact"; label: string }[] = [
  { key: "shop", label: "Shop" },
  { key: "billing", label: "Billing" },
  { key: "delivery", label: "Delivery" },
  { key: "contact", label: "Contact" },
];

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Addresses() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ label: string; address: string; phone: string; kind: "shop" | "billing" | "delivery" | "contact"; is_default: boolean }>({ label: "", address: "", phone: "", kind: "shop", is_default: false });
  const q = useQuery({ queryKey: ["addresses"], queryFn: () => api("/business/addresses") });

  const save = useMutation({
    mutationFn: () => api("/business/addresses", { method: "POST", json: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      setOpen(false);
      setForm({ label: "", address: "", phone: "", kind: "shop", is_default: false });
      toast.show("Saved");
    },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/business/addresses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["addresses"] }),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="addresses-screen">
      <AppBar title="Addresses & numbers" back right={<IconBtn name="add" testID="addresses-add" onPress={() => setOpen(true)} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        {!q.data ? <Loading /> : q.data.length === 0 ? (
          <Card>
            <Empty icon="location-outline" title="No addresses yet" sub="Add the shop, billing and delivery details that print on your documents."
              action={<Btn label="Add an address" testID="addresses-empty-add" onPress={() => setOpen(true)} />} />
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {q.data.map((a: any, i: number) => (
              <Li key={a.id} last={i === q.data.length - 1} testID={`address-${a.id}`} onPress={() => remove.mutate(a.id)}>
                <Av icon={a.kind === "contact" ? "call-outline" : "location-outline"} tone="sq" />
                <View style={{ flex: 1 }}>
                  <Row between><H4>{a.label}</H4>{a.is_default ? <Badge tone="paid">Default</Badge> : null}</Row>
                  <Sub>{a.address}{a.phone ? ` · ${a.phone}` : ""}</Sub>
                  <Sub style={{ fontSize: 10.5 }}>{KINDS.find((k) => k.key === a.kind)?.label}</Sub>
                </View>
              </Li>
            ))}
          </Card>
        )}
        <Sub style={{ marginTop: 12 }}>Tap a row to remove it.</Sub>
      </ScrollView>

      <Sheet visible={open} onClose={() => setOpen(false)} testID="address-sheet">
        <H4>New address</H4>
        <Row style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {KINDS.map((k) => <Chip key={k.key} label={k.label} on={form.kind === k.key} onPress={() => setForm({ ...form, kind: k.key })} testID={`address-kind-${k.key}`} />)}
        </Row>
        <Field label="Label" placeholder="Head office" value={form.label} onChangeText={(v) => setForm({ ...form, label: v })} testID="address-label" style={{ marginTop: 10 }} />
        <Field label="Address" multiline placeholder="14 Awolowo Way, Ikeja, Lagos" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} testID="address-address" style={{ marginTop: 8 }} />
        <Field label="Phone" placeholder="+234 803 442 1180" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} testID="address-phone" style={{ marginTop: 8 }} />
        <Row between style={{ marginTop: 12 }}>
          <View style={{ flex: 1 }}><H4>Use this by default</H4><Sub>For this kind of address</Sub></View>
          <Switch on={form.is_default} onChange={(v) => setForm({ ...form, is_default: v })} testID="address-default" />
        </Row>
        <Btn label="Save address" style={{ marginTop: 14 }} disabled={!form.label.trim()} loading={save.isPending} testID="address-save" onPress={() => save.mutate()} />
      </Sheet>
    </View>
  );
}
