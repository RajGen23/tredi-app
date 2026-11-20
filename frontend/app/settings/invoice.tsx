// 04.10 Invoice settings — set once, applied to every invoice.
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Check, Field, H4, Lbl, Li, Loading, Row, Seg, Sub, Switch } from "@/src/components/ui";
import { AddAccountSheet } from "@/src/components/account-form";
import { useToast } from "@/src/components/sheet";
import { parseNum } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function InvoiceSettings() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["invoice-settings"], queryFn: () => api("/settings/invoice") });
  const [f, setF] = useState<any>(null);
  const [newCondition, setNewCondition] = useState("");
  const [addAccount, setAddAccount] = useState(false);
  useEffect(() => { if (q.data && !f) setF(q.data); }, [q.data]);

  const save = useMutation({
    mutationFn: () => api("/settings/invoice", {
      method: "PUT",
      json: {
        prefix: f.prefix, next_number: parseNum(String(f.next_number)), vat_rate: parseNum(String(f.vat_rate)), vat_on: f.vat_on,
        due_days: parseNum(String(f.due_days)), conditions: f.conditions, show_photos: f.show_photos, tredi_mark: f.tredi_mark,
        print_format: f.print_format, default_bank_account_id: f.default_bank_account_id, attach_terms: f.attach_terms, footer: f.footer,
      },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoice-settings"] }); toast.show("Applied to every invoice", "Saved"); },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  if (!f) return <View style={[s.root, { paddingTop: insets.top }]}><AppBar title="Invoice settings" back /><Loading /></View>;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="invoice-settings-screen">
      <AppBar title="Invoice settings" back rightText="Save" onRightText={() => save.mutate()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        <Lbl style={{ marginBottom: 6 }}>Numbering</Lbl>
        <Card style={{ gap: 8 }}>
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Prefix" value={f.prefix} onChangeText={(v) => setF({ ...f, prefix: v })} testID="settings-prefix" /></View>
            <View style={{ flex: 1 }}><Field label="Next number" keyboardType="numeric" mono value={String(f.next_number)} onChangeText={(v) => setF({ ...f, next_number: v })} testID="settings-next-number" /></View>
          </Row>
          <Field label="Payment due in (days)" keyboardType="numeric" mono value={String(f.due_days)} onChangeText={(v) => setF({ ...f, due_days: v })} testID="settings-due-days" />
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>VAT</Lbl>
        <Card>
          <Row between>
            <View style={{ flex: 1 }}><H4>Charge VAT</H4><Sub>Applied after line and invoice discounts</Sub></View>
            <Switch on={f.vat_on} onChange={(v) => setF({ ...f, vat_on: v })} testID="settings-vat-on" />
          </Row>
          {f.vat_on ? <Field label="Rate %" keyboardType="numeric" mono value={String(f.vat_rate)} onChangeText={(v) => setF({ ...f, vat_rate: v })} testID="settings-vat-rate" style={{ marginTop: 8 }} /> : null}
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Bank accounts on invoices</Lbl>
        <Card style={{ paddingVertical: 4 }}>
          {(f.accounts ?? []).map((a: any, i: number) => (
            <Li key={a.id} last={i === f.accounts.length - 1} testID={`settings-account-${a.id}`} onPress={() => setF({ ...f, default_bank_account_id: a.id })}>
              <Av icon="card-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>{a.name}</H4><Sub>{a.detail || a.kind}</Sub></View>
              {f.default_bank_account_id === a.id ? <Badge tone="paid">Default</Badge> : null}
            </Li>
          ))}
          <Li last testID="settings-add-account" onPress={() => setAddAccount(true)}>
            <Av icon="add" tone="green" />
            <View style={{ flex: 1 }}><H4>Add an account</H4><Sub>Bank, cash till or mobile money — it prints on invoices</Sub></View>
            <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
          </Li>
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Conditions of sale</Lbl>
        <Card>
          {(f.conditions ?? []).map((c: any, i: number) => (
            <Row key={i} style={{ gap: 10, paddingVertical: 7 }}>
              <View onTouchEnd={() => {
                const next = [...f.conditions];
                next[i] = { ...c, on: !c.on };
                setF({ ...f, conditions: next });
              }} testID={`settings-condition-${i}`}>
                <Check on={c.on} />
              </View>
              <Sub style={{ flex: 1 }}>{c.text}</Sub>
            </Row>
          ))}
          <Field label="Write a new condition" placeholder="Deposit is non-refundable." value={newCondition} onChangeText={setNewCondition} testID="settings-new-condition" style={{ marginTop: 8 }} />
          <Btn label="Add condition" variant="ghost" small style={{ marginTop: 8 }} disabled={!newCondition.trim()} testID="settings-add-condition"
            onPress={() => { setF({ ...f, conditions: [...f.conditions, { text: newCondition.trim(), on: true }] }); setNewCondition(""); }} />
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Documents</Lbl>
        <Card>
          <Row between><View style={{ flex: 1 }}><H4>Attach terms by default</H4><Sub>On invoices and quotations</Sub></View>
            <Switch on={f.attach_terms} onChange={(v) => setF({ ...f, attach_terms: v })} testID="settings-attach-terms" /></Row>
          <Row between style={{ marginTop: 12 }}><View style={{ flex: 1 }}><H4>Show item photos</H4>
            <Sub>{f.photos_allowed === false ? `${f.plan_name ?? "Your plan"} does not print photos — upgrade in Plan & billing` : "Can be switched off per invoice"}</Sub></View>
            <Switch on={f.show_photos && f.photos_allowed !== false} onChange={f.photos_allowed === false ? undefined : (v) => setF({ ...f, show_photos: v })} testID="settings-show-photos" /></Row>
          <Row between style={{ marginTop: 12 }}><View style={{ flex: 1 }}><H4>TradaBooks mark on invoices</H4><Sub>Appears in the footer of every document</Sub></View>
            <Switch on={f.tredi_mark} onChange={(v) => setF({ ...f, tredi_mark: v })} testID="settings-tredi-mark" /></Row>
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Default print format</Lbl>
        <Seg testID="settings-print-format" value={f.print_format} onChange={(v) => setF({ ...f, print_format: v })}
          options={[{ key: "a4", label: "A4 PDF" }, { key: "80mm", label: "80mm" }, { key: "58mm", label: "58mm" }]} />

        <Li last testID="settings-templates" style={{ marginTop: 14 }} onPress={() => router.push("/settings/invoice-template")}>
          <Av icon="color-palette-outline" tone="green" />
          <View style={{ flex: 1 }}><H4>Invoice templates</H4><Sub>Logo, brand colour and the six layouts</Sub></View>
          <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
        </Li>

        <Li last testID="settings-terms" style={{ marginTop: 14 }} onPress={() => router.push("/settings/terms")}>
          <Av icon="document-text-outline" tone="sq" />
          <View style={{ flex: 1 }}><H4>Terms of payment</H4><Sub>{f.terms_sets} saved set{f.terms_sets === 1 ? "" : "s"}</Sub></View>
          <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
        </Li>

        <Btn label="Save settings" style={{ marginTop: 16 }} loading={save.isPending} testID="settings-save" onPress={() => save.mutate()} />
      </ScrollView>
      <AddAccountSheet visible={addAccount} onClose={() => setAddAccount(false)}
        onCreated={(a) => setF((cur: any) => ({ ...cur, accounts: [...(cur.accounts ?? []), a], default_bank_account_id: cur.default_bank_account_id || a.id }))} />
    </View>
  );
}
