// SA.15 Global configuration — defaults for new tenants. Changing a default here
// must never rewrite a live tenant's tax rate.
import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import {
  AdminShell, Btn, Col, Fig, Input, Lbl, Loading, Note, Panel, Pill, Row, Sub, Table, useWide,
} from "@/src/admin/ui";
import { fonts, useTheme } from "@/src/theme";

export default function Configuration() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const qc = useQueryClient();
  const toast = useToast();
  const d = useQuery({ queryKey: ["admin-config"], queryFn: () => adminApi("/configuration") });
  const [draft, setDraft] = useState<any>(null);
  useEffect(() => { if (d.data && !draft) setDraft(d.data); }, [d.data, draft]);

  const save = useMutation({
    mutationFn: () => adminApi("/configuration", { method: "PUT", json: {
      tax_presets: draft.tax_presets, currency: draft.currency, invoice: draft.invoice,
      units: draft.units, categories: draft.categories, flags: draft.flags,
    } }),
    onSuccess: (res: any) => { toast.show(res.message, "Saved ·"); qc.invalidateQueries({ queryKey: ["admin-config"] }); },
    onError: (e: any) => toast.show(e.message),
  });

  const setInvoice = (k: string, v: any) => setDraft({ ...draft, invoice: { ...draft.invoice, [k]: v } });
  const setCurrency = (k: string, v: any) => setDraft({ ...draft, currency: { ...draft.currency, [k]: v } });

  const taxCols: Col<any>[] = [
    { key: "name", label: "Name", flex: 2, render: (r) => <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }}>{r.name}</Text> },
    { key: "rate", label: "Rate", flex: 0.8, align: "right", render: (r) => <Fig>{r.rate}%</Fig> },
    { key: "region", label: "Region", flex: 0.8, align: "right", render: (r) => <Pill label={r.region} tone="mut" /> },
    { key: "default", label: "Default", flex: 0.8, align: "right", render: (r) => (
      <Switch value={!!r.default} trackColor={{ true: colors.brandPrimary, false: colors.switchOff }}
        onValueChange={() => setDraft({ ...draft, tax_presets: draft.tax_presets.map((p: any) => ({ ...p, default: p.name === r.name })) })} />
    ) },
  ];

  return (
    <AdminShell title="Configuration" sub="Defaults for new tenants · existing ones keep their own"
      actions={<Btn label="Save changes" tone="primary" icon="save-outline" busy={save.isPending} onPress={() => save.mutate()} testID="config-save" />}
      testID="sa15-configuration">
      {!draft ? <Loading /> : (
        <>
          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <Panel style={{ flex: 1.4 }} pad={0} title="Tax presets" sub="Seeded on the first invoice a tenant raises">
              <Table cols={taxCols} rows={draft.tax_presets.map((p: any, i: number) => ({ ...p, id: String(i) }))} minWidth={480} />
            </Panel>
            <Panel style={{ flex: 1 }} title="Currency" sub="Fixed once a tenant raises their first invoice">
              <Row style={{ justifyContent: "space-between", paddingVertical: 5 }}><Lbl>Default</Lbl><Fig>₦ {draft.currency.default} — Naira</Fig></Row>
              <Row style={{ justifyContent: "space-between", paddingVertical: 5 }}>
                <Lbl>Symbol position</Lbl>
                <Btn label={draft.currency.symbol_position === "before" ? "Before amount" : "After amount"}
                  onPress={() => setCurrency("symbol_position", draft.currency.symbol_position === "before" ? "after" : "before")} testID="symbol-position" />
              </Row>
              <Row style={{ justifyContent: "space-between", paddingVertical: 5 }}>
                <Lbl>Decimals</Lbl>
                <Input value={String(draft.currency.decimals)} onChangeText={(v) => setCurrency("decimals", Number(v) || 0)} width={70} keyboardType="numeric" testID="decimals" />
              </Row>
              <Row style={{ justifyContent: "space-between", paddingVertical: 5 }}><Lbl>Thousands</Lbl><Fig>{draft.currency.thousands}</Fig></Row>
              <Sub style={{ marginTop: 8 }}>Enabled elsewhere: {draft.currency.enabled.join(", ")}.</Sub>
            </Panel>
          </View>

          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <Panel style={{ flex: 1 }} title="Invoice defaults" sub="New businesses start here and can change it">
              <Row style={{ justifyContent: "space-between", paddingVertical: 5 }}>
                <Lbl>Number format</Lbl>
                <Input value={draft.invoice.number_format} onChangeText={(v) => setInvoice("number_format", v)} width={130} testID="number-format" />
              </Row>
              <Row style={{ justifyContent: "space-between", paddingVertical: 5 }}>
                <Lbl>Default due terms</Lbl>
                <Input value={String(draft.invoice.due_terms_days)} onChangeText={(v) => setInvoice("due_terms_days", Number(v) || 0)} width={70} keyboardType="numeric" testID="due-terms" />
              </Row>
              <Row style={{ justifyContent: "space-between", paddingVertical: 5 }}>
                <Lbl>Show item photos</Lbl>
                <Switch value={!!draft.invoice.show_item_photos} onValueChange={(v) => setInvoice("show_item_photos", v)}
                  trackColor={{ true: colors.brandPrimary, false: colors.switchOff }} testID="switch-photos" />
              </Row>
              <Row style={{ justifyContent: "space-between", paddingVertical: 5 }}>
                <Lbl>TradaBooks mark in footer</Lbl>
                <Switch value={!!draft.invoice.tredi_footer} onValueChange={(v) => setInvoice("tredi_footer", v)}
                  trackColor={{ true: colors.brandPrimary, false: colors.switchOff }} />
              </Row>
              <Row style={{ justifyContent: "space-between", paddingVertical: 5 }}><Lbl>Paper sizes offered</Lbl><Fig>{draft.invoice.paper}</Fig></Row>
            </Panel>
            <Panel style={{ flex: 1 }} title="Units & categories" sub="Seeded for new businesses so the first item takes seconds">
              <Lbl>Units</Lbl>
              <Row gap={7} wrapped style={{ marginTop: 6 }}>{draft.units.map((u: string) => <Pill key={u} label={u} tone="mut" />)}</Row>
              <Lbl style={{ marginTop: 12 }}>Categories</Lbl>
              <Row gap={7} wrapped style={{ marginTop: 6 }}>{draft.categories.map((c: string) => <Pill key={c} label={c} tone="ok" />)}</Row>
            </Panel>
          </View>

          <Panel title="Feature flags" sub="Roll a feature to a percentage of tenants before everyone">
            {draft.flags.map((f: any, i: number) => (
              <Row key={f.name} style={{ justifyContent: "space-between", paddingVertical: 7 }}>
                <View style={{ flexShrink: 1 }}>
                  <Lbl>{f.name}</Lbl>
                  <Sub>{f.pct}% of tenants</Sub>
                </View>
                <Row gap={8}>
                  <Input value={String(f.pct)} onChangeText={(v) => setDraft({ ...draft, flags: draft.flags.map((x: any, j: number) => (j === i ? { ...x, pct: Number(v) || 0 } : x)) })} width={70} keyboardType="numeric" testID={`flag-${i}`} />
                  <Switch value={!!f.on} onValueChange={(v) => setDraft({ ...draft, flags: draft.flags.map((x: any, j: number) => (j === i ? { ...x, on: v } : x)) })}
                    trackColor={{ true: colors.brandPrimary, false: colors.switchOff }} />
                </Row>
              </Row>
            ))}
          </Panel>

          <Note tone="info" title="Existing businesses keep what they chose">
            {"Saving here changes the defaults handed to the next tenant that signs up. It never rewrites a live tenant's tax rate, currency or numbering."}
          </Note>
        </>
      )}
    </AdminShell>
  );
}
