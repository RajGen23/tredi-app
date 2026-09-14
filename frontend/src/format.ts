import dayjs from "dayjs";

export const NAIRA = "₦";

export function money(n: number | undefined | null, opts: { symbol?: boolean; decimals?: boolean } = {}): string {
  const v = Math.abs(Number(n) || 0);
  const s = v.toLocaleString("en-NG", { minimumFractionDigits: opts.decimals ? 2 : 0, maximumFractionDigits: opts.decimals ? 2 : 0 });
  return opts.symbol === false ? s : `${NAIRA} ${s}`;
}

export function compact(n: number): string {
  const v = Math.abs(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
}

export function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "—";
}

export function shortDate(d?: string | null): string {
  return d ? dayjs(d).format("DD MMM") : "—";
}
export function longDate(d?: string | null): string {
  return d ? dayjs(d).format("DD MMM YYYY") : "—";
}
export function slashDate(d?: string | null): string {
  return dayjs(d ?? undefined).format("DD/MM/YYYY");
}

export function parseNum(s: string): number {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

export type Status = "paid" | "overdue" | "unpaid" | "part_paid" | "draft";
export function statusLabel(inv: { status: string; days_overdue?: number; due_date?: string | null; created_at?: string }): string {
  switch (inv.status) {
    case "overdue":
      return `${inv.days_overdue} day${inv.days_overdue === 1 ? "" : "s"} overdue`;
    case "paid":
      return "Paid in full";
    case "draft":
      return "Draft";
    default: {
      if (!inv.due_date) return "Unpaid";
      const days = dayjs(inv.due_date).startOf("day").diff(dayjs().startOf("day"), "day");
      return days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`;
    }
  }
}
