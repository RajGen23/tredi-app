// The paper on screen. What you see here is the layout that prints: the Simple
// format is always the 80mm counter receipt; the Professional format draws
// whichever of the seven looks the owner picked in Invoice templates.
import type { ReactNode } from "react";
import { Image, Text, TextProps, View } from "react-native";

import { Row } from "@/src/components/ui";
import { longDate, money } from "@/src/format";
import { Brand, photoPx, readable } from "@/src/invoice-templates";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const MARK = require("../../assets/images/tradabooks-wordmark.png");

const useStyles = makeStyles((c) => ({
  paper: { backgroundColor: c.surfaceSecondary, borderRadius: 6, padding: 12, overflow: "hidden" },
  biz: { fontFamily: fonts.docBold, fontSize: 14, color: c.deep },
  title: { fontFamily: fonts.docBold, fontSize: 20, letterSpacing: -0.5, color: c.onSurface, textAlign: "right" },
  num: { fontFamily: fonts.mono, fontSize: 10, color: c.ink60, textAlign: "right" },
  th: { fontFamily: fonts.docSemibold, fontSize: 8, letterSpacing: 0.6, color: c.ink40 },
  thDark: { fontFamily: fonts.docSemibold, fontSize: 8, letterSpacing: 0.6 },
  td: { fontFamily: fonts.doc, fontSize: 10, color: c.onSurface },
  tdName: { fontFamily: fonts.docSemibold, fontSize: 10, color: c.onSurface },
  sub: { fontFamily: fonts.doc, fontSize: 9.5, color: c.ink60, lineHeight: 13 },
  lbl: { fontFamily: fonts.docSemibold, fontSize: 7.5, letterSpacing: 0.8, color: c.ink40, textTransform: "uppercase" },
  val: { fontFamily: fonts.docSemibold, fontSize: 10.5, color: c.onSurface },
  meta: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  metaCell: { width: "50%", paddingRight: 10, marginBottom: 6 },
  row: { paddingVertical: 4.5, borderBottomWidth: 1, borderBottomColor: "#EDEDED", alignItems: "center" },
  rowLight: { paddingVertical: 4.5, borderTopWidth: 1, borderTopColor: c.border, alignItems: "center" },
  thumb: { width: 24, height: 24, borderRadius: 4 },
  block: { marginTop: 10 },
  btitle: { fontFamily: fonts.docBold, fontSize: 11, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: "#EDEDED", marginBottom: 5 },
  hr: { height: 1, backgroundColor: c.border, marginVertical: 8 },
  band: { padding: 10, borderRadius: 9, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 7 },
  foot: { marginTop: 10, paddingTop: 7, borderTopWidth: 1, borderTopColor: c.border, alignItems: "center" },
  mark: { width: 60, height: 13 },
  rcpWrap: { alignItems: "center", paddingVertical: 10 },
  rcpPaper: { width: 268, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 4, padding: 14, gap: 1 },
  rcpName: { fontFamily: fonts.docBold, fontSize: 13, letterSpacing: 0.6, color: c.onSurface, textAlign: "center" },
  rcpCentre: { fontFamily: fonts.mono, fontSize: 9.5, color: c.ink60, textAlign: "center" },
  rcpText: { fontFamily: fonts.mono, fontSize: 10, color: c.onSurface },
  rcpNum: { fontFamily: fonts.monoSemibold },
  rcpStrong: { fontFamily: fonts.monoSemibold, fontSize: 11.5, color: c.onSurface },
  rcpRule: { fontFamily: fonts.mono, fontSize: 9, color: c.ink40, marginVertical: 5, textAlign: "center" },
  rcpMark: { width: 51, height: 11 },
}));

const discCell = (l: any) => (!l.discount ? "0.00%" : l.discount_type === "percent" ? `${Number(l.discount_value).toFixed(2)}%` : money(l.discount, { symbol: false }));

