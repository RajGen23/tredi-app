// 04.10b Invoice templates — the six document looks the owner can pick from, and
// the HTML that prints them. Everything branded (logo, colour, logo size, item
// photos) is read from /settings/invoice so one setting drives every document.
import { longDate, money } from "@/src/format";
import { DOC_FONT, invoiceFontCss } from "@/src/invoice-fonts";

// "receipt" is not a pickable look: it is what the Simple format prints.
export type TemplateKey = "t1" | "t2" | "t3" | "t4" | "t5" | "t6" | "t7" | "receipt";

export type Brand = {
  template: TemplateKey;
  brand_color: string;
  header_color?: string;
  logo_url: string;
  logo_size: number;
  show_photos?: boolean;
  /** How big the item photo prints beside each line, in px. */
  photo_size?: number;
  footer?: string;
  tredi_mark?: boolean;
};

export const DEFAULT_BRAND: Brand = { template: "t3", brand_color: "#014747", logo_url: "", logo_size: 90, photo_size: 30 };

/** Item photo on the invoice line — clamped so a big number cannot break the row. */
export const photoPx = (b: Brand) => Math.min(90, Math.max(16, Number(b.photo_size) || 30));

export const TEMPLATES: { key: TemplateKey; name: string; note: string }[] = [
  { key: "t1", name: "Template 1", note: "Classic · logo left, details right" },
  { key: "t2", name: "Template 2", note: "Banner · colour block header" },
  { key: "t3", name: "Template 3", note: "Minimal · centred, thin rules" },
  { key: "t4", name: "Template 4", note: "Accent · colour bar down the side" },
  { key: "t5", name: "Template 5", note: "Bold · dark header, striped rows" },
  { key: "t6", name: "Template 6", note: "Compact · tight type, no blocks" },
  { key: "t7", name: "Template 7", note: "Full document · From/To, TIN, terms, bank details" },
];

export const SWATCHES = ["#06241F", "#FFFFFF", "#00C98D", "#014747", "#2C6ECB", "#7A4BD0", "#D93F45", "#E58A1A"];
export const LOGO_SIZES = [
  { key: 60, label: "Small", note: "60px" },
  { key: 90, label: "Medium", note: "90px" },
  { key: 120, label: "Large", note: "120px" },
];

export const PHOTO_SIZES = [
  { key: 24, label: "Small", note: "24px" },
  { key: 30, label: "Medium", note: "30px" },
  { key: 48, label: "Large", note: "48px" },
];

/** The TradaBooks mark, inlined so a printed invoice never depends on the network. */
const BRAND_MARK = "data:image/png;base64,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";

const madeWith = (label: string) =>
  `<span style="flex:0 0 auto;display:flex;align-items:center;gap:6px;padding-right:2px">${label}<img src="${BRAND_MARK}" width="60" height="13" style="display:block"/></span>`;

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function readable(hex: string): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) || 0);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#06241F" : "#FFFFFF";
}

function logoTag(brand: Brand, height?: number): string {
  if (!brand.logo_url) return "";
  return `<img src="${esc(brand.logo_url)}" style="height:${height ?? brand.logo_size}px;max-width:60%;object-fit:contain" />`;
}

/** Discount cell, in the customer's language: a percentage if that is how it was
 *  given, otherwise the naira amount taken off. */
function discCell(l: any): string {
  if (!l.discount) return "0.00%";
  return l.discount_type === "percent" ? `${Number(l.discount_value).toFixed(2)}%` : money(l.discount, { symbol: false });
}

function totalsRows(inv: any, c: string, onC: string): string {
  const t = inv.totals;
  const discount = t.discount_total ?? (t.line_discount ?? 0) + (t.invoice_discount ?? 0);
  const paid = inv.paid ?? 0;
  return `
  <div class="tot"><span>Gross Total</span><span>${money(t.gross, { symbol: false })}</span></div>
  <div class="tot"><span>Total Discount</span><span>${discount ? money(discount, { symbol: false }) : "0.00"}</span></div>
  <div class="tot"><span>Subtotal</span><span>${money(t.taxable, { symbol: false })}</span></div>
  <div class="tot"><span>VAT${inv.vat_rate ? ` ${inv.vat_rate}%` : ""}</span><span>${money(t.vat, { symbol: false })}</span></div>
  ${t.shipping ? `<div class="tot"><span>Shipping Fee</span><span>${money(t.shipping, { symbol: false })}</span></div>` : ""}
  <div class="due"><span>Grand Total</span><span>${money(t.total)}</span></div>
  ${paid > 0 ? `<div class="tot strong"><span>Amount Received</span><span>${money(paid, { symbol: false })}</span></div>
  <div class="tot strong"><span>Balance Due</span><span>${money(inv.due ?? t.total - paid, { symbol: false })}</span></div>` : ""}`;
}

