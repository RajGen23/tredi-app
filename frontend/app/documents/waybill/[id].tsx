// 13.2 Waybill — rides along with the invoice, prices off by default.
import { useEffect, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Field, H4, IconBtn, Lbl, Li, Loading, Money, Row, Sub, Switch } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { money, slashDate } from "@/src/format";
import { makeStyles } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

function waybillHtml(w: any) {
  const rows = w.lines.map((l: any) =>
    `<tr><td style="padding:6px 0">${l.name}</td><td style="text-align:right">${l.unit}</td><td style="text-align:right;font-family:monospace">${l.quantity}</td></tr>`).join("");
  return `<body style="font-family:Helvetica;padding:28px;color:#06241F">
    <h2 style="margin:0">${w.business?.name ?? ""}</h2>
    <p style="margin:2px 0 16px;color:#5C7570">Waybill ${w.number}${w.invoice_number ? ` · for ${w.invoice_number}` : ""} · ${slashDate(w.created_at)}</p>
    <p style="margin:0"><b>Deliver to</b> ${w.deliver_to}</p>
    <p style="margin:2px 0 16px">Driver ${w.driver} · Vehicle ${w.vehicle}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="color:#93A9A4;font-size:10px;text-transform:uppercase"><td>Item</td><td style="text-align:right">Unit</td><td style="text-align:right">Qty</td></tr>
      ${rows}
    </table>
    <p style="margin-top:18px"><b>Total packages</b> ${w.packages}</p>
    <p style="margin-top:40px">Received in good condition ______________________</p>
  </body>`;
}