// Document typography — Poppins throughout, one size for every body line so no
// row reads bigger than its neighbour. Mirrors the sizes in the printed CSS.
function P({ style, ...p }: TextProps) { const s = useStyles(); return <Text style={[s.sub, style]} {...p} />; }
function L({ style, ...p }: TextProps) { const s = useStyles(); return <Text style={[s.lbl, style]} {...p} />; }
function V({ style, ...p }: TextProps) { const s = useStyles(); return <Text style={[s.val, style]} {...p} />; }
function N({ style, size, tone, ...p }: TextProps & { size?: number; tone?: "pos" }) {
  const s = useStyles();
  const { colors } = useTheme();
  return <Text style={[s.td, { fontFamily: fonts.docMedium, fontVariant: ["tabular-nums"] }, size ? { fontSize: size } : null, tone === "pos" ? { color: colors.green700 } : null, style]} {...p} />;
}

export function InvoicePaper({ inv, format, brand, linePhotos, logo }: {
  inv: any;
  format: "simple" | "professional";
  brand: Brand;
  linePhotos: Record<string, string>;
  logo: string;
}) {
  if (format !== "professional") return <Simple inv={inv} brand={brand} linePhotos={linePhotos} logo={logo} />;
  if (brand.template === "t7") return <Professional inv={inv} brand={brand} linePhotos={linePhotos} logo={logo} />;
  return <Styled inv={inv} brand={brand} linePhotos={linePhotos} logo={logo} />;
}

type Props = { inv: any; brand: Brand; linePhotos: Record<string, string>; logo: string };

/** Totals in the owner's wording and order, used by every document. */
function Totals({ inv, accent, wide }: { inv: any; accent: string; wide?: boolean }) {
  const t = inv.totals ?? {};
  const on = readable(accent);
  const disc = t.discount_total ?? (t.line_discount ?? 0) + (t.invoice_discount ?? 0);
  const line = (label: string, value: string, tone?: "pos") => (
    <Row between style={{ paddingVertical: 2.5 }}><P>{label}</P><N tone={tone}>{value}</N></Row>
  );
  return (
    <View style={{ width: wide ? "100%" : "62%", alignSelf: wide ? "auto" : "flex-end", marginTop: 10 }} testID="paper-totals">
      {line("Gross Total", money(t.gross, { symbol: false }))}
      {line("Total Discount", disc ? money(disc, { symbol: false }) : "0.00", "pos")}
      {line("Subtotal", money(t.taxable, { symbol: false }))}
      {line(`VAT${inv.vat_rate ? ` ${inv.vat_rate}%` : ""}`, money(t.vat, { symbol: false }))}
      {t.shipping ? line("Shipping Fee", money(t.shipping, { symbol: false })) : null}
      <Row between style={{ backgroundColor: accent, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 9, marginTop: 6 }}>
        <V style={{ color: on, fontFamily: fonts.docBold, fontSize: 11 }}>Grand Total</V>
        <N size={12} style={{ color: on, fontFamily: fonts.docBold }} testID="paper-grand-total">{money(t.total)}</N>
      </Row>
      {inv.paid > 0 ? (
        <>
          {line(inv.credit_pending ? "Credit Applied" : "Amount Received", money(inv.paid, { symbol: false }), "pos")}
          <Row between style={{ paddingTop: 4, marginTop: 2, borderTopWidth: 1, borderTopColor: "#EDEDED" }}>
            <V>Balance Due</V><N style={{ fontFamily: fonts.docSemibold }} testID="paper-balance">{money(inv.due, { symbol: false })}</N>
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
          <Text style={[s.btitle, { color: colour }]}>Terms of payment{compact || !inv.terms.name ? "" : ` · ${inv.terms.name}`}</Text>
          {inv.terms.payment_structure ? <P style={{ lineHeight: 15 }}>{inv.terms.payment_structure}</P> : null}
          {inv.terms.delivery_condition ? <P style={{ lineHeight: 15, marginTop: 3 }}>{inv.terms.delivery_condition}</P> : null}
          {inv.terms.additional_notes ? <P style={{ lineHeight: 15, marginTop: 3 }}>{inv.terms.additional_notes}</P> : null}
        </View>
      ) : null}
      {banks.length ? (
        <View style={s.block} testID="paper-banks">
          <Text style={[s.btitle, { color: colour }]}>Bank Details</Text>
          {banks.map((a, i) => (
            <View key={a.id ?? i} style={{ marginBottom: 5 }}>
              <P>Account name: <Text style={{ fontFamily: fonts.docSemibold }}>{a.holder || a.name}</Text></P>
              {a.bank ? <P>Bank name: <Text style={{ fontFamily: fonts.docSemibold }}>{a.bank}</Text></P> : null}
              {a.number ? <P>Account number: <Text style={{ fontFamily: fonts.docSemibold }}>{a.number}</Text></P> : null}
            </View>
          ))}
        </View>
      ) : null}
      {pays.length ? (
        <View style={s.block} testID="paper-payments">
          <Text style={[s.btitle, { color: colour }]}>Payment method</Text>
          {pays.map((p, i) => (
            <Row key={i} between style={{ paddingVertical: 1.5 }}><P>{label[p.method] ?? p.method}</P><N>{money(p.amount, { symbol: false })}</N></Row>
          ))}
        </View>
      ) : null}
    </>
  );
}