function termsBlock(inv: any): string {
  const t = inv.terms;
  if (!t) return "";
  const part = (label: string, text: string) => (text ? `<div class="tgroup"><div class="lbl">${label}</div><div class="tbody" style="white-space:pre-line">${esc(text)}</div></div>` : "");
  return `<div class="block"><div class="btitle">Terms of payment</div>
    ${part("Payment structure", t.payment_structure)}${part("Delivery condition", t.delivery_condition)}${part("Additional notes", t.additional_notes)}</div>`;
}

function bankBlock(inv: any): string {
  const accs = inv.bank_accounts ?? [];
  if (!accs.length) return "";
  return `<div class="block"><div class="btitle">Bank Details</div>${accs.map((a: any) => `
    <div class="tgroup">
      <div class="kv"><span class="lbl">Account name:</span> <b>${esc(a.holder || a.name)}</b></div>
      ${a.bank ? `<div class="kv"><span class="lbl">Bank name:</span> <b>${esc(a.bank)}</b></div>` : ""}
      ${a.number ? `<div class="kv"><span class="lbl">Account number:</span> <b>${esc(a.number)}</b></div>` : ""}
    </div>`).join("")}</div>`;
}

function paymentsBlock(inv: any): string {
  const ps = inv.payments ?? [];
  if (!ps.length) return "";
  const label: Record<string, string> = { cash: "Cash", transfer: "Bank Transfer", card: "Card", credit: "Unused credit" };
  return `<div class="block"><div class="btitle">Payment method</div>${ps.map((p: any) => `
    <div class="kv"><span>${label[p.method] ?? p.method}</span> <b>${money(p.amount, { symbol: false })}</b></div>`).join("")}</div>`;
}

/** SA-grade "professional" document: the full quotation layout — From/To blocks,
 *  TIN, item images, terms, bank details and the payment breakdown. */
