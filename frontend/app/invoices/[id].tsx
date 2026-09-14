// 04.6 Invoice detail — teal top, amount due hero, items, actions.
import { Linking, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Divider, H4, IconBtn, Li, Lbl, Loading, Money, Prog, Row, Sub, Tag } from "@/src/components/ui";
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
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api(`/invoices/${id}`) });
  const inv = q.data;
  const over = inv?.status === "overdue";
  const paidPct = inv ? (inv.paid / inv.totals.total) * 100 : 0;

  return (
    <View style={s.root} testID="invoice-detail-screen">
      <View style={[s.teal, { height: insets.top + 132 }]} />
      <View style={{ paddingTop: insets.top }}>
        <AppBar teal back mono title={inv?.number ?? "Invoice"} right={<IconBtn teal name="ellipsis-horizontal" testID="invoice-more" />} />
      </View>
      {!inv ? <Card style={{ marginHorizontal: 14 }}><Loading /></Card> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24 }}>
          <Card>
            <Row between>
              <Badge tone={over ? "over" : inv.status === "paid" ? "paid" : inv.status === "draft" ? "draft" : "due"}>{statusLabel(inv)}</Badge>
              <Tag>Issued {shortDate(inv.created_at)}{inv.due_date ? ` · due ${shortDate(inv.due_date)}` : ""}</Tag>
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
              <Btn small variant="deep" label="Send reminder" style={{ flex: 1 }} testID="invoice-send-reminder" onPress={() => Linking.openURL(`https://wa.me/${inv.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${inv.customer_name}, a reminder that ${inv.number} for ${money(inv.due)} is ${inv.status === "overdue" ? `${inv.days_overdue} days overdue` : `due ${longDate(inv.due_date)}`}. Thank you.`)}`)} />
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
            <Li testID="invoice-waybill"><Av icon="cube-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Waybill</H4><Sub>Not generated</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} /></Li>
            <Li last testID="invoice-activity"><Av icon="time-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Activity & payments</H4><Sub>{inv.payments.length} payment{inv.payments.length === 1 ? "" : "s"} recorded · raised by {inv.created_by || "you"}</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} /></Li>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
