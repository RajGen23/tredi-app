// The paper on screen. Two documents, two different looks — what you see here
// is the layout that prints, so Simple and Professional can never be confused
// with each other.
import { Image, Text, View } from "react-native";

import { Divider, H4, Lbl, Money, Row, Sub, Tag } from "@/src/components/ui";
import { longDate, money } from "@/src/format";
import { Brand, readable } from "@/src/invoice-templates";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const MARK = require("../../assets/images/tredi-wordmark.png");

const useStyles = makeStyles((c) => ({
  paper: { backgroundColor: c.surfaceSecondary, borderRadius: 6, padding: 14 },
  biz: { fontFamily: fonts.extrabold, fontSize: 15, color: c.deep },
  title: { fontFamily: fonts.extrabold, fontSize: 21, letterSpacing: -0.5, color: c.onSurface, textAlign: "right" },
  num: { fontFamily: fonts.mono, fontSize: 10.5, color: c.ink60, textAlign: "right" },
  th: { fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 0.6, color: c.ink40 },
  thDark: { fontFamily: fonts.bold, fontSize: 8, letterSpacing: 0.6 },
  td: { fontFamily: fonts.regular, fontSize: 10.5, color: c.onSurface },
  tdName: { fontFamily: fonts.bold, fontSize: 10.5, color: c.onSurface },
  meta: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
  metaCell: { width: "50%", paddingRight: 10, marginBottom: 8 },
  rule: { borderBottomWidth: 1, borderBottomColor: c.border },
  row: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#EDEDED", alignItems: "center" },
  rowLight: { paddingVertical: 5, borderTopWidth: 1, borderTopColor: c.border, alignItems: "center" },
  thumb: { width: 26, height: 26, borderRadius: 4 },
  block: { marginTop: 12 },
  btitle: { fontFamily: fonts.extrabold, fontSize: 11.5, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: "#EDEDED", marginBottom: 6 },
  band: { padding: 12, borderRadius: 9 },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 7, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  foot: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border, alignItems: "center" },
  mark: { width: 42, height: 13 },
  rcpWrap: { alignItems: "center", paddingVertical: 10 },
  rcpPaper: { width: 268, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 4, padding: 14, gap: 1 },
  rcpName: { fontFamily: fonts.extrabold, fontSize: 13, letterSpacing: 0.6, color: c.onSurface, textAlign: "center" },
  rcpCentre: { fontFamily: fonts.mono, fontSize: 9.5, color: c.ink60, textAlign: "center" },
  rcpText: { fontFamily: fonts.mono, fontSize: 10, color: c.onSurface },
  rcpNum: { fontFamily: fonts.monoSemibold },
  rcpStrong: { fontFamily: fonts.monoSemibold, fontSize: 11.5, color: c.onSurface },
  rcpRule: { fontFamily: fonts.mono, fontSize: 9, color: c.ink40, marginVertical: 5, textAlign: "center" },
}));

const discCell = (l: any) => (!l.discount ? "0.00%" : l.discount_type === "percent" ? `${Number(l.discount_value).toFixed(2)}%` : money(l.discount, { symbol: false }));

export function InvoicePaper({ inv, format, brand, linePhotos, logo }: {
  inv: any;
  format: "simple" | "professional";
  brand: Brand;
  linePhotos: Record<string, string>;
  logo: string;
}) {
  return format === "professional"
    ? <Professional inv={inv} brand={brand} linePhotos={linePhotos} logo={logo} />
    : <Simple inv={inv} brand={brand} linePhotos={linePhotos} logo={logo} />;
}

type Props = { inv: any; brand: Brand; linePhotos: Record<string, string>; logo: string };