function professionalHtml(inv: any, brand: Brand): string {
  const c = brand.brand_color || DEFAULT_BRAND.brand_color;
  const head = brand.header_color || "#0B0B0B";
  const onHead = readable(head);
  const b = inv.business ?? {};
  const photos = !!brand.show_photos;
  const title = inv.status === "quote" ? "QUOTATION" : "INVOICE";
  const rows = inv.lines.map((l: any) => `<tr>
    <td><span class="nm">${esc(l.name)}</span>${l.note ? `<div class="mut">${esc(l.note)}</div>` : ""}</td>
    ${photos ? `<td>${l.photo_url ? `<img class="thumb" src="${esc(l.photo_url)}"/>` : ""}</td>` : ""}
    <td class="r">${l.quantity}</td>
    <td class="r">${money(l.unit_price, { symbol: false })}</td>
    <td class="r">${discCell(l)}</td>
    <td class="r">${money(l.total, { symbol: false })}</td></tr>`).join("");

  return `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  ${invoiceFontCss()}
  html,body{-webkit-text-size-adjust:none;text-size-adjust:none}
  *{max-height:1000000px}
  body{font-family:${DOC_FONT};color:#0B0B0B;padding:20px 22px 54px;font-size:11px;margin:0}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${head};padding-bottom:10px}
  .title{font-size:24px;font-weight:700;letter-spacing:-0.5px;text-align:right}
  .num{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#555;text-align:right}
  .meta{display:flex;gap:14px;margin-top:12px}
  .meta>div{flex:1}
  .lbl{font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:#8A8A8A;font-weight:600}
  .val{font-weight:600;font-size:11px;margin-top:1px}
  .mut{color:#8A8A8A;font-size:9.5px;line-height:14px}
  table{width:100%;border-collapse:collapse;margin-top:14px}
  th{background:${head};color:${onHead};font-size:8px;letter-spacing:.09em;text-align:left;padding:6px 6px;font-weight:600}
  th.r,td.r{text-align:right}
  td{padding:6px 6px;border-bottom:1px solid #EDEDED;vertical-align:middle;font-variant-numeric:tabular-nums;font-size:11px}
  .nm{font-weight:600}
  .thumb{width:${photoPx(brand)}px;height:${photoPx(brand)}px;object-fit:cover;border-radius:4px}
  .totals{width:48%;margin-left:52%;margin-top:10px}
  .tot{display:flex;justify-content:space-between;padding:3px 0;font-variant-numeric:tabular-nums;font-size:11px}
  .tot.strong{font-weight:600;border-top:1px solid #EDEDED}
  .due{display:flex;justify-content:space-between;background:${head};color:${onHead};padding:7px 10px;border-radius:6px;margin-top:5px;font-weight:700;font-size:12px}
  .cols{display:flex;gap:18px;margin-top:18px}
  .cols>div{flex:1}
  .block{margin-bottom:12px}
  .btitle{font-weight:700;font-size:11.5px;color:${c};border-bottom:1px solid #EDEDED;padding-bottom:4px;margin-bottom:6px}
  .tgroup{margin-bottom:6px}
  .tbody{font-size:10px;line-height:15px;margin-top:1px;white-space:pre-line}
  .kv{display:flex;justify-content:space-between;font-size:10px;padding:2px 0}
  .foot{margin-top:22px;page-break-inside:avoid;display:flex;justify-content:space-between;align-items:center;gap:14px;border-top:1px solid #EDEDED;padding-top:7px;color:#8A8A8A;font-size:9.5px}
  </style></head><body>
  <div class="top">
    <div>${logoTag(brand)}<div class="val" style="font-size:15px">${esc(b.name)}</div></div>
    <div><div class="title">${title}</div><div class="num">${esc(inv.number)}</div></div>
  </div>
  <div class="meta">
    <div>
      <div class="lbl">Issue Date</div><div class="val">${longDate(inv.created_at)}</div>
      <div class="lbl" style="margin-top:9px">Due Date</div><div class="val">${inv.due_date ? longDate(inv.due_date) : "On receipt"}</div>
    </div>
    <div>
      <div class="lbl">Customer</div><div class="val">${esc(inv.customer_name)}</div>
      <div class="mut">${esc(inv.customer_phone)}</div><div class="mut">${esc(inv.customer_address ?? "")}</div>
    </div>
    <div>
      <div class="lbl">Business</div><div class="val">${esc(b.name)}</div>
      <div class="mut">${esc(b.address)}</div><div class="mut">${esc(b.email ?? b.phone ?? "")}</div>
    </div>
    <div>
      <div class="lbl">Branch</div><div class="val">${esc(inv.shop || "Head office")}</div>
      <div class="mut">Rep: ${esc(inv.created_by || "—")}</div>
      <div class="lbl" style="margin-top:9px">Tax Identification Number (TIN)</div>
      <div class="val">${esc(b.tin || "—")}</div>
    </div>
  </div>
  <table>
    <tr><th>ITEM</th>${photos ? "<th>IMAGE</th>" : ""}<th class="r">QTY</th><th class="r">RATE</th><th class="r">DISCOUNT</th><th class="r">AMOUNT</th></tr>
    ${rows}
  </table>
  <div class="totals">${totalsRows(inv, c, onHead)}</div>
  <div class="cols">
    <div>${termsBlock(inv)}${bankBlock(inv)}</div>
    <div>${paymentsBlock(inv)}${inv.note ? `<div class="block"><div class="btitle">Notes</div><div class="tbody">${esc(inv.note)}</div></div>` : ""}</div>
  </div>
  <div class="foot"><span>${esc(brand.footer || "Thanks for your patronage.")}</span>${brand.tredi_mark === false ? "" : madeWith("Crafted with")}</div>
  </body></html>`;
}

/** The printed twin of the Simple preview: an 80mm till slip. A trader hands
 *  this across the counter; the Professional document is the one they email. */
