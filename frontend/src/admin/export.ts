// CSV out of the Super Admin panel. Every export is also written to the audit
// log (Data exports tab) so nothing leaves the panel unrecorded.
import { Platform, Share } from "react-native";

import { adminApi } from "@/src/admin/api";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCsv(what: string, filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) throw new Error("Nothing to export in this view");
  const head = Object.keys(rows[0]);
  const csv = [head.join(","), ...rows.map((r) => head.map((k) => cell(r[k])).join(","))].join("\n");
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    await Share.share({ title: filename, message: csv });
  }
  return adminApi<{ message: string }>("/exports", { method: "POST", json: { what, rows: rows.length } });
}
