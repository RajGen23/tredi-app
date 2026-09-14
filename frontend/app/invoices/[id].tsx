// 04.6 Invoice detail — teal top, amount due hero, items, actions.
import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Divider, H4, IconBtn, Li, Lbl, Loading, Money, Prog, Row, Sub, Switch, Tag } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { initials, longDate, money, shortDate, statusLabel } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  phone: { fontFamily: fonts.mono, fontSize: 12, color: c.ink60 },
}));

export default function InvoiceDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [repeat, setRepeat] = useState(false);
  const [usePrices, setUsePrices] = useState(true);
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api(`/invoices/${id}`) });
  const preview = useQuery({ queryKey: ["duplicate", id, usePrices], queryFn: () => api(`/invoices/${id}/duplicate?update_prices=${usePrices}`), enabled: repeat });
  const issueRepeat = useMutation({
    mutationFn: () => api(`/invoices/${id}/duplicate`, { method: "POST", json: { update_prices: usePrices, issue: true } }),
    onSuccess: (inv: any) => {
      ["invoices", "invoice", "customers", "items", "dashboard", "activity"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setRepeat(false);
      toast.show(`${inv.number} raised for ${money(inv.totals.total)}`, "Repeat");
      router.replace(`/invoices/${inv.id}`);
    },
    onError: (e: any) => toast.show(e.message),
  });
  const inv = q.data;
  const over = inv?.status === "overdue";
  const paidPct = inv ? (inv.paid / inv.totals.total) * 100 : 0;

  return (
    <View style={s.root} testID="invoice-detail-screen">
      <View style={[s.teal, { height: insets.top + 132 }]} />
      <View style={{ paddingTop: insets.top }}>
        <AppBar teal back mono title={inv?.number ?? "Invoice"} right={<IconBtn teal name="copy-outline" testID="invoice-more" onPress={() => setRepeat(true)} />} />
      </View>
      {!inv ? <Card style={{ marginHorizontal: 14 }}><Loading /></Card> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24 }}>
          <Card>
            <Row between>
              <Badge tone={over ? "over" : inv.status === "paid" ? "paid" : inv.status === "draft" ? "draft" : "due"}>{statusLabel(inv)}</Badge>
              <Tag>Issued {shortDate(inv.created_at)}{inv.due_date ? ` · due ${shortDate(inv.due_date)}` : ""}</Tag>
              {inv.duplicated_from_number ? <Badge tone="info">Repeat of {inv.duplicated_from_number}</Badge> : null}
            </Row>
            <Row between style={{ marginTop: 9, alignItems: "flex-end" }}>
              <View><Lbl>Amount due</Lbl><Money tone={inv.due > 0 ? "neg" : "pos"} size={22} testID="invoice-amount-due">{money(inv.due)}</Money></View>
              <View style={{ alignItems: "flex-end" }}><Lbl>Invoice total</Lbl><Money>{money(inv.totals.total)}</Money><Tag style={inv.paid ? { color: colors.green700 } : { color: colors.coral }}>{inv.paid ? `Paid ${money(inv.paid)}` : "Nothing paid yet"}</Tag></View>
            </Row>
            <View style={{ marginTop: 9 }}><Prog pct={Math.max(3, paidPct)} tone={over ? "bad" : undefined} /></View>
            <Divider />
            <Row>
              <Av text={initials(inv.customer_name)} />
              <View style={{ flex: 1 }}><H4>{inv.customer_name}</H4>{inv.customer_phone ? <Sub style={s.phone}>{inv.customer_phone}</Sub> : null}</View>
              {inv.customer_phone ? <IconBtn name="call-outline" testID="invoice-call-customer" onPress={() => Linking.openURL(`tel:${inv.customer_phone.replace(/\s/g, "")}`)} /> : null}
            </Row>
          </Card>
          {inv.due > 0 ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
              <Btn small variant="ghost" label="Record payment" style={{ flex: 1 }} testID="invoice-record-payment" onPress={() => router.push({ pathname: "/payments/new", params: { customer_id: inv.customer_id, invoice_id: inv.id } })} />
              <Btn small variant="deep" label="Send reminder" style={{ flex: 1 }} testID="invoice-send-reminder" onPress={() => router.push(`/invoices/reminder/${id}`)} />
            </View>
          ) : null}
          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            {inv.lines.map((l: any, i: number) => (
              <Li key={i} last={i === inv.lines.length - 1 && !inv.totals.invoice_discount && !inv.totals.vat}>
                <View style={{ flex: 1 }}><H4>{l.name}{l.quick_add ? <Tag>  · quick add</Tag> : null}</H4><Tag>{l.quantity} × {money(l.unit_price, { symbol: false })}{l.discount ? ` · − ${money(l.discount, { symbol: false })}` : ""}</Tag>{l.note ? <Sub>{l.note}</Sub> : null}</View>
                <Money>{money(l.total, { symbol: false })}</Money>
              </Li>
            ))}
            {inv.totals.invoice_discount ? <Li><View style={{ flex: 1 }}><H4>Less discount</H4><Tag>On whole invoice</Tag></View><Money tone="pos">− {money(inv.totals.invoice_discount, { symbol: false })}</Money></Li> : null}
            {inv.totals.vat ? <Li last><View style={{ flex: 1 }}><H4>VAT {inv.vat_rate}%</H4><Tag>On {money(inv.totals.taxable, { symbol: false })}</Tag></View><Money>{money(inv.totals.vat, { symbol: false })}</Money></Li> : null}
          </Card>
          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            <Li testID="invoice-view-pdf" onPress={() => router.push(`/invoices/pdf/${id}`)}>
              <Av icon="share-outline" tone="sq" /><View style={{ flex: 1 }}><H4>View PDF</H4><Sub>Preview, download, share on WhatsApp</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            <Li testID="invoice-duplicate" onPress={() => setRepeat(true)}>
              <Av icon="copy-outline" tone="sq" />
              <View style={{ flex: 1 }}>
                <H4>Duplicate this invoice</H4>
                <Sub>{inv.duplicate_count ? `Repeated ${inv.duplicate_count}× already` : "For a repeat purchase of the same basket"}</Sub>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            <Li testID="invoice-waybill" onPress={() => router.push("/documents/waybill/new")}><Av icon="cube-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Waybill</H4><Sub>Driver, vehicle and packages</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} /></Li>
            <Li last testID="invoice-activity" onPress={() => router.push(`/history/${id}`)}><Av icon="time-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Activity & payments</H4><Sub>{inv.payments.length} payment{inv.payments.length === 1 ? "" : "s"} recorded · raised by {inv.created_by || "you"}</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} /></Li>
          </Card>
        </ScrollView>
      )}

      <Sheet visible={repeat} onClose={() => setRepeat(false)} testID="invoice-duplicate-sheet">
        <H4>Repeat this invoice</H4>
        <Sub style={{ marginTop: 4 }}>
          Same customer, same items. Payments, reminders and history stay with {inv?.number}.
        </Sub>
        <Row between style={{ marginTop: 12 }}>
          <View style={{ flex: 1 }}><H4>Use today&rsquo;s prices</H4><Sub>Off keeps the prices on {inv?.number}</Sub></View>
          <Switch on={usePrices} onChange={setUsePrices} testID="duplicate-use-prices" />
        </Row>
        {preview.data ? (
          <Card style={{ marginTop: 12 }} testID="duplicate-preview">
            <Row between><Sub>{preview.data.lines.length} line{preview.data.lines.length === 1 ? "" : "s"} · {preview.data.customer_name}</Sub><Money>{money(preview.data.totals.total)}</Money></Row>
            {preview.data.repriced.length ? <Sub style={{ marginTop: 6, color: colors.green700 }}>Re-priced: {preview.data.repriced.join(", ")}</Sub> : null}
            {preview.data.short.length ? (
              <Sub style={{ marginTop: 6, color: colors.coral }}>
                Not enough stock for {preview.data.short.map((x: any) => `${x.name} (${x.have} of ${x.need})`).join(", ")} — stock will go negative.
              </Sub>
            ) : null}
          </Card>
        ) : <Loading />}
        <Btn label="Issue it now" style={{ marginTop: 14 }} loading={issueRepeat.isPending} testID="duplicate-issue" onPress={() => issueRepeat.mutate()} />
        <Btn label="Edit before saving" variant="ghost" small style={{ marginTop: 8 }} testID="duplicate-edit"
          onPress={() => { setRepeat(false); router.push(`/invoices/new?from=${id}`); }} />
      </Sheet>
    </View>
  );
}