function MadeWith({ label }: { label: string }) {
  const s = useStyles();
  return (
    <Row style={{ gap: 5, alignItems: "center" }}>
      <P style={{ fontFamily: fonts.docSemibold }}>{label}</P>
      <Image source={MARK} style={s.mark} resizeMode="contain" testID="pdf-tredi-mark" />
    </Row>
  );
}

/** Templates 1–6 — the same invoice body dressed six ways, mirroring the HTML
 *  in invoice-templates.ts so the screen never promises a look the PDF lacks. */
function Styled({ inv, brand, linePhotos, logo }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const tpl = brand.template;
  const c = brand.brand_color;
  const head = brand.header_color || c;
  const onHead = readable(head);
  const b = inv.business ?? {};
  const photos = !!brand.show_photos;
  const logoH = tpl === "t5" ? Math.min(brand.logo_size, 70) : brand.logo_size;
  const logoImg = () =>
    logo ? <Image source={{ uri: logo }} style={{ width: logoH * 1.6, height: logoH * 0.5, marginBottom: 5, alignSelf: tpl === "t3" ? "center" : "flex-start" }} resizeMode="contain" testID="pdf-logo" /> : null;

  const meta = (inverse?: boolean) => {
    const col = inverse ? { color: onHead } : null;
    return (
      <View style={{ alignItems: "flex-end" }}>
        <L style={[col, inverse && { opacity: 0.75 }]}>Invoice</L>
        <N size={tpl === "t1" ? 14 : 12} style={col} testID="paper-number">{inv.number}</N>
        <P style={[col, inverse && { opacity: 0.75 }]}>{longDate(inv.created_at)}</P>
        {inv.due_date ? <P style={[col, inverse && { opacity: 0.75 }]}>Due {longDate(inv.due_date)}</P> : null}
      </View>
    );
  };
  const biz = (inverse?: boolean, size = 15) => (
    <View style={{ flex: 1, paddingRight: 8 }}>
      <Text style={[s.biz, { color: inverse ? onHead : c, fontSize: size }]}>{b.name}</Text>
      {b.address ? <P style={inverse ? { color: onHead, opacity: 0.75 } : null}>{b.address}</P> : null}
      {b.tin || b.phone ? <P style={inverse ? { color: onHead, opacity: 0.75 } : null}>{[b.tin ? `TIN ${b.tin}` : "", b.phone].filter(Boolean).join(" · ")}</P> : null}
    </View>
  );
  const billTo = (
    <View style={{ marginTop: 10 }} testID="paper-bill-to">
      <L>Bill to</L>
      <Text style={s.tdName}>{inv.customer_name}</Text>
      {inv.customer_phone ? <P>{inv.customer_phone}</P> : null}
    </View>
  );

  let header: ReactNode;
  if (tpl === "t2") {
    header = (
      <>
        <View style={[s.band, { backgroundColor: head }]}>{biz(true)}{meta(true)}</View>
        {logo ? <View style={{ marginTop: 10 }}>{logoImg()}</View> : null}
        {billTo}
      </>
    );
  } else if (tpl === "t3") {
    header = (
      <>
        <View style={{ alignItems: "center", paddingBottom: 10 }}>
          {logoImg()}
          <Text style={[s.biz, { color: c, fontSize: 20, textAlign: "center" }]}>{b.name}</Text>
          <P style={{ textAlign: "center" }}>{[b.address, b.phone].filter(Boolean).join(" · ")}</P>
        </View>
        <Row between style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 8, alignItems: "flex-start" }}>
          <View testID="paper-bill-to"><L>Bill to</L><Text style={s.tdName}>{inv.customer_name}</Text>{inv.customer_phone ? <P>{inv.customer_phone}</P> : null}</View>
          {meta()}
        </Row>
      </>
    );
  } else if (tpl === "t5") {
    header = (
      <>
        <View style={[s.band, { backgroundColor: head, padding: 16, borderRadius: 11 }]}>
          <View style={{ flex: 1, paddingRight: 8 }}>{logoImg()}{biz(true, 16)}</View>
          {meta(true)}
        </View>
        {billTo}
      </>
    );
  } else if (tpl === "t6") {
    header = (
      <>
        <Row between style={{ alignItems: "flex-start" }}>{biz(false, 13)}{meta()}</Row>
        <View style={s.hr} />
        {billTo}
      </>
    );
  } else {
    header = (
      <>
        <Row between style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>{logoImg()}{biz()}</View>
          {meta()}
        </Row>
        <View style={s.hr} />
        {billTo}
      </>
    );
  }

  const compact = tpl === "t6";
  const thBg = tpl === "t5" ? "#F7FAF9" : undefined;
  return (
    <View style={[s.paper, tpl === "t4" && { paddingLeft: 21 }, compact && { padding: 11 }]} testID="pdf-paper">
      {tpl === "t4" ? <View style={[s.accent, { backgroundColor: head }]} testID="paper-accent" /> : null}
      {header}
      <View style={{ marginTop: 12 }}>
        <Row style={{ paddingVertical: 5, paddingHorizontal: 2, backgroundColor: thBg }}>
          <Text style={[s.th, { flex: 2 }]}>ITEM</Text>
          <Text style={[s.th, { flex: 0.6, textAlign: "right" }]}>QTY</Text>
          <Text style={[s.th, { flex: 1, textAlign: "right" }]}>RATE</Text>
          <Text style={[s.th, { flex: 1, textAlign: "right" }]}>DISCOUNT</Text>
          <Text style={[s.th, { flex: 1.1, textAlign: "right" }]}>AMOUNT</Text>
        </Row>
        {(inv.lines ?? []).map((l: any, i: number) => (
          <Row key={i} style={[s.rowLight, { paddingHorizontal: 2 }, compact && { paddingVertical: 4 }, tpl === "t5" && i % 2 === 1 && { backgroundColor: "#FAFCFB" }]}>
            <Row style={{ flex: 2, gap: 6 }}>
              {photos && linePhotos[l.photo_url] ? <Image source={{ uri: linePhotos[l.photo_url] }} style={[s.thumb, { width: photoPx(brand), height: photoPx(brand) }]} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={s.tdName}>{l.name}</Text>
                {l.note ? <P numberOfLines={2}>{l.note}</P> : null}
              </View>
            </Row>
            <N style={{ flex: 0.6, textAlign: "right" }}>{l.quantity}</N>
            <N style={{ flex: 1, textAlign: "right" }}>{money(l.unit_price, { symbol: false })}</N>
            <N style={{ flex: 1, textAlign: "right" }}>{discCell(l)}</N>
            <N style={{ flex: 1.1, textAlign: "right" }}>{money(l.total, { symbol: false })}</N>
          </Row>
        ))}
      </View>
      <View style={s.hr} />
      <Totals inv={inv} accent={c} wide />
      <Blocks inv={inv} colour={c} compact={compact} />
      <P style={{ marginTop: 14 }}>{inv.note || "Goods sold are not returnable after 7 days."}</P>
      <Row between style={s.foot}>
        <P>{brand.footer || "Thank you for your business"}</P>
        {brand.tredi_mark === false ? null : <MadeWith label="Made with" />}
      </Row>
    </View>
  );
}