/** Totals in the owner's wording and order, used by both documents. */
function Totals({ inv, accent, wide }: { inv: any; accent: string; wide?: boolean }) {
  const t = inv.totals ?? {};
  const on = readable(accent);
  const disc = t.discount_total ?? (t.line_discount ?? 0) + (t.invoice_discount ?? 0);
  const line = (label: string, value: string, tone?: "pos") => (
    <Row between style={{ paddingVertical: 2.5 }}><Sub>{label}</Sub><Money size={10.5} tone={tone}>{value}</Money></Row>
  );
  return (
    <View style={{ width: wide ? "100%" : "62%", alignSelf: wide ? "auto" : "flex-end", marginTop: 10 }} testID="paper-totals">
      {line("Gross Total", money(t.gross, { symbol: false }))}
      {line("Total Discount", disc ? money(disc, { symbol: false }) : "0.00", "pos")}
      {line("Subtotal", money(t.taxable, { symbol: false }))}
      {line(`VAT${inv.vat_rate ? ` ${inv.vat_rate}%` : ""}`, money(t.vat, { symbol: false }))}
      {t.shipping ? line("Shipping Fee", money(t.shipping, { symbol: false })) : null}
      <Row between style={{ backgroundColor: accent, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 9, marginTop: 6 }}>
        <H4 style={{ color: on }}>Grand Total</H4>
        <Money size={13} style={{ color: on }} testID="paper-grand-total">{money(t.total)}</Money>
      </Row>
      {inv.paid > 0 ? (
        <>
          {line("Amount Received", money(inv.paid, { symbol: false }), "pos")}
          <Row between style={{ paddingTop: 4, marginTop: 2, borderTopWidth: 1, borderTopColor: "#EDEDED" }}>
            <H4 style={{ fontSize: 12 }}>Balance Due</H4><Money size={12} testID="paper-balance">{money(inv.due, { symbol: false })}</Money>
          </Row>
        </>
      ) : null}
    </View>
  );
}

function Blocks({ inv, colour, compact }: { inv: any; colour: string; compact?: boolean }) {
  const s = useStyles();
  const banks: any[] = inv.bank_accounts ?? [];
  const pays: any[] = inv.payments ?? [];
  const label: Record<string, string> = { cash: "Cash", transfer: "Bank Transfer", card: "Card", credit: "Unused credit" };
  return (
    <>
      {inv.terms ? (
        <View style={s.block} testID="paper-terms">
          <Text style={[s.btitle, { color: colour }]}>Terms of payment{compact ? "" : ` · ${inv.terms.name}`}</Text>
          {inv.terms.payment_structure ? <Tag style={{ lineHeight: 15 }}>{inv.terms.payment_structure}</Tag> : null}
          {inv.terms.delivery_condition ? <Tag style={{ lineHeight: 15, marginTop: 3 }}>{inv.terms.delivery_condition}</Tag> : null}
          {inv.terms.additional_notes ? <Tag style={{ lineHeight: 15, marginTop: 3 }}>{inv.terms.additional_notes}</Tag> : null}
        </View>
      ) : null}
      {banks.length ? (
        <View style={s.block} testID="paper-banks">
          <Text style={[s.btitle, { color: colour }]}>Bank Details</Text>
          {banks.map((a) => (
            <View key={a.id} style={{ marginBottom: 5 }}>
              <Tag>Account name: <Text style={{ fontFamily: fonts.bold }}>{a.holder || a.name}</Text></Tag>
              {a.bank ? <Tag>Bank name: <Text style={{ fontFamily: fonts.bold }}>{a.bank}</Text></Tag> : null}
              {a.number ? <Tag>Account number: <Text style={{ fontFamily: fonts.bold }}>{a.number}</Text></Tag> : null}
            </View>
          ))}
        </View>
      ) : null}
      {pays.length ? (
        <View style={s.block} testID="paper-payments">
          <Text style={[s.btitle, { color: colour }]}>Payment method</Text>
          {pays.map((p, i) => (
            <Row key={i} between style={{ paddingVertical: 1.5 }}><Tag>{label[p.method] ?? p.method}</Tag><Money size={10}>{money(p.amount, { symbol: false })}</Money></Row>
          ))}
        </View>
      ) : null}
    </>
  );
}

/** Template 7 — the full quotation document: From/To, TIN, dark table head,
 *  right-hand totals and a two-column terms + bank footer. */