function receiptInvoiceHtml(inv: any, brand: Brand): string {
  const b = inv.business ?? {};
  const t = inv.totals ?? {};
  const paid = inv.paid ?? 0;
  const title = inv.status === "quote" ? "QUOTATION" : "INVOICE";
  const kv = (k: string, v: string, cls = "") => `<div class="kv ${cls}"><span>${k}</span><span>${v}</span></div>`;
  return `<html><head><meta charset="utf-8"><style>
  @page{size:80mm auto;margin:4mm}
  html,body{-webkit-text-size-adjust:none;text-size-adjust:none}
  *{max-height:1000000px}
  body{font-family:"Courier New",Courier,monospace;color:#000;font-size:11px;width:72mm;margin:0 auto}
  .c{text-align:center}.name{font-size:14px;font-weight:700;letter-spacing:1px}
  .rule{border-top:1px dashed #555;margin:6px 0}
  .kv{display:flex;justify-content:space-between;gap:8px}
  .big{font-size:13px;font-weight:700;margin:3px 0}
  .ln{margin-bottom:3px}.q{padding-left:8px}
  .mut{color:#444;font-size:10px}
  </style></head><body>
  <div class="c">
    ${brand.logo_url ? `<img src="${esc(brand.logo_url)}" style="height:34px;max-width:60%;object-fit:contain"/><br/>` : ""}
    <div class="name">${esc(String(b.name ?? "").toUpperCase())}</div>
    ${b.address ? `<div class="mut">${esc(b.address)}</div>` : ""}
    ${b.phone ? `<div class="mut">${esc(b.phone)}</div>` : ""}
    ${b.tin ? `<div class="mut">TIN ${esc(b.tin)}</div>` : ""}
  </div>
  <div class="rule"></div>
  <div class="c">${title} ${esc(inv.number)}<br/><span class="mut">${longDate(inv.created_at)}</span>
    ${inv.customer_name ? `<br/><span class="mut">Customer: ${esc(inv.customer_name)}</span>` : ""}</div>
  <div class="rule"></div>
  ${(inv.lines ?? []).map((l: any) => `<div class="ln">${esc(l.name)}
    ${kv(`<span class="q">${l.quantity} ${esc(l.unit || "")} x ${money(l.unit_price, { symbol: false })}</span>`, money(l.total, { symbol: false }))}</div>`).join("")}
  <div class="rule"></div>
  ${kv("Subtotal", money(t.taxable ?? t.gross ?? 0, { symbol: false }))}
  ${t.vat ? kv(`VAT ${inv.vat_rate ?? ""}%`, money(t.vat, { symbol: false })) : ""}
  ${t.shipping ? kv("Shipping", money(t.shipping, { symbol: false })) : ""}
  ${kv("TOTAL", money(t.total ?? 0), "big")}
  ${paid > 0 ? kv("Paid", money(paid, { symbol: false })) : ""}
  ${paid > 0 ? kv("Balance", money(inv.due ?? (t.total ?? 0) - paid, { symbol: false }), "big") : ""}
  <div class="rule"></div>
  <div class="c">Thank you for your patronage<div class="mut">${esc(brand.footer || "Goods sold in good condition")}</div></div>
  ${brand.tredi_mark === false ? "" : `<div class="c mut" style="display:flex;justify-content:center;align-items:center;gap:4px;margin-top:6px;font-size:9px">Powered by <img src="${BRAND_MARK}" width="51" height="11" style="display:block"/></div>`}
  </body></html>`;
}

