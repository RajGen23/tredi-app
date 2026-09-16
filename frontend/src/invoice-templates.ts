// 04.10b Invoice templates — the six document looks the owner can pick from, and
// the HTML that prints them. Everything branded (logo, colour, logo size, item
// photos) is read from /settings/invoice so one setting drives every document.
import { longDate, money } from "@/src/format";

export type TemplateKey = "t1" | "t2" | "t3" | "t4" | "t5" | "t6";

export type Brand = {
  template: TemplateKey;
  brand_color: string;
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

export function buildInvoiceHtml(inv: any, brandIn?: Partial<Brand>): string {
  const brand: Brand = { ...DEFAULT_BRAND, ...(brandIn ?? {}) };
  const c = brand.brand_color || DEFAULT_BRAND.brand_color;
  const onC = readable(c);
  const b = inv.business ?? {};
  const hasDisc = inv.lines.some((l: any) => l.discount > 0);
  const photos = !!brand.show_photos;
  const title = inv.status === "quote" ? "Quotation" : "Invoice";

  const rows = inv.lines.map((l: any, i: number) => `<tr${brand.template === "t5" && i % 2 ? ' class="z"' : ""}>
    <td>${photos && l.photo_url ? `<img src="${esc(l.photo_url)}" class="thumb"/>` : ""}<span class="nm">${esc(l.name)}</span>${l.note ? `<div class="mut">${esc(l.note)}</div>` : ""}</td>
    <td class="r">${l.quantity}</td>
    <td class="r">${money(l.unit_price, { symbol: false })}</td>
    ${hasDisc ? `<td class="r">${l.discount ? money(l.discount, { symbol: false }) : "—"}</td>` : ""}
    <td class="r">${money(l.total, { symbol: false })}</td></tr>`).join("");

  const meta = `<div class="lbl">${title}</div><div class="num">${esc(inv.number)}</div>
    <div class="mut">${longDate(inv.created_at)}</div>${inv.due_date ? `<div class="mut">Due ${longDate(inv.due_date)}</div>` : ""}`;
  const biz = `<div class="biz">${esc(b.name)}</div><div class="mut">${esc(b.address)}</div>
    <div class="mut">${b.tin ? `TIN ${esc(b.tin)}` : ""}${b.phone ? ` · ${esc(b.phone)}` : ""}</div>`;

  const headers: Record<TemplateKey, string> = {
    t1: `<div class="row top">${`<div>${logoTag(brand)}${biz}</div>`}<div class="right">${meta}</div></div><hr/>`,
    t2: `<div class="band"><div>${biz}</div><div class="right">${meta}</div></div>${brand.logo_url ? `<div class="row" style="margin-top:10px">${logoTag(brand)}</div>` : ""}`,
    t3: `<div class="center">${logoTag(brand)}<div class="biz big">${esc(b.name)}</div><div class="mut">${esc(b.address)}${b.phone ? ` · ${esc(b.phone)}` : ""}</div></div>
         <div class="row rule">${`<div><div class="lbl">Bill to</div><div class="nm">${esc(inv.customer_name)}</div><div class="mut">${esc(inv.customer_phone)}</div></div>`}<div class="right">${meta}</div></div>`,
    t4: `<div class="accent"></div><div class="row top">${`<div>${logoTag(brand)}${biz}</div>`}<div class="right">${meta}</div></div><hr/>`,
    t5: `<div class="dark"><div>${logoTag(brand, Math.min(brand.logo_size, 70))}<div class="biz inv">${esc(b.name)}</div><div class="mut inv">${esc(b.address)}</div></div><div class="right">${meta}</div></div>`,
    t6: `<div class="row top compact">${`<div>${biz}</div>`}<div class="right">${meta}</div></div><hr/>`,
  };

  const billTo = brand.template === "t3" ? "" : `<div class="lbl mt">Bill to</div><div class="nm">${esc(inv.customer_name)}</div><div class="mut">${esc(inv.customer_phone)}</div>`;

  const perTemplate: Record<TemplateKey, string> = {
    t1: `.num{font-weight:800;font-size:15px}`,
    t2: `.band{background:${c};color:${onC};padding:16px 18px;border-radius:10px;display:flex;justify-content:space-between}
         .band .mut,.band .lbl{color:${onC};opacity:.75}.band .biz{color:${onC}}`,
    t3: `.center{text-align:center;padding-bottom:12px}.center img{margin:0 auto 8px;display:block}
         .big{font-size:22px}.rule{border-top:1px solid #E5EEEB;border-bottom:1px solid #E5EEEB;padding:10px 0;margin-top:10px}`,
    t4: `.accent{position:fixed;left:0;top:0;bottom:0;width:10px;background:${c}}body{padding-left:38px}`,
    t5: `.dark{background:${c};color:${onC};padding:20px;border-radius:12px;display:flex;justify-content:space-between}
         .inv{color:${onC}}.dark .mut,.dark .lbl{color:${onC};opacity:.7}
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
  .due{display:flex;justify-content:space-between;background:${c};color:${onC};padding:10px 12px;border-radius:8px;margin-top:10px;font-weight:800}
  .foot{display:flex;justify-content:space-between;border-top:1px solid #E5EEEB;padding-top:9px;margin-top:20px;color:#93A9A4;font-size:10px}
  ${perTemplate[brand.template]}
  </style></head><body>
  ${headers[brand.template]}
  ${billTo}
  <table><tr><th>ITEM</th><th class="r">QTY</th><th class="r">RATE</th>${hasDisc ? '<th class="r">DISCOUNT</th>' : ""}<th class="r">AMOUNT</th></tr>${rows}</table>
  <hr/>
  <div class="tot"><span>Gross</span><span>${money(inv.totals.gross, { symbol: false })}</span></div>
  ${inv.totals.line_discount ? `<div class="tot"><span>Line discounts</span><span>(${money(inv.totals.line_discount, { symbol: false })})</span></div>` : ""}
  ${inv.totals.invoice_discount ? `<div class="tot"><span>Less discount</span><span>(${money(inv.totals.invoice_discount, { symbol: false })})</span></div>` : ""}
  ${inv.totals.vat ? `<div class="tot"><span>VAT ${inv.vat_rate}%</span><span>${money(inv.totals.vat, { symbol: false })}</span></div>` : ""}
  <div class="tot"><span>Paid to date</span><span>${money(inv.paid ?? 0, { symbol: false })}</span></div>
  <div class="due"><span>Balance due</span><span>${money(inv.due ?? inv.totals.total)}</span></div>
  <p class="mut" style="margin-top:18px">${esc(inv.note || "Goods sold are not returnable after 7 days.")}</p>
  <div class="foot"><span>${esc(brand.footer || "Thank you for your business")}</span>${brand.tredi_mark === false ? "" : `<span style="color:${c};font-weight:700">■ Made with tredi</span>`}</div>
  </body></html>`;
}
