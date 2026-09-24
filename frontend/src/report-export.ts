// Every report prints and exports the same way: one document shape, three
// outputs — printer, PDF to share, and a CSV that opens in Excel.
import { Platform } from "react-native";
import * as Sharing from "expo-sharing";

export type Section = {
  heading?: string;
  columns: { label: string; right?: boolean }[];
  rows: (string | number)[][];
  total?: (string | number)[];
};

export type ReportDoc = {
  title: string;
  business: string;
  period?: string;
  shop?: string;
  kpis?: { label: string; value: string }[];
  sections: Section[];
  note?: string;
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function reportFileName(doc: ReportDoc, ext: string): string {
  const slug = (v?: string) => String(v ?? "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return `${[doc.business, doc.title, doc.period].map(slug).filter(Boolean).join("-").slice(0, 120) || "report"}.${ext}`;
}

export function reportHtml(doc: ReportDoc): string {
  const printed = new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  const kpis = (doc.kpis ?? []).length
    ? `<div class="kpis">${doc.kpis!.map((k) => `<div class="kpi"><span>${esc(k.label)}</span><b>${esc(k.value)}</b></div>`).join("")}</div>`
    : "";
  const table = (sec: Section) => `
    ${sec.heading ? `<h3>${esc(sec.heading)}</h3>` : ""}
    <table>
      <thead><tr>${sec.columns.map((c) => `<th class="${c.right ? "r" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody>
        ${sec.rows.length === 0 ? `<tr><td colspan="${sec.columns.length}" class="empty">Nothing in this period</td></tr>` : ""}
        ${sec.rows.map((r) => `<tr>${r.map((cell, i) => `<td class="${sec.columns[i]?.right ? "r mono" : ""}">${esc(cell)}</td>`).join("")}</tr>`).join("")}
      </tbody>
      ${sec.total ? `<tfoot><tr>${sec.total.map((cell, i) => `<td class="${sec.columns[i]?.right ? "r mono" : ""}">${esc(cell)}</td>`).join("")}</tr></tfoot>` : ""}
    </table>`;

  return `<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#06241F;margin:0;padding:26px 24px 60px}
    .head{border-bottom:2px solid #014747;padding-bottom:12px;margin-bottom:16px}
    .biz{font-size:19px;font-weight:800;letter-spacing:-0.3px}
    .title{font-size:13px;color:#014747;font-weight:700;margin-top:3px}
    .meta{font-size:11px;color:#5C7570;margin-top:2px}
    .kpis{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
    .kpi{flex:1 1 130px;border:1px solid #E5EEEB;border-radius:10px;padding:9px 11px}
    .kpi span{display:block;font-size:9px;letter-spacing:.8px;text-transform:uppercase;color:#93A9A4}
    .kpi b{display:block;font-size:14px;margin-top:3px;font-family:ui-monospace,Menlo,monospace}
    h3{font-size:11.5px;text-transform:uppercase;letter-spacing:.7px;color:#5C7570;margin:20px 0 6px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px}
    th{text-align:left;font-size:9.5px;letter-spacing:.6px;text-transform:uppercase;color:#5C7570;border-bottom:1px solid #CBD8D4;padding:7px 6px}
    td{padding:7px 6px;border-bottom:1px solid #EEF3F1}
    tfoot td{font-weight:700;border-top:1px solid #CBD8D4;border-bottom:none;background:#F3F7F5}
    .r{text-align:right}
    .mono{font-family:ui-monospace,Menlo,monospace}
    .empty{color:#93A9A4;text-align:center;padding:14px}
    .foot{position:fixed;bottom:16px;left:24px;right:24px;font-size:10px;color:#93A9A4;border-top:1px solid #EEF3F1;padding-top:6px;display:flex;justify-content:space-between}
  </style></head>
  <body>
    <div class="head">
      <div class="biz">${esc(doc.business)}</div>
      <div class="title">${esc(doc.title)}</div>
      <div class="meta">${[doc.period, doc.shop].filter(Boolean).map(esc).join(" · ")}</div>
    </div>
    ${kpis}
    ${doc.sections.map(table).join("")}
    ${doc.note ? `<div class="meta" style="margin-top:14px">${esc(doc.note)}</div>` : ""}
    <div class="foot"><span>Printed ${esc(printed)}</span><span>Made with tredi</span></div>
  </body></html>`;
}

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportCsv(doc: ReportDoc): string {
  const lines: string[] = [[doc.business].map(cell).join(","), [doc.title].map(cell).join(",")];
  if (doc.period) lines.push([doc.period].map(cell).join(","));
  if (doc.shop) lines.push([doc.shop].map(cell).join(","));
  for (const k of doc.kpis ?? []) lines.push([k.label, k.value].map(cell).join(","));
  for (const sec of doc.sections) {
    lines.push("");
    if (sec.heading) lines.push([sec.heading].map(cell).join(","));
    lines.push(sec.columns.map((c) => cell(c.label)).join(","));
    for (const r of sec.rows) lines.push(r.map(cell).join(","));
    if (sec.total) lines.push(sec.total.map(cell).join(","));
  }
  return lines.join("\n");
}

/** Hands the CSV to the share sheet on a phone, downloads it on the web. */
export async function shareCsv(csv: string, filename: string): Promise<{ shared: boolean; uri: string }> {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { shared: true, uri: url };
  }
  const { File, Paths } = await import("expo-file-system");
  const f = new File(Paths.cache, filename);
  if (f.exists) f.delete();
  f.create();
  f.write(csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(f.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text", dialogTitle: filename });
    return { shared: true, uri: f.uri };
  }
  return { shared: false, uri: f.uri };
}