export function buildInvoiceHtml(inv: any, brandIn?: Partial<Brand>): string {
  const brand: Brand = { ...DEFAULT_BRAND, ...(brandIn ?? {}) };
  if (brand.template === "receipt") return receiptInvoiceHtml(inv, brand);
  if (brand.template === "t7") return professionalHtml(inv, brand);
  const c = brand.brand_color || DEFAULT_BRAND.brand_color;
  const onC = readable(c);
  const head = brand.header_color || c;
  const onHead = readable(head);
  const b = inv.business ?? {};
  const photos = !!brand.show_photos;
  const title = inv.status === "quote" ? "Quotation" : "Invoice";

  const rows = inv.lines.map((l: any, i: number) => `<tr${brand.template === "t5" && i % 2 ? ' class="z"' : ""}>
    <td>${photos && l.photo_url ? `<img src="${esc(l.photo_url)}" class="thumb"/>` : ""}<span class="nm">${esc(l.name)}</span>${l.note ? `<div class="mut">${esc(l.note)}</div>` : ""}</td>
    <td class="r">${l.quantity}</td>
    <td class="r">${money(l.unit_price, { symbol: false })}</td>
    <td class="r">${discCell(l)}</td>
    <td class="r">${money(l.total, { symbol: false })}</td></tr>`).join("");

  const meta = `<div class="lbl">${title}</div><div class="num">${esc(inv.number)}</div>
    <div class="mut">${longDate(inv.created_at)}</div>${inv.due_date ? `<div class="mut">Due ${longDate(inv.due_date)}</div>` : ""}`;
  const biz = `<div class="biz">${esc(b.name)}</div><div class="mut">${esc(b.address)}</div>
    <div class="mut">${[b.tin ? `TIN ${esc(b.tin)}` : "", esc(b.phone), esc(b.email)].filter(Boolean).join(" · ")}</div>`;

  const headers: Record<string, string> = {
    t1: `<div class="row top">${`<div>${logoTag(brand)}${biz}</div>`}<div class="right">${meta}</div></div><hr/>`,
    t2: `<div class="band"><div>${biz}</div><div class="right">${meta}</div></div>${brand.logo_url ? `<div class="row" style="margin-top:10px">${logoTag(brand)}</div>` : ""}`,
    t3: `<div class="center">${logoTag(brand)}<div class="biz big">${esc(b.name)}</div><div class="mut">${[esc(b.address), b.tin ? `TIN ${esc(b.tin)}` : "", esc(b.phone), esc(b.email)].filter(Boolean).join(" · ")}</div></div>
         <div class="row rule">${`<div><div class="lbl">Bill to</div><div class="nm">${esc(inv.customer_name)}</div><div class="mut">${esc(inv.customer_phone)}</div></div>`}<div class="right">${meta}</div></div>`,
    t4: `<div class="accent"></div><div class="row top">${`<div>${logoTag(brand)}${biz}</div>`}<div class="right">${meta}</div></div><hr/>`,
    t5: `<div class="dark"><div>${logoTag(brand, Math.min(brand.logo_size, 70))}<div class="biz inv">${esc(b.name)}</div><div class="mut inv">${esc(b.address)}</div><div class="mut inv">${[b.tin ? `TIN ${esc(b.tin)}` : "", esc(b.phone), esc(b.email)].filter(Boolean).join(" · ")}</div></div><div class="right">${meta}</div></div>`,
    t6: `<div class="row top compact">${`<div>${biz}</div>`}<div class="right">${meta}</div></div><hr/>`,
  };

  const billTo = brand.template === "t3" ? "" : `<div class="lbl mt">Bill to</div><div class="nm">${esc(inv.customer_name)}</div><div class="mut">${esc(inv.customer_phone)}</div>`;

  const perTemplate: Record<string, string> = {
    t1: `.num{font-weight:700;font-size:14px}`,
    t2: `.band{background:${head};color:${onHead};padding:12px 14px;border-radius:9px;display:flex;justify-content:space-between}
         .band .mut,.band .lbl{color:${onHead};opacity:.75}.band .biz{color:${onHead}}`,
    t3: `.center{text-align:center;padding-bottom:10px}.center img{margin:0 auto 6px;display:block}
         .big{font-size:20px}.rule{border-top:1px solid #E5EEEB;border-bottom:1px solid #E5EEEB;padding:8px 0;margin-top:8px}`,
    t4: `.accent{position:fixed;left:0;top:0;bottom:0;width:9px;background:${head}}body{padding-left:30px}.foot{left:30px}`,
    t5: `.dark{background:${head};color:${onHead};padding:14px 16px;border-radius:10px;display:flex;justify-content:space-between}
         .inv{color:${onHead}}.dark .mut,.dark .lbl{color:${onHead};opacity:.7}
         table th{background:#F7FAF9}tr.z td{background:#FAFCFB}`,
    t6: `body{font-size:10.5px;padding:16px 16px 50px}.compact .biz{font-size:13px}td,th{padding:4px 0}.foot{left:16px;right:16px}`,
  };

  return `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  ${invoiceFontCss()}
  html,body{-webkit-text-size-adjust:none;text-size-adjust:none}
  *{max-height:1000000px}
  body{font-family:${DOC_FONT};color:#06241F;padding:20px 22px 54px;font-size:11px;margin:0}
  .row{display:flex;justify-content:space-between;align-items:flex-start}
  .right{text-align:right}.r{text-align:right}.mt{margin-top:10px}
  .biz{font-size:16px;font-weight:700;color:${c}}
  .num{font-weight:600;font-variant-numeric:tabular-nums}
  .nm{font-weight:600}
  .mut{color:#93A9A4;font-size:9.5px}
  .lbl{font-size:8px;letter-spacing:.09em;color:#93A9A4;text-transform:uppercase;font-weight:600}
  hr{border:0;border-top:1px solid #E5EEEB;margin:10px 0}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th{color:#93A9A4;font-size:8.5px;text-align:left;padding:5px 4px;letter-spacing:.06em;font-weight:600}
  td{padding:6px 4px;border-top:1px solid #E5EEEB;font-variant-numeric:tabular-nums;vertical-align:middle;font-size:11px}
  .thumb{width:${photoPx(brand)}px;height:${photoPx(brand)}px;border-radius:5px;object-fit:cover;margin-right:7px;vertical-align:middle}
  .tot{display:flex;justify-content:space-between;margin-top:3px;font-size:11px}
  .tot.strong{font-weight:600}
  .due{display:flex;justify-content:space-between;background:${c};color:${onC};padding:8px 10px;border-radius:7px;margin-top:7px;font-weight:700;font-size:12px}
  .block{margin-top:12px}
  .btitle{font-weight:700;font-size:11.5px;color:${c};margin-bottom:4px}
  .tgroup{margin-bottom:6px}.tbody{font-size:10px;line-height:15px;color:#3B4A47;white-space:pre-line}
  .kv{display:flex;justify-content:space-between;font-size:10px;padding:2px 0}
  .foot{margin-top:22px;display:flex;justify-content:space-between;align-items:center;gap:14px;border-top:1px solid #E5EEEB;padding-top:7px;color:#93A9A4;font-size:9.5px;page-break-inside:avoid}
  tr,.tot,.due,.block,.tgroup{page-break-inside:avoid;break-inside:avoid}
  ${perTemplate[brand.template] ?? ""}
  </style></head><body>
  ${headers[brand.template] ?? headers.t1}
  ${billTo}
  <table><tr><th>ITEM</th><th class="r">QTY</th><th class="r">RATE</th><th class="r">DISCOUNT</th><th class="r">AMOUNT</th></tr>${rows}</table>
  <hr/>
  ${totalsRows(inv, c, onC)}
  ${termsBlock(inv)}${bankBlock(inv)}${paymentsBlock(inv)}
  ${inv.note ? `<p class="mut" style="margin-top:14px">${esc(inv.note)}</p>` : ""}
  <div class="foot"><span>${esc(brand.footer || "Thank you for your business")}</span>${brand.tredi_mark === false ? "" : madeWith("Made with")}</div>
  </body></html>`;
}

