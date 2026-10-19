// SA.7 Plans & pricing — changes apply on next renewal, never mid-cycle.
import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import { AdminModal, AdminShell, Btn, Col, Fig, H2, Input, Lbl, Loading, Note, Panel, Pill, Row, Sub, Table, useWide } from "@/src/admin/ui";
import { fonts, useTheme } from "@/src/theme";

const BLANK = { name: "", price: "", shops: "3", users: "9", storage: "10,000", businesses: "1" };

export default function Plans() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const set = (k: keyof typeof BLANK, v: string) => setForm({ ...form, [k]: v });
  const d = useQuery({ queryKey: ["admin-plans"], queryFn: () => adminApi("/plans") });
  const create = useMutation({
    mutationFn: () => adminApi("/plans", { method: "POST", json: { ...form, price: Number(form.price) || 0 } }),
    onSuccess: (res: any) => { toast.show(res.message, "Saved ·"); setOpen(false); setForm(BLANK); qc.invalidateQueries({ queryKey: ["admin-plans"] }); },
    onError: (e: any) => toast.show(e.message),
  });

  const cols: Col<any>[] = [
    { key: "feature", label: "Feature", flex: 2.4, render: (r) => <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }}>{r.feature}</Text> },
    ...["trial", "starter", "premium", "pro", "enterprise"].map((k) => ({
      key: k, label: k[0].toUpperCase() + k.slice(1), flex: 0.8, align: "right" as const,
      render: (r: any) => r[k]
        ? <Ionicons name="checkmark" size={15} color={colors.green700} />
        : <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.ink40 }}>—</Text>,
    })),
  ];

  return (
    <AdminShell title="Plans & pricing" sub="Changes apply on next renewal, never mid-cycle"
      actions={<Btn label="New plan" icon="add" tone="primary" onPress={() => setOpen(true)} testID="new-plan" />} testID="sa7-plans">
      {!d.data ? <Loading /> : (
        <>
          <View style={{ flexDirection: wide ? "row" : "column", flexWrap: "wrap", gap: 12 }}>
            {d.data.plans.map((p: any) => (
              <Panel key={p.key} style={{ flex: 1, minWidth: 190, borderColor: p.note ? colors.brandPrimary : colors.border }} testID={`plan-${p.key}`}>
                <Row style={{ justifyContent: "space-between" }}>
                  <H2>{p.name}</H2>
                  <Pill label={p.note || p.cadence} tone={p.note ? "ok" : "mut"} />
                </Row>
                <Fig size={24} style={{ marginTop: 8 }}>{p.price_label}</Fig>
                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 11 }} />
                {[["Locations", p.shops], ["Staff", p.users], ["Invoices", p.storage], ["Businesses", p.businesses]].map(([k, v]) => (
                  <Row key={k as string} style={{ justifyContent: "space-between", paddingVertical: 4 }}>
                    <Lbl>{k}</Lbl><Fig>{v}</Fig>
                  </Row>
                ))}
                <Sub style={{ marginTop: 10 }}>{p.count.toLocaleString()} on this plan</Sub>
              </Panel>
            ))}
          </View>
          <Panel pad={0} title="Feature gates" sub="Which plan unlocks what">
            <Table cols={cols} rows={d.data.gates.map((g: any, i: number) => ({ ...g, id: String(i) }))} minWidth={620} />
          </Panel>
          <Note tone="info" title="Offline and backup are on every plan, including trial">
            {"Gating the feature that protects a trader's data would be the wrong thing to sell against."}
          </Note>
          <AdminModal visible={open} onClose={() => setOpen(false)} title="New plan"
            sub="Saved as a draft. It goes live on the next renewal cycle, never mid-cycle." testID="plan-modal"
            footer={<Row gap={8}>
              <Btn label="Cancel" onPress={() => setOpen(false)} />
              <Btn label="Save plan" tone="primary" busy={create.isPending} onPress={() => create.mutate()} testID="plan-save" />
            </Row>}>
            <View style={{ gap: 10 }}>
              <Lbl>Name</Lbl>
              <Input value={form.name} onChangeText={(v) => set("name", v)} placeholder="Growth" testID="plan-name" />
              <Lbl>Price per month (₦)</Lbl>
              <Input value={form.price} onChangeText={(v) => set("price", v.replace(/\D/g, ""))} placeholder="25000" keyboardType="numeric" testID="plan-price" />
              <Row gap={8}>
                <View style={{ flex: 1, gap: 6 }}><Lbl>Locations</Lbl><Input value={form.shops} onChangeText={(v) => set("shops", v)} testID="plan-shops" /></View>
                <View style={{ flex: 1, gap: 6 }}><Lbl>Staff</Lbl><Input value={form.users} onChangeText={(v) => set("users", v)} testID="plan-users" /></View>
              </Row>
              <Row gap={8}>
                <View style={{ flex: 1, gap: 6 }}><Lbl>Invoices</Lbl><Input value={form.storage} onChangeText={(v) => set("storage", v)} testID="plan-storage" /></View>
                <View style={{ flex: 1, gap: 6 }}><Lbl>Businesses</Lbl><Input value={form.businesses} onChangeText={(v) => set("businesses", v)} testID="plan-businesses" /></View>
              </Row>
            </View>
          </AdminModal>
        </>
      )}
    </AdminShell>
  );
}