function Professional({ inv, brand, linePhotos, logo }: Props) {
  const s = useStyles();
  const head = brand.header_color || "#0B0B0B";
  const onHead = readable(head);
  const colour = brand.brand_color;
  const b = inv.business ?? {};
  const photos = !!brand.show_photos;
  const title = inv.status === "quote" ? "QUOTATION" : "INVOICE";
  return (
    <View style={s.paper} testID="pdf-paper">
      <Row between style={{ alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: head, paddingBottom: 10 }}>
        <View style={{ flex: 1 }}>
          {logo ? <Image source={{ uri: logo }} style={{ width: brand.logo_size * 1.6, height: brand.logo_size * 0.5, marginBottom: 5 }} resizeMode="contain" testID="pdf-logo" /> : null}
          <Text style={s.biz}>{b.name}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.title} testID="paper-pro-title">{title}</Text>
          <Text style={s.num}>{inv.number}</Text>
        </View>
      </Row>

      <View style={s.meta} testID="paper-pro-meta">
        <View style={s.metaCell}>
          <Lbl>Issue Date</Lbl><H4 style={{ fontSize: 11 }}>{longDate(inv.created_at)}</H4>
          <Lbl style={{ marginTop: 7 }}>Due Date</Lbl><H4 style={{ fontSize: 11 }}>{inv.due_date ? longDate(inv.due_date) : "On receipt"}</H4>
        </View>
        <View style={s.metaCell}>
          <Lbl>Customer</Lbl><H4 style={{ fontSize: 11 }}>{inv.customer_name}</H4>
          <Tag>{inv.customer_phone}</Tag>{inv.customer_address ? <Tag>{inv.customer_address}</Tag> : null}
        </View>
        <View style={s.metaCell}>
          <Lbl>Business</Lbl><H4 style={{ fontSize: 11 }}>{b.name}</H4>
          <Tag>{b.address}</Tag><Tag>{b.email || b.phone || ""}</Tag>
        </View>
        <View style={s.metaCell}>
          <Lbl>Branch</Lbl><H4 style={{ fontSize: 11 }}>{inv.shop || "Head office"}</H4>
          <Tag>Rep: {inv.rep || inv.created_by || "—"}</Tag>
          <Lbl style={{ marginTop: 7 }}>TIN</Lbl><H4 style={{ fontSize: 11 }}>{b.tin || "—"}</H4>
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <Row style={{ backgroundColor: head, paddingVertical: 7, paddingHorizontal: 6 }}>
          <Text style={[s.thDark, { flex: 2, color: onHead }]}>ITEM</Text>
          {photos ? <Text style={[s.thDark, { width: 40, color: onHead }]}>IMAGE</Text> : null}
          <Text style={[s.thDark, { flex: 0.6, color: onHead, textAlign: "right" }]}>QTY</Text>
          <Text style={[s.thDark, { flex: 1, color: onHead, textAlign: "right" }]}>RATE</Text>
          <Text style={[s.thDark, { flex: 1, color: onHead, textAlign: "right" }]}>DISCOUNT</Text>
          <Text style={[s.thDark, { flex: 1.1, color: onHead, textAlign: "right" }]}>AMOUNT</Text>
        </Row>
        {(inv.lines ?? []).map((l: any, i: number) => (
          <Row key={i} style={[s.row, { paddingHorizontal: 6 }]}>
            <View style={{ flex: 2 }}>
              <Text style={s.tdName}>{l.name}</Text>
              {l.note ? <Tag numberOfLines={2}>{l.note}</Tag> : null}
            </View>
            {photos ? (
              <View style={{ width: 40 }}>
                {linePhotos[l.photo_url] ? <Image source={{ uri: linePhotos[l.photo_url] }} style={[s.thumb, { width: 30, height: 30 }]} /> : null}
              </View>
            ) : null}
            <Money size={10} style={{ flex: 0.6, textAlign: "right" }}>{l.quantity}</Money>
            <Money size={10} style={{ flex: 1, textAlign: "right" }}>{money(l.unit_price, { symbol: false })}</Money>
            <Money size={10} style={{ flex: 1, textAlign: "right" }}>{discCell(l)}</Money>
            <Money size={10} style={{ flex: 1.1, textAlign: "right" }}>{money(l.total, { symbol: false })}</Money>
          </Row>
        ))}
      </View>

      <Totals inv={inv} accent={head} />

      <Row style={{ gap: 14, marginTop: 6, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          {inv.terms || (inv.bank_accounts ?? []).length ? <Blocks inv={{ ...inv, payments: [] }} colour={colour} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Blocks inv={{ ...inv, terms: null, bank_accounts: [] }} colour={colour} />
          {inv.note ? (
            <View style={s.block}><Text style={[s.btitle, { color: colour }]}>Notes</Text><Tag style={{ lineHeight: 15 }}>{inv.note}</Tag></View>
          ) : null}
        </View>
      </Row>

      <Row between style={s.foot}>
        <Tag>{brand.footer || "Thanks for your patronage."}</Tag>
        <Row style={{ gap: 5 }}>
          <Tag style={{ fontFamily: fonts.bold }}>Crafted with</Tag>
          <Image source={MARK} style={s.mark} resizeMode="contain" testID="pdf-tredi-mark" />
        </Row>
      </Row>
    </View>
  );
}

/** Simple = the slip a customer gets at the counter: narrow paper, centred
 *  shop name, one line per item and a thank-you. Deliberately nothing like the
 *  Professional document, which is the full A4 invoice. */
function Simple({ inv, brand, logo }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const b = inv.business ?? {};
  const t = inv.totals ?? {};
  const paid = inv.paid ?? 0;
  const title = inv.status === "quote" ? "QUOTATION" : "INVOICE";
  const rule = <Text style={s.rcpRule}>- - - - - - - - - - - - - - - - - - - - - - - -</Text>;
  const kv = (k: string, v: string, strong?: boolean) => (
    <Row between key={k}>
      <Text style={[s.rcpText, strong && s.rcpStrong]}>{k}</Text>
      <Text style={[s.rcpText, s.rcpNum, strong && s.rcpStrong]}>{v}</Text>
    </Row>
  );

  return (
    <View style={s.rcpWrap} testID="pdf-paper">
      <View style={s.rcpPaper} testID="paper-receipt">
        <View style={{ alignItems: "center", gap: 2 }}>
          {logo ? <Image source={{ uri: logo }} style={{ width: 110, height: 34, marginBottom: 4 }} resizeMode="contain" testID="pdf-logo" /> : null}
          <Text style={s.rcpName}>{String(b.name ?? "").toUpperCase()}</Text>
          {b.address ? <Text style={s.rcpCentre}>{b.address}</Text> : null}
          {b.phone ? <Text style={s.rcpCentre}>{b.phone}</Text> : null}
          {b.tin ? <Text style={s.rcpCentre}>TIN {b.tin}</Text> : null}
        </View>
        {rule}
        <Text style={s.rcpCentre}>{title} {inv.number}</Text>
        <Text style={s.rcpCentre}>{longDate(inv.created_at)}</Text>
        {inv.customer_name ? <Text style={s.rcpCentre}>Customer: {inv.customer_name}</Text> : null}
        {rule}
        {(inv.lines ?? []).map((l: any, i: number) => (
          <View key={i} style={{ marginBottom: 3 }}>
            <Text style={s.rcpText}>{l.name}</Text>
            <Row between>
              <Text style={[s.rcpText, s.rcpNum]}>  {l.quantity} {l.unit || ""} x {money(l.unit_price, { symbol: false })}</Text>
              <Text style={[s.rcpText, s.rcpNum]}>{money(l.total, { symbol: false })}</Text>
            </Row>
          </View>
        ))}
        {rule}
        {kv("Subtotal", money(t.taxable ?? t.gross ?? 0, { symbol: false }))}
        {t.vat ? kv(`VAT ${inv.vat_rate ?? ""}%`, money(t.vat, { symbol: false })) : null}
        {t.shipping ? kv("Shipping", money(t.shipping, { symbol: false })) : null}
        {kv("TOTAL", money(t.total ?? 0), true)}
        {paid > 0 ? kv("Paid", money(paid, { symbol: false })) : null}
        {paid > 0 ? kv("Balance", money(inv.due ?? (t.total ?? 0) - paid, { symbol: false }), true) : null}
        {rule}
        <Text style={s.rcpCentre}>Thank you for your patronage</Text>
        <Text style={[s.rcpCentre, { color: colors.ink40 }]}>{brand.footer || "Goods sold in good condition"}</Text>
      </View>
    </View>
  );
}
