import dayjs from "dayjs";

export function ago(iso?: string | null): string {
  if (!iso) return "—";
  const mins = Math.max(0, dayjs().diff(dayjs(iso), "minute"));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  return dayjs(iso).format("DD MMM");
}

export function inFuture(iso?: string | null): string {
  if (!iso) return "—";
  const mins = dayjs(iso).diff(dayjs(), "minute");
  if (mins <= 0) return "expired";
  if (mins < 60) return `${mins} minutes`;
  const days = Math.round(mins / 60 / 24);
  return days <= 1 ? `${Math.round(mins / 60)} hours` : `${days} days`;
}

export function stamp(iso?: string | null): string {
  return iso ? dayjs(iso).format("DD/MM HH:mm:ss") : "—";
}

export function dayMonth(iso?: string | null): string {
  return iso ? dayjs(iso).format("DD MMM YYYY") : "—";
}

export function expiryLabel(days: number): string {
  if (days < 0) return `expired ${Math.abs(days)}d ago`;
  if (days === 0) return "expires today";
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function compactMoney(n: number): string {
  const v = Math.abs(n || 0);
  if (v >= 1_000_000_000) return `₦ ${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `₦ ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `₦ ${Math.round(v / 1_000)}K`;
  return `₦ ${v.toFixed(0)}`;
}
