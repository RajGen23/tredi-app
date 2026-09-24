import dayjs from "dayjs";

// The shop's own currency. Every screen, invoice and receipt reads the symbol
// from here, so a Ghanaian or Kenyan trader never sees a naira sign.
export type Currency = { code: string; symbol: string; name: string };

export const CURRENCIES: Currency[] = [
  { code: "NGN", symbol: "₦", name: "Nigerian naira" },
  { code: "GHS", symbol: "₵", name: "Ghanaian cedi" },
  { code: "KES", symbol: "KSh", name: "Kenyan shilling" },
  { code: "ZAR", symbol: "R", name: "South African rand" },
  { code: "USD", symbol: "$", name: "US dollar" },
  { code: "GBP", symbol: "£", name: "British pound" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "XOF", symbol: "CFA", name: "West African CFA franc" },
  { code: "XAF", symbol: "FCFA", name: "Central African CFA franc" },
  { code: "TZS", symbol: "TSh", name: "Tanzanian shilling" },
  { code: "UGX", symbol: "USh", name: "Ugandan shilling" },
  { code: "RWF", symbol: "FRw", name: "Rwandan franc" },
  { code: "ZMW", symbol: "ZK", name: "Zambian kwacha" },
  { code: "EGP", symbol: "E£", name: "Egyptian pound" },
  { code: "CAD", symbol: "C$", name: "Canadian dollar" },
  { code: "INR", symbol: "₹", name: "Indian rupee" },
];

let active: Currency = CURRENCIES[0];

/** Called once the business loads, and again whenever the owner changes it. */
export function setCurrency(code?: string | null) {
  active = CURRENCIES.find((c) => c.code === String(code ?? "").toUpperCase()) ?? CURRENCIES[0];
}

export function currency(): Currency {
  return active;
}

/** The symbol on its own — for input placeholders and ₦/% toggles. */
export function sym(): string {
  return active.symbol;
}

export function currencyLabel(code?: string | null): string {
  const c = CURRENCIES.find((x) => x.code === String(code ?? "").toUpperCase()) ?? CURRENCIES[0];
  return `${c.symbol} ${c.code}`;
}

export function money(n: number | undefined | null, opts: { symbol?: boolean; decimals?: boolean } = {}): string {
  const v = Math.abs(Number(n) || 0);
  const s = v.toLocaleString("en-NG", { minimumFractionDigits: opts.decimals ? 2 : 0, maximumFractionDigits: opts.decimals ? 2 : 0 });
  return opts.symbol === false ? s : `${active.symbol} ${s}`;
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

export type Status = "paid" | "overdue" | "unpaid" | "part_paid" | "draft" | "cancelled";
export function statusLabel(inv: { status: string; days_overdue?: number; due_date?: string | null; created_at?: string }): string {
  switch (inv.status) {
    case "overdue":
      return `${inv.days_overdue} day${inv.days_overdue === 1 ? "" : "s"} overdue`;
    case "paid":
      return "Paid in full";
    case "draft":
      return "Draft";
    case "cancelled":
      return "Cancelled";
    case "part_paid":
      return "Part paid";
    default: {
      if (!inv.due_date) return "Unpaid";
      const days = dayjs(inv.due_date).startOf("day").diff(dayjs().startOf("day"), "day");
      return days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`;
    }
  }
}
