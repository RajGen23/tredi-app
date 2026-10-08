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
  footer?: string;
  tredi_mark?: boolean;
};

export const DEFAULT_BRAND: Brand = { template: "t3", brand_color: "#014747", logo_url: "", logo_size: 90 };

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

/** The tredi mark, inlined so a printed invoice never depends on the network. */
const TREDI_MARK = "data:image/png;base64,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";

const madeWith = (label: string) =>
  `<span style="flex:0 0 auto;display:flex;align-items:center;gap:6px;padding-right:2px">${label}<img src="${TREDI_MARK}" width="42" height="13" style="display:block"/></span>`;

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
  const part = (label: string, text: string) => (text ? `<div class="tgroup"><div class="lbl">${label}</div><div class="tbody">${esc(text)}</div></div>` : "");
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
  .thumb{width:30px;height:30px;object-fit:cover;border-radius:4px}
  .totals{width:48%;margin-left:52%;margin-top:10px}
  .tot{display:flex;justify-content:space-between;padding:3px 0;font-variant-numeric:tabular-nums;font-size:11px}
  .tot.strong{font-weight:600;border-top:1px solid #EDEDED}
  .due{display:flex;justify-content:space-between;background:${head};color:${onHead};padding:7px 10px;border-radius:6px;margin-top:5px;font-weight:700;font-size:12px}
  .cols{display:flex;gap:18px;margin-top:18px}
  .cols>div{flex:1}
  .block{margin-bottom:12px}
  .btitle{font-weight:700;font-size:11.5px;color:${c};border-bottom:1px solid #EDEDED;padding-bottom:4px;margin-bottom:6px}
  .tgroup{margin-bottom:6px}
  .tbody{font-size:10px;line-height:15px;margin-top:1px}
  .kv{display:flex;justify-content:space-between;font-size:10px;padding:2px 0}
  .foot{position:fixed;left:22px;right:22px;bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:14px;border-top:1px solid #EDEDED;padding-top:7px;color:#8A8A8A;font-size:9.5px}
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
  ${brand.tredi_mark === false ? "" : `<div class="c mut" style="display:flex;justify-content:center;align-items:center;gap:4px;margin-top:6px;font-size:9px">Powered by <img src="${TREDI_MARK}" width="36" height="11" style="display:block"/></div>`}
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
    <div class="mut">${b.tin ? `TIN ${esc(b.tin)}` : ""}${b.phone ? ` · ${esc(b.phone)}` : ""}</div>`;

  const headers: Record<string, string> = {
    t1: `<div class="row top">${`<div>${logoTag(brand)}${biz}</div>`}<div class="right">${meta}</div></div><hr/>`,
    t2: `<div class="band"><div>${biz}</div><div class="right">${meta}</div></div>${brand.logo_url ? `<div class="row" style="margin-top:10px">${logoTag(brand)}</div>` : ""}`,
    t3: `<div class="center">${logoTag(brand)}<div class="biz big">${esc(b.name)}</div><div class="mut">${esc(b.address)}${b.phone ? ` · ${esc(b.phone)}` : ""}</div></div>
         <div class="row rule">${`<div><div class="lbl">Bill to</div><div class="nm">${esc(inv.customer_name)}</div><div class="mut">${esc(inv.customer_phone)}</div></div>`}<div class="right">${meta}</div></div>`,
    t4: `<div class="accent"></div><div class="row top">${`<div>${logoTag(brand)}${biz}</div>`}<div class="right">${meta}</div></div><hr/>`,
    t5: `<div class="dark"><div>${logoTag(brand, Math.min(brand.logo_size, 70))}<div class="biz inv">${esc(b.name)}</div><div class="mut inv">${esc(b.address)}</div></div><div class="right">${meta}</div></div>`,
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
  .thumb{width:24px;height:24px;border-radius:5px;object-fit:cover;margin-right:7px;vertical-align:middle}
  .tot{display:flex;justify-content:space-between;margin-top:3px;font-size:11px}
  .tot.strong{font-weight:600}
  .due{display:flex;justify-content:space-between;background:${c};color:${onC};padding:8px 10px;border-radius:7px;margin-top:7px;font-weight:700;font-size:12px}
  .block{margin-top:12px}
  .btitle{font-weight:700;font-size:11.5px;color:${c};margin-bottom:4px}
  .tgroup{margin-bottom:6px}.tbody{font-size:10px;line-height:15px;color:#3B4A47}
  .kv{display:flex;justify-content:space-between;font-size:10px;padding:2px 0}
  .foot{position:fixed;left:22px;right:22px;bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:14px;border-top:1px solid #E5EEEB;padding-top:7px;color:#93A9A4;font-size:9.5px}
  ${perTemplate[brand.template] ?? ""}
  </style></head><body>
  ${headers[brand.template] ?? headers.t1}
  ${billTo}
  <table><tr><th>ITEM</th><th class="r">QTY</th><th class="r">RATE</th><th class="r">DISCOUNT</th><th class="r">AMOUNT</th></tr>${rows}</table>
  <hr/>
  ${totalsRows(inv, c, onC)}
  ${termsBlock(inv)}${bankBlock(inv)}${paymentsBlock(inv)}
  <p class="mut" style="margin-top:14px">${esc(inv.note || "Goods sold are not returnable after 7 days.")}</p>
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
        <div class="meta">${esc(b.address)}${b.phone ? `<br/>${esc(b.phone)}` : ""}${b.tin ? `<br/>TIN ${esc(b.tin)}` : ""}</div>
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
      <div class="meta">${esc(b.address)}${b.phone ? `<br/>${esc(b.phone)}` : ""}${b.tin ? `<br/>TIN ${esc(b.tin)}` : ""}</div>
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