/** Template 7 — the full document: From/To, TIN, dark table head, right-hand
 *  totals and a two-column terms + bank footer. */
function Professional({ inv, brand, linePhotos, logo }: Props) {
  const s = useStyles();
  const head = brand.header_color || "#0B0B0B";
  const onHead = readable(head);
  const colour = brand.brand_color;
  const b = inv.business ?? {};
  const photos = !!brand.show_photos;
  return (
    <View style={s.paper} testID="pdf-paper">
      <Row between style={{ alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: head, paddingBottom: 10 }}>
        <View style={{ flex: 1 }}>
          {logo ? <Image source={{ uri: logo }} style={{ width: brand.logo_size * 1.6, height: brand.logo_size * 0.5, marginBottom: 5 }} resizeMode="contain" testID="pdf-logo" /> : null}
          <Text style={s.biz}>{b.name}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.title} testID="paper-pro-title">INVOICE</Text>
          <Text style={s.num}>{inv.number}</Text>
        </View>
      </Row>

      <View style={s.meta} testID="paper-pro-meta">
        <View style={s.metaCell}>
          <L>Issue Date</L><V>{longDate(inv.created_at)}</V>
          <L style={{ marginTop: 7 }}>Due Date</L><V>{inv.due_date ? longDate(inv.due_date) : "On receipt"}</V>
        </View>
        <View style={s.metaCell}>
          <L>Customer</L><V>{inv.customer_name}</V>
          <P>{inv.customer_phone}</P>{inv.customer_address ? <P>{inv.customer_address}</P> : null}
        </View>
        <View style={s.metaCell}>
          <L>Business</L><V>{b.name}</V>
          <P>{b.address}</P><P>{b.email || b.phone || ""}</P>
        </View>
        <View style={s.metaCell}>
          <L>Branch</L><V>{inv.shop || "Head office"}</V>
          <P>Rep: {inv.rep || inv.created_by || "—"}</P>
          <L style={{ marginTop: 7 }}>TIN</L><V>{b.tin || "—"}</V>
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
              {l.note ? <P numberOfLines={2}>{l.note}</P> : null}
            </View>
            {photos ? (
              <View style={{ width: 40 }}>
                {linePhotos[l.photo_url] ? <Image source={{ uri: linePhotos[l.photo_url] }} style={[s.thumb, { width: photoPx(brand), height: photoPx(brand) }]} /> : null}
              </View>
            ) : null}
            <N style={{ flex: 0.6, textAlign: "right" }}>{l.quantity}</N>
            <N style={{ flex: 1, textAlign: "right" }}>{money(l.unit_price, { symbol: false })}</N>
            <N style={{ flex: 1, textAlign: "right" }}>{discCell(l)}</N>
            <N style={{ flex: 1.1, textAlign: "right" }}>{money(l.total, { symbol: false })}</N>
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
            <View style={s.block}><Text style={[s.btitle, { color: colour }]}>Notes</Text><P style={{ lineHeight: 15 }}>{inv.note}</P></View>
          ) : null}
        </View>
      </Row>

      <Row between style={s.foot}>
        <P>{brand.footer || "Thanks for your patronage."}</P>
        {brand.tredi_mark === false ? null : <MadeWith label="Crafted with" />}
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
        <Text style={s.rcpCentre}>INVOICE {inv.number}</Text>
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
        {paid > 0 ? kv(inv.credit_pending ? "Credit" : "Paid", money(paid, { symbol: false })) : null}
        {paid > 0 ? kv("Balance", money(inv.due ?? (t.total ?? 0) - paid, { symbol: false }), true) : null}
        {rule}
        <Text style={s.rcpCentre}>Thank you for your patronage</Text>
        <Text style={[s.rcpCentre, { color: colors.ink40 }]}>{brand.footer || "Goods sold in good condition"}</Text>
        {brand.tredi_mark === false ? null : (
          <Row style={{ justifyContent: "center", alignItems: "center", gap: 4, marginTop: 6 }} testID="receipt-powered">
            <Text style={[s.rcpCentre, { color: colors.ink40 }]}>Powered by</Text>
            <Image source={MARK} style={s.rcpMark} resizeMode="contain" testID="pdf-tredi-mark" />
          </Row>
        )}
      </View>
    </View>
  );
}
