// 13.2 Waybill — rides along with the invoice, on the same letterhead, with
// prices off by default. Raised straight from an invoice and linked back to it.
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Field, H4, IconBtn, Lbl, Li, Loading, Money, Row, Sub, Switch, Tag } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { buildWaybillHtml } from "@/src/invoice-templates";
import { pdfName, printHtml, sharePdf } from "@/src/pdf";
import { money, slashDate } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  mint: { backgroundColor: c.brandTertiary, borderColor: c.mint2 },
}));

export default function Waybill() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const { id, invoice_id } = useLocalSearchParams<{ id: string; invoice_id?: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const isNew = id === "new";
  const [pickInvoice, setPickInvoice] = useState(false);
  const [form, setForm] = useState<any>({ invoice_id: null, invoice_number: "", customer_name: "", deliver_to: "", driver: "", vehicle: "", show_prices: false, lines: [] });

  const existing = useQuery({ queryKey: ["waybill", id], queryFn: () => api(`/waybills/${id}`), enabled: !isNew });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => api<any[]>("/invoices"), enabled: isNew });
  const source = useQuery({ queryKey: ["invoice", invoice_id], queryFn: () => api(`/invoices/${invoice_id}`), enabled: isNew && !!invoice_id });
  const brand = useQuery({ queryKey: ["invoice-settings"], queryFn: () => api("/settings/invoice") });
  const w = isNew ? null : existing.data;

  const take = (i: any) => setForm((f: any) => ({
    ...f, invoice_id: i.id, invoice_number: i.number, customer_name: i.customer_name,
    deliver_to: f.deliver_to || i.customer_address || "",
    lines: (i.lines ?? []).map((l: any) => ({ name: l.name, unit: l.unit || "Piece", quantity: l.quantity, unit_price: l.unit_price ?? 0 })),
  }));

  // Raised from an invoice: it arrives filled in, so nobody retypes the load.
  useEffect(() => { if (source.data && !form.invoice_id) take(source.data); }, [source.data, form.invoice_id]);

  const save = useMutation({
    mutationFn: () => api("/waybills", { method: "POST", json: { ...form, status: "issued" } }),
    onSuccess: (r: any) => { qc.invalidateQueries(); toast.show("Waybill saved", r.number); router.replace(`/documents/waybill/${r.id}`); },
    onError: (e: any) => toast.show(e.message),
  });

  const html = () => buildWaybillHtml(w, {
    brand_color: (brand.data as any)?.brand_color, logo_url: (brand.data as any)?.logo_url,
    logo_size: (brand.data as any)?.logo_size, tredi_mark: (brand.data as any)?.tredi_mark,
  });
  const print = async () => { if (w) await printHtml(html()); };
  const share = async () => {
    if (!w) return;
    const res = await sharePdf(html(), pdfName([(w.business ?? {}).name, "Waybill", w.number]));
    if (!res.shared) toast.show("Sharing is not available on this device");
  };

  if (!isNew && !w) return <View style={[s.root, { paddingTop: insets.top }]}><AppBar title="Waybill" back /><Loading /></View>;

  const pickable = (invoices.data ?? []).filter((i: any) => !["draft", "cancelled"].includes(i.status));

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="waybill-screen">
      <AppBar title="Waybill" back mono right={!isNew ? <IconBtn name="share-outline" testID="waybill-share" onPress={share} /> : undefined} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        {isNew ? (
          <>
            <Card style={form.invoice_id ? s.mint : undefined} testID="waybill-invoice-card">
              <Row between>
                <View style={{ flex: 1 }}>
                  <Lbl>For invoice</Lbl>
                  <H4>{form.invoice_id ? `${form.invoice_number} · ${form.customer_name}` : "Not linked"}</H4>
                  <Sub style={{ marginTop: 2 }}>{form.invoice_id ? `${form.lines.length} line${form.lines.length === 1 ? "" : "s"} copied across` : "Pick one and the items come across on their own"}</Sub>
                </View>
                <Btn label={form.invoice_id ? "Change" : "Pick"} variant="ghost" small testID="waybill-pick-invoice" onPress={() => setPickInvoice(true)} />
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
                  <Sub>{w.customer_name || "Standalone waybill"}</Sub>
                  <H4 style={{ marginTop: 2 }}>Waybill no. {w.number}</H4>
                </View>
                <Badge tone="info">{w.status === "issued" ? "Issued" : "Draft"}</Badge>
              </Row>
            </Card>
            {w.invoice_id ? (
              <Li testID="waybill-open-invoice" onPress={() => router.push(`/invoices/${w.invoice_id}`)} style={{ marginTop: 4 }}>
                <Av icon="receipt-outline" tone="mint" />
                <View style={{ flex: 1 }}>
                  <H4>From invoice {w.invoice_number}</H4>
                  <Sub>{w.invoice_total ? `${money(w.invoice_total)} · tap to open it` : "Tap to open it"}</Sub>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
            ) : null}
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
                  {w.show_prices && l.unit_price ? <Money>{money(l.unit_price * l.quantity)}</Money> : <Sub>{l.quantity}</Sub>}
                </Li>
              ))}
            </Card>
            <Row between style={{ marginTop: 12 }}><H4>Total packages</H4><Money>{w.packages}</Money></Row>
            <Tag style={{ marginTop: 6 }}>Printed on your invoice letterhead — same logo and colour.</Tag>
            <Row style={{ marginTop: 14, gap: 8 }}>
              <View style={{ flex: 1 }}><Btn label="Print" variant="ghost" small testID="waybill-print" onPress={print} /></View>
              <View style={{ flex: 1 }}><Btn label="New waybill" small variant="deep" testID="waybill-new" onPress={() => router.replace("/documents/waybill/new")} /></View>
            </Row>
          </>
        )}
      </ScrollView>

      <Sheet visible={pickInvoice} onClose={() => setPickInvoice(false)} testID="waybill-invoice-sheet">
        <H4>Which invoice is being delivered?</H4>
        {!invoices.data ? <Loading /> : pickable.slice(0, 20).map((i: any, idx: number, arr: any[]) => (
          <Li key={i.id} last={idx === arr.length - 1} testID={`waybill-invoice-${i.id}`}
            onPress={() => { take(i); setPickInvoice(false); }}>
            <View style={{ flex: 1 }}><H4>{i.number}</H4><Sub>{i.customer_name}</Sub></View>
            <Money>{money(i.totals.total)}</Money>
          </Li>
        ))}
      </Sheet>
    </View>
  );
}