export default function Waybill() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const isNew = id === "new";
  const [pickInvoice, setPickInvoice] = useState(false);
  const [form, setForm] = useState<any>({ invoice_id: null, customer_name: "", deliver_to: "", driver: "", vehicle: "", show_prices: false, lines: [] });

  const existing = useQuery({ queryKey: ["waybill", id], queryFn: () => api(`/waybills/${id}`), enabled: !isNew });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => api("/invoices"), enabled: isNew });
  const w = isNew ? null : existing.data;

  const save = useMutation({
    mutationFn: () => api("/waybills", { method: "POST", json: { ...form, status: "issued" } }),
    onSuccess: (r: any) => { qc.invalidateQueries(); toast.show("Waybill saved", r.number); router.replace(`/documents/waybill/${r.id}`); },
    onError: (e: any) => toast.show(e.message),
  });

  const print = async () => {
    if (!w) return;
    if (Platform.OS === "web") return Print.printAsync({ html: waybillHtml(w) });
    const { uri } = await Print.printToFileAsync({ html: waybillHtml(w) });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
  };

  if (!isNew && !w) return <View style={[s.root, { paddingTop: insets.top }]}><AppBar title="Waybill" back /><Loading /></View>;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="waybill-screen">
      <AppBar title="Waybill" back mono right={!isNew ? <IconBtn name="share-outline" testID="waybill-share" onPress={print} /> : undefined} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {isNew ? (
          <>
            <Card>
              <Row between>
                <View style={{ flex: 1 }}>
                  <Lbl>For invoice</Lbl>
                  <H4>{form.invoice_id ? `${form.invoice_number} · ${form.customer_name}` : "Not linked"}</H4>
                </View>
                <Btn label="Pick" variant="ghost" small testID="waybill-pick-invoice" onPress={() => setPickInvoice(true)} />
              </Row>
            </Card>
            <Card style={{ marginTop: 9, gap: 8 }}>
              <Field label="Deliver to" multiline placeholder="22 Ojuelegba Rd, Surulere, Lagos" value={form.deliver_to} onChangeText={(v) => setForm({ ...form, deliver_to: v })} testID="waybill-address" />
              <Field label="Driver" placeholder="Musa Bello" value={form.driver} onChangeText={(v) => setForm({ ...form, driver: v })} testID="waybill-driver" />
              <Field label="Vehicle" placeholder="LAG-442-XA" value={form.vehicle} onChangeText={(v) => setForm({ ...form, vehicle: v })} testID="waybill-vehicle" />
            </Card>
            {form.lines.length ? (
              <Card style={{ marginTop: 9, paddingVertical: 4 }}>
                {form.lines.map((l: any, i: number) => (
                  <Li key={i} last={i === form.lines.length - 1}>
                    <View style={{ flex: 1 }}><H4>{l.name}</H4><Sub>{l.unit}</Sub></View>
                    <Sub>{l.quantity}</Sub>
                  </Li>
                ))}
              </Card>
            ) : null}
            <Row between style={{ marginTop: 12 }}>
              <View style={{ flex: 1 }}><H4>Show prices on the waybill</H4><Sub>Off is normal for goods in transit</Sub></View>
              <Switch on={form.show_prices} onChange={(v) => setForm({ ...form, show_prices: v })} testID="waybill-prices" />
            </Row>
            <Btn label="Save waybill" style={{ marginTop: 14 }} disabled={!form.deliver_to.trim()} loading={save.isPending} testID="waybill-save" onPress={() => save.mutate()} />
          </>
        ) : (
          <>
            <Card>
              <Row between>
                <View style={{ flex: 1 }}>
                  <Sub>{w.invoice_number ? `For invoice ${w.invoice_number} · ${w.customer_name}` : w.customer_name || "Standalone waybill"}</Sub>
                  <H4 style={{ marginTop: 2 }}>Waybill no. {w.number}</H4>
                </View>
                <Badge tone="info">{w.status === "issued" ? "Issued" : "Draft"}</Badge>
              </Row>
            </Card>
            <Card style={{ marginTop: 9 }}>
              <Row between><Lbl>Date</Lbl><Sub>{slashDate(w.created_at)}</Sub></Row>
              <Row between style={{ marginTop: 8 }}><Lbl>Deliver to</Lbl><Sub style={{ flex: 1, textAlign: "right" }}>{w.deliver_to}</Sub></Row>
              <Row between style={{ marginTop: 8 }}><Lbl>Driver</Lbl><Sub>{w.driver}</Sub></Row>
              <Row between style={{ marginTop: 8 }}><Lbl>Vehicle</Lbl><Sub>{w.vehicle}</Sub></Row>
            </Card>
            <Card style={{ marginTop: 9, paddingVertical: 4 }}>
              {w.lines.map((l: any, i: number) => (
                <Li key={i} last={i === w.lines.length - 1}>
                  <Av icon="cube-outline" tone="sq" />
                  <View style={{ flex: 1 }}><H4>{l.name}</H4><Sub>{l.unit}</Sub></View>
                  <Sub>{l.quantity}</Sub>
                </Li>
              ))}
            </Card>
            <Row between style={{ marginTop: 12 }}><H4>Total packages</H4><Money>{w.packages}</Money></Row>
            <Row style={{ marginTop: 14, gap: 8 }}>
              <View style={{ flex: 1 }}><Btn label="Print" variant="ghost" small testID="waybill-print" onPress={print} /></View>
              <View style={{ flex: 1 }}><Btn label="New waybill" small variant="deep" testID="waybill-new" onPress={() => router.replace("/documents/waybill/new")} /></View>
            </Row>
          </>
        )}
      </ScrollView>

      <Sheet visible={pickInvoice} onClose={() => setPickInvoice(false)} testID="waybill-invoice-sheet">
        <H4>Which invoice is being delivered?</H4>
        {!invoices.data ? <Loading /> : invoices.data.filter((i: any) => i.status !== "draft").slice(0, 15).map((i: any, idx: number, arr: any[]) => (
          <Li key={i.id} last={idx === arr.length - 1} testID={`waybill-invoice-${i.id}`}
            onPress={() => {
              setForm({
                ...form, invoice_id: i.id, invoice_number: i.number, customer_name: i.customer_name,
                lines: i.lines.map((l: any) => ({ name: l.name, unit: l.unit || "Piece", quantity: l.quantity })),
              });
              setPickInvoice(false);
            }}>
            <View style={{ flex: 1 }}><H4>{i.number}</H4><Sub>{i.customer_name}</Sub></View>
            <Money>{money(i.totals.total)}</Money>
          </Li>
        ))}
      </Sheet>
    </View>
  );
}