/** Counter receipt for a quick sale — the paper a walk-in customer takes away.
 *  Deliberately narrow so it prints on A4 or on an 80mm roll. */
/** 13.2 — the waybill rides along with the invoice, so it carries the same
 *  letterhead: the logo, the brand colour and the business block. Prices stay
 *  off unless the trader asks for them, because goods in transit are not a bill. */
export function buildWaybillHtml(w: any, brandIn?: Partial<Brand>): string {
  const brand = { ...DEFAULT_BRAND, ...(brandIn ?? {}) } as Brand;
  const c = brand.brand_color || DEFAULT_BRAND.brand_color;
  const on = readable(c);
  const b = w.business ?? {};
  const prices = !!w.show_prices;
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    ${invoiceFontCss()}
    html,body{-webkit-text-size-adjust:none;text-size-adjust:none}
    *{box-sizing:border-box;max-height:1000000px}
    body{margin:0;padding:22px;font-family:${DOC_FONT};color:#06241F;background:#fff}
    .paper{max-width:760px;margin:0 auto}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid ${c};padding-bottom:12px}
    .biz{font-size:19px;font-weight:800;color:${c};letter-spacing:-0.3px}
    .meta{font-size:11px;color:#6B807D;line-height:1.55}
    .doc{text-align:right}
    .tag{display:inline-block;background:${c};color:${on};font-size:12px;font-weight:800;padding:4px 10px;border-radius:5px;letter-spacing:.8px}
    .num{font-size:13px;font-weight:800;margin-top:6px}
    .grid{display:flex;gap:14px;margin-top:14px}
    .box{flex:1;border:1px solid #E3EAE8;border-radius:9px;padding:10px}
    .lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:.8px;color:#93A9A4}
    .val{font-size:12.5px;font-weight:700;margin-top:3px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th{font-size:9.5px;text-transform:uppercase;letter-spacing:.7px;color:#FFFFFF;background:${c};text-align:right;padding:8px 10px}
    th.l,td.l{text-align:left}
    td{font-size:12.5px;padding:9px 10px;border-bottom:1px solid #EEF3F2;text-align:right;font-variant-numeric:tabular-nums}
    .packs{display:flex;justify-content:space-between;background:#F4F8F7;border-radius:9px;padding:10px 12px;margin-top:12px;font-size:13px;font-weight:800}
    .sign{display:flex;gap:28px;margin-top:34px}
    .sline{flex:1;border-top:1px solid #9FB4B0;padding-top:6px;font-size:10.5px;color:#6B807D}
    .foot{margin-top:18px;padding-top:9px;border-top:1px solid #E3EAE8;font-size:10.5px;color:#6B807D;display:flex;justify-content:space-between;align-items:center;gap:8px}
  </style></head><body><div class="paper">
    <div class="head">
      <div>
        ${logoTag(brand, 44)}
        <div class="biz">${esc(b.name)}</div>
        <div class="meta">${esc(b.address)}${b.phone ? `<br/>${esc(b.phone)}` : ""}${b.email ? `<br/>${esc(b.email)}` : ""}${b.tin ? `<br/>TIN ${esc(b.tin)}` : ""}</div>
      </div>
      <div class="doc">
        <span class="tag">WAYBILL</span>
        <div class="num">${esc(w.number)}</div>
        <div class="meta">${longDate(w.created_at)}${w.invoice_number ? `<br/>For invoice <b>${esc(w.invoice_number)}</b>` : ""}</div>
      </div>
    </div>
    <div class="grid">
      <div class="box"><div class="lbl">Deliver to</div><div class="val">${esc(w.customer_name || "—")}</div><div class="meta">${esc(w.deliver_to)}</div></div>
      <div class="box"><div class="lbl">Driver</div><div class="val">${esc(w.driver || "—")}</div><div class="lbl" style="margin-top:8px">Vehicle</div><div class="val">${esc(w.vehicle || "—")}</div></div>
    </div>
    <table>
      <thead><tr><th class="l">Item</th><th>Unit</th><th>Qty</th>${prices ? "<th>Rate</th><th>Amount</th>" : ""}</tr></thead>
      <tbody>${(w.lines ?? []).map((l: any) => `<tr>
        <td class="l">${esc(l.name)}</td><td>${esc(l.unit || "Piece")}</td><td>${l.quantity}</td>
        ${prices ? `<td>${money(l.unit_price ?? 0, { symbol: false })}</td><td>${money((l.unit_price ?? 0) * (l.quantity ?? 0), { symbol: false })}</td>` : ""}
      </tr>`).join("")}</tbody>
    </table>
    <div class="packs"><span>Total packages</span><span>${w.packages}</span></div>
    <div class="sign">
      <div class="sline">Received in good condition — name &amp; signature</div>
      <div class="sline">Date</div>
    </div>
    <div class="foot"><span>Goods remain the property of ${esc(b.name)} until paid for in full.</span>${brand.tredi_mark === false ? "" : madeWith("Made with")}</div>
  </div></body></html>`;
}

export function buildReceiptHtml(sale: any, brandIn?: Partial<Brand>): string {
  const brand = { ...DEFAULT_BRAND, ...(brandIn ?? {}) } as Brand;
  const c = brand.brand_color || DEFAULT_BRAND.brand_color;
  const on = readable(c);
  const b = sale.business ?? {};
  const t = sale.totals ?? {};
  const method: Record<string, string> = { cash: "Cash", transfer: "Bank transfer", card: "Card", credit: "On credit" };
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    ${invoiceFontCss()}
    html,body{-webkit-text-size-adjust:none;text-size-adjust:none}
    *{box-sizing:border-box;max-height:1000000px}
    body{margin:0;padding:18px;font-family:${DOC_FONT};color:#06241F;background:#fff}
    .paper{max-width:420px;margin:0 auto}
    .head{text-align:center;border-bottom:2px solid ${c};padding-bottom:10px}
    .biz{font-size:18px;font-weight:800;color:${c};letter-spacing:-0.3px}
    .meta{font-size:11px;color:#6B807D;margin-top:3px;line-height:1.5}
    .tag{display:inline-block;margin-top:8px;background:${c};color:${on};font-size:11px;font-weight:700;padding:3px 9px;border-radius:5px;letter-spacing:.6px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th{font-size:9.5px;text-transform:uppercase;letter-spacing:.7px;color:#6B807D;text-align:right;padding:6px 0;border-bottom:1px solid #E3EAE8}
    th.l,td.l{text-align:left}
    td{font-size:12px;padding:7px 0;border-bottom:1px dashed #E3EAE8;text-align:right;font-variant-numeric:tabular-nums}
    .tot{display:flex;justify-content:space-between;font-size:12px;padding:4px 0}
    .grand{display:flex;justify-content:space-between;background:${c};color:${on};font-size:14px;font-weight:800;padding:9px 10px;border-radius:7px;margin-top:8px}
    .foot{margin-top:14px;padding-top:9px;border-top:1px solid #E3EAE8;font-size:10.5px;color:#6B807D;display:flex;justify-content:space-between;align-items:center;gap:8px}
  </style></head><body><div class="paper">
    <div class="head">
      ${logoTag(brand, 46)}
      <div class="biz">${esc(b.name)}</div>
      <div class="meta">${esc(b.address)}${b.phone ? `<br/>${esc(b.phone)}` : ""}${b.email ? `<br/>${esc(b.email)}` : ""}${b.tin ? `<br/>TIN ${esc(b.tin)}` : ""}</div>
      <div class="tag">SALES RECEIPT</div>
    </div>
    <div class="meta" style="margin-top:10px">
      Receipt <b>${esc(sale.number)}</b><br/>
      ${longDate(sale.created_at)}${sale.shop ? ` · ${esc(sale.shop)}` : ""}<br/>
      Customer: ${esc(sale.customer_name || "Cash sale")}${sale.created_by ? `<br/>Served by ${esc(sale.created_by)}` : ""}
    </div>
    <table>
      <thead><tr><th class="l">Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>${(sale.lines ?? []).map((l: any) => `<tr>
        <td class="l">${esc(l.name)}${l.unit ? `<div style="font-size:10px;color:#6B807D">${esc(l.unit)}</div>` : ""}</td>
        <td>${l.quantity}</td><td>${money(l.unit_price, { symbol: false })}</td><td>${money(l.total, { symbol: false })}</td>
      </tr>`).join("")}</tbody>
    </table>
    <div style="margin-top:10px">
      <div class="tot"><span>Gross total</span><span>${money(t.gross, { symbol: false })}</span></div>
      ${t.line_discount ? `<div class="tot"><span>Discount</span><span>${money(t.line_discount, { symbol: false })}</span></div>` : ""}
      ${t.vat ? `<div class="tot"><span>VAT</span><span>${money(t.vat, { symbol: false })}</span></div>` : ""}
      <div class="grand"><span>Total paid</span><span>${money(t.total)}</span></div>
      <div class="tot" style="margin-top:6px"><span>Paid by</span><span><b>${method[sale.method] ?? esc(sale.method)}</b>${sale.account_name ? ` · ${esc(sale.account_name)}` : ""}</span></div>
      ${sale.method === "cash" && sale.tendered ? `<div class="tot"><span>Cash received</span><span>${money(sale.tendered, { symbol: false })}</span></div>
      <div class="tot"><span>Change given</span><span>${money(sale.change, { symbol: false })}</span></div>` : ""}
    </div>
    <div class="foot"><span>Thank you for your business.</span>${brand.tredi_mark === false ? "" : madeWith("Made with")}</div>
  </div></body></html>`;
}
