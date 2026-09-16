// 04.10b Invoice templates — the six document looks the owner can pick from, and
// the HTML that prints them. Everything branded (logo, colour, logo size, item
// photos) is read from /settings/invoice so one setting drives every document.
import { longDate, money } from "@/src/format";

export type TemplateKey = "t1" | "t2" | "t3" | "t4" | "t5" | "t6" | "t7";

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
  { key: "t7", name: "Professional", note: "Full quotation · From/To, TIN, terms, bank details" },
];

export const SWATCHES = ["#06241F", "#FFFFFF", "#00C98D", "#014747", "#2C6ECB", "#7A4BD0", "#D93F45", "#E58A1A"];
export const LOGO_SIZES = [
  { key: 60, label: "Small", note: "60px" },
  { key: 90, label: "Medium", note: "90px" },
  { key: 120, label: "Large", note: "120px" },
];

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function readable(hex: string): string {
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

  return `<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,Helvetica,Arial;color:#0B0B0B;padding:30px 28px;font-size:11.5px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${head};padding-bottom:14px}
  .title{font-size:26px;font-weight:800;letter-spacing:-0.5px;text-align:right}
  .num{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#555;text-align:right}
  .meta{display:flex;gap:18px;margin-top:16px}
  .meta>div{flex:1}
  .lbl{font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#8A8A8A;font-weight:700}
  .val{font-weight:700;font-size:12px;margin-top:2px}
  .mut{color:#8A8A8A;font-size:10px;line-height:15px}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  th{background:${head};color:${onHead};font-size:8.5px;letter-spacing:.09em;text-align:left;padding:8px 6px}
  th.r,td.r{text-align:right}
  td{padding:9px 6px;border-bottom:1px solid #EDEDED;vertical-align:middle;font-variant-numeric:tabular-nums}
  .nm{font-weight:700}
  .thumb{width:34px;height:34px;object-fit:cover;border-radius:4px}
  .totals{width:48%;margin-left:52%;margin-top:14px}
  .tot{display:flex;justify-content:space-between;padding:4px 0;font-variant-numeric:tabular-nums}
  .tot.strong{font-weight:700;border-top:1px solid #EDEDED}
  .due{display:flex;justify-content:space-between;background:${head};color:${onHead};padding:9px 11px;border-radius:6px;margin-top:6px;font-weight:800}
  .cols{display:flex;gap:22px;margin-top:26px}
  .cols>div{flex:1}
  .block{margin-bottom:16px}
  .btitle{font-weight:800;font-size:12.5px;color:${c};border-bottom:1px solid #EDEDED;padding-bottom:5px;margin-bottom:8px}
  .tgroup{margin-bottom:8px}
  .tbody{font-size:10.5px;line-height:16px;margin-top:2px}
  .kv{display:flex;justify-content:space-between;font-size:10.5px;padding:2px 0}
  .foot{display:flex;justify-content:space-between;border-top:1px solid #EDEDED;margin-top:24px;padding-top:9px;color:#8A8A8A;font-size:10px}
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
      <div class="lbl">From</div><div class="val">${esc(inv.shop || "Head office")}</div>
      <div class="mut">Shop Rep: ${esc(inv.created_by || "—")}</div>
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
  <div class="foot"><span>${esc(brand.footer || "Thanks for your patronage.")}</span>${brand.tredi_mark === false ? "" : `<span style="color:${c};font-weight:700">■ Crafted with tredi</span>`}</div>
  </body></html>`;
}

export function buildInvoiceHtml(inv: any, brandIn?: Partial<Brand>): string {
  const brand: Brand = { ...DEFAULT_BRAND, ...(brandIn ?? {}) };
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
    t1: `.num{font-weight:800;font-size:15px}`,
    t2: `.band{background:${head};color:${onHead};padding:16px 18px;border-radius:10px;display:flex;justify-content:space-between}
         .band .mut,.band .lbl{color:${onHead};opacity:.75}.band .biz{color:${onHead}}`,
    t3: `.center{text-align:center;padding-bottom:12px}.center img{margin:0 auto 8px;display:block}
         .big{font-size:22px}.rule{border-top:1px solid #E5EEEB;border-bottom:1px solid #E5EEEB;padding:10px 0;margin-top:10px}`,
    t4: `.accent{position:fixed;left:0;top:0;bottom:0;width:10px;background:${head}}body{padding-left:38px}`,
    t5: `.dark{background:${head};color:${onHead};padding:20px;border-radius:12px;display:flex;justify-content:space-between}
         .inv{color:${onHead}}.dark .mut,.dark .lbl{color:${onHead};opacity:.7}
         table th{background:#F7FAF9}tr.z td{background:#FAFCFB}`,
    t6: `body{font-size:11px;padding:20px}.compact .biz{font-size:14px}td,th{padding:5px 0}`,
  };

  return `<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,Helvetica,Arial;color:#06241F;padding:28px;font-size:12px}
  .row{display:flex;justify-content:space-between;align-items:flex-start}
  .right{text-align:right}.r{text-align:right}.mt{margin-top:14px}
  .biz{font-size:18px;font-weight:800;color:${c}}
  .num{font-weight:700;font-variant-numeric:tabular-nums}
  .nm{font-weight:700}
  .mut{color:#93A9A4;font-size:10.5px}
  .lbl{font-size:9px;letter-spacing:.09em;color:#93A9A4;text-transform:uppercase;font-weight:700}
  hr{border:0;border-top:1px solid #E5EEEB;margin:14px 0}
  table{width:100%;border-collapse:collapse;margin-top:14px}
  th{color:#93A9A4;font-size:9.5px;text-align:left;padding:6px 4px;letter-spacing:.06em}
  td{padding:8px 4px;border-top:1px solid #E5EEEB;font-variant-numeric:tabular-nums;vertical-align:middle}
  .thumb{width:26px;height:26px;border-radius:5px;object-fit:cover;margin-right:8px;vertical-align:middle}
  .tot{display:flex;justify-content:space-between;margin-top:5px}
  .tot.strong{font-weight:700}
  .due{display:flex;justify-content:space-between;background:${c};color:${onC};padding:10px 12px;border-radius:8px;margin-top:10px;font-weight:800}
  .block{margin-top:16px}
  .btitle{font-weight:800;font-size:12px;color:${c};margin-bottom:5px}
  .tgroup{margin-bottom:7px}.tbody{font-size:10.5px;line-height:16px;color:#3B4A47}
  .kv{display:flex;justify-content:space-between;font-size:10.5px;padding:2px 0}
  .foot{display:flex;justify-content:space-between;border-top:1px solid #E5EEEB;padding-top:9px;margin-top:20px;color:#93A9A4;font-size:10px}
  ${perTemplate[brand.template] ?? ""}
  </style></head><body>
  ${headers[brand.template] ?? headers.t1}
  ${billTo}
  <table><tr><th>ITEM</th><th class="r">QTY</th><th class="r">RATE</th><th class="r">DISCOUNT</th><th class="r">AMOUNT</th></tr>${rows}</table>
  <hr/>
  ${totalsRows(inv, c, onC)}
  ${termsBlock(inv)}${bankBlock(inv)}${paymentsBlock(inv)}
  <p class="mut" style="margin-top:18px">${esc(inv.note || "Goods sold are not returnable after 7 days.")}</p>
  <div class="foot"><span>${esc(brand.footer || "Thank you for your business")}</span>${brand.tredi_mark === false ? "" : `<span style="color:${c};font-weight:700">■ Made with tredi</span>`}</div>
  </body></html>`;
}
