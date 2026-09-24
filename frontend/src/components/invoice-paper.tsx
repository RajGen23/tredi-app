// The paper on screen. Two documents, two different looks — what you see here
// is the layout that prints, so Simple and Professional can never be confused
// with each other.
import { Image, Text, View } from "react-native";

import { Divider, H4, Lbl, Money, Row, Sub, Tag } from "@/src/components/ui";
import { longDate, money } from "@/src/format";
import { Brand, readable, TEMPLATES } from "@/src/invoice-templates";
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

/** The one-page summary, in whichever of the six looks the shop picked. */
function Simple({ inv, brand, linePhotos, logo }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const colour = brand.brand_color;
  const head = brand.header_color || colour;
  const onHead = readable(head);
  const b = inv.business ?? {};
  const photos = !!brand.show_photos;
  const t = brand.template === "t7" ? "t3" : brand.template;
  const dark = t === "t2" || t === "t5";
  const title = inv.status === "quote" ? "Quotation" : "Invoice";
  const tplName = TEMPLATES.find((x) => x.key === t)?.note ?? "";

  const meta = (invert?: boolean) => (
    <View style={{ alignItems: "flex-end" }}>
      <Lbl style={invert ? { color: onHead, opacity: 0.75 } : undefined}>{title}</Lbl>
      <Money size={12} style={invert ? { color: onHead } : undefined}>{inv.number}</Money>
      <Tag style={invert ? { color: onHead, opacity: 0.75 } : undefined}>{longDate(inv.created_at)}</Tag>
      {inv.due_date ? <Tag style={invert ? { color: onHead, opacity: 0.75 } : undefined}>Due {longDate(inv.due_date)}</Tag> : null}
    </View>
  );
  const bizBlock = (invert?: boolean) => (
    <View style={{ flex: 1 }}>
      {logo && t !== "t6" ? <Image source={{ uri: logo }} style={{ width: brand.logo_size * 1.4, height: brand.logo_size * 0.45, marginBottom: 5 }} resizeMode="contain" testID="pdf-logo" /> : null}
      <Text style={[s.biz, { color: invert ? onHead : colour }]}>{b.name}</Text>
      <Tag style={invert ? { color: onHead, opacity: 0.75 } : undefined}>{b.address}</Tag>
      <Tag style={invert ? { color: onHead, opacity: 0.75 } : undefined}>{[b.tin ? `TIN ${b.tin}` : "", b.phone].filter(Boolean).join(" · ")}</Tag>
    </View>
  );

  return (
    <View style={[s.paper, t === "t4" ? { paddingLeft: 20 } : null]} testID="pdf-paper">
      {t === "t4" ? <View style={[s.accent, { backgroundColor: head }]} /> : null}

      {t === "t3" ? (
        <>
          <View style={{ alignItems: "center", paddingBottom: 10 }} testID="paper-simple-head">
            {logo ? <Image source={{ uri: logo }} style={{ width: brand.logo_size * 1.4, height: brand.logo_size * 0.45, marginBottom: 6 }} resizeMode="contain" testID="pdf-logo" /> : null}
            <Text style={[s.biz, { fontSize: 19, color: colour }]}>{b.name}</Text>
            <Tag>{[b.address, b.phone].filter(Boolean).join(" · ")}</Tag>
          </View>
          <Row between style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 8, alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}><Lbl>Bill to</Lbl><H4>{inv.customer_name}</H4><Tag>{inv.customer_phone}</Tag></View>
            {meta()}
          </Row>
        </>
      ) : dark ? (
        <>
          <Row between style={[s.band, { backgroundColor: head, alignItems: "flex-start" }]} testID="paper-simple-head">
            {bizBlock(true)}
            {meta(true)}
          </Row>
          <View style={{ marginTop: 10 }}><Lbl>Bill to</Lbl><H4>{inv.customer_name}</H4><Tag>{inv.customer_phone}</Tag></View>
        </>
      ) : (
        <>
          <Row between style={{ alignItems: "flex-start" }} testID="paper-simple-head">
            {bizBlock()}
            {meta()}
          </Row>
          <Divider />
          <View><Lbl>Bill to</Lbl><H4>{inv.customer_name}</H4><Tag>{inv.customer_phone}</Tag></View>
        </>
      )}

      <View style={{ marginTop: 10 }}>
        <Row style={{ paddingVertical: 4 }}>
          <Text style={[s.th, { flex: 2 }]}>ITEM</Text>
          <Text style={[s.th, { flex: 0.6, textAlign: "right" }]}>QTY</Text>
          <Text style={[s.th, { flex: 1, textAlign: "right" }]}>RATE</Text>
          <Text style={[s.th, { flex: 1, textAlign: "right" }]}>DISCOUNT</Text>
          <Text style={[s.th, { flex: 1.1, textAlign: "right" }]}>AMOUNT</Text>
        </Row>
        {(inv.lines ?? []).map((l: any, i: number) => (
          <Row key={i} style={[s.rowLight, t === "t5" && i % 2 ? { backgroundColor: colors.faint } : null]}>
            <Row style={{ flex: 2, gap: 6 }}>
              {photos && linePhotos[l.photo_url] ? <Image source={{ uri: linePhotos[l.photo_url] }} style={s.thumb} /> : null}
              <Text style={[s.td, { flex: 1 }]}>{l.name}</Text>
            </Row>
            <Money size={10.5} style={{ flex: 0.6, textAlign: "right" }}>{l.quantity}</Money>
            <Money size={10.5} style={{ flex: 1, textAlign: "right" }}>{money(l.unit_price, { symbol: false })}</Money>
            <Money size={10.5} style={{ flex: 1, textAlign: "right" }}>{discCell(l)}</Money>
            <Money size={10.5} style={{ flex: 1.1, textAlign: "right" }}>{money(l.total, { symbol: false })}</Money>
          </Row>
        ))}
      </View>

      <Divider />
      <Totals inv={inv} accent={colour} wide />
      <Blocks inv={inv} colour={colour} compact />
      <Tag style={{ marginTop: 10, lineHeight: 15 }}>{inv.note || "Goods sold are not returnable after 7 days. Thank you for your business."}</Tag>
      <Row between style={s.foot}>
        <Tag numberOfLines={1} style={{ flex: 1 }}>{brand.footer || tplName}</Tag>
        <Row style={{ gap: 5 }}>
          <Tag style={{ fontFamily: fonts.bold }}>Made with</Tag>
          <Image source={MARK} style={s.mark} resizeMode="contain" testID="pdf-tredi-mark" />
        </Row>
      </Row>
    </View>
  );
}
