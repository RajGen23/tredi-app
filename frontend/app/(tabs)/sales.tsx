// 04.1 Sales tab — invoices and counter sales in one book, chips, overdue card.
// A quick sale is money taken too, so it belongs on this list, not hidden away.
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, H4, IconBtn, Li, Lbl, Loading, Money, Radio, Row, Sub, Tag } from "@/src/components/ui";
import { Sheet } from "@/src/components/sheet";
import { SyncStamp } from "@/src/components/sync";
import { OutboxBanner } from "@/src/components/outbox";
import { DateField } from "@/src/components/date-field";
import { PickerField } from "@/src/components/picker";
import { useShops } from "@/src/lookups";
import { initials, money, shortDate, statusLabel } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Filter = "all" | "overdue" | "unpaid" | "paid" | "draft" | "cancelled" | "duplicate" | "quick";
type Sort = "recent" | "overdue" | "amount" | "newest" | "az";
type Span = "all" | "today" | "week" | "month";
const SPANS: [Span, string][] = [["all", "Any date"], ["today", "Today"], ["week", "This week"], ["month", "This month"]];
// The twelve months a trader might still be chasing money in.
const MONTHS = Array.from({ length: 12 }, (_, i) => dayjs().subtract(i, "month"));

type SaleRow = {
  id: string;
  kind: "invoice" | "sale";
  number: string;
  customer_name: string;
  total: number;
  due: number;
  created_at: string;
  updated_at?: string | null;
  status: string;
  days_overdue: number;
  method?: string;
  duplicated_from?: string | null;
  duplicated_from_number?: string | null;
  lines: number;
  rep: string;
  shop: string;
};

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  overdue: { backgroundColor: c.error, borderColor: "#F7D6D7", paddingVertical: 10 },
  drafts: { backgroundColor: c.warning, borderColor: "#F3E2BE", paddingVertical: 10, marginBottom: 9 },
  num: { fontFamily: fonts.monoSemibold, fontSize: 12.5 },
}));

/** When this record was last touched — an edit counts, so a corrected invoice
 *  climbs back to the top of the list. */
const touched = (r: SaleRow) => r.updated_at || r.created_at;

export default function Sales() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  // "Recently touched" first: an invoice you just corrected, or the draft you
  // saved a minute ago, is the one you came back for.
  const [sort, setSort] = useState<Sort>("recent");
  const [span, setSpan] = useState<Span>("all");
  const [month, setMonth] = useState("");   // YYYY-MM
  const [day, setDay] = useState("");       // YYYY-MM-DD
  const [rep, setRep] = useState("");
  const [shop, setShop] = useState("");
  const [sheet, setSheet] = useState(false);
  const q = useQuery({ queryKey: ["invoices"], queryFn: () => api<any[]>("/invoices") });
  const salesQ = useQuery({ queryKey: ["sales"], queryFn: () => api<any[]>("/sales") });
  const teamQ = useQuery({ queryKey: ["team"], queryFn: () => api("/team") });
  const shops = useShops();

  const all = useMemo<SaleRow[]>(() => {
    const invoices: SaleRow[] = (q.data ?? []).map((i) => ({
      id: i.id, kind: "invoice", number: i.number, customer_name: i.customer_name, total: i.totals.total, due: i.due,
      created_at: i.created_at, status: i.status, days_overdue: i.days_overdue, duplicated_from: i.duplicated_from,
      updated_at: i.updated_at ?? null,
      duplicated_from_number: i.duplicated_from_number, lines: (i.lines ?? []).length,
      rep: i.rep || i.created_by || "", shop: i.shop || "",
    }));
    const quick: SaleRow[] = (salesQ.data ?? []).map((x) => ({
      id: x.id, kind: "sale", number: x.number, customer_name: x.customer_name || "Cash sale", total: x.totals.total,
      due: x.method === "credit" ? x.totals.total : 0, created_at: x.created_at,
      status: x.method === "credit" ? "unpaid" : "paid", days_overdue: 0, method: x.method, lines: (x.lines ?? []).length,
      rep: x.rep || x.created_by || "", shop: x.shop || "",
    }));
    return [...invoices, ...quick];
  }, [q.data, salesQ.data]);

  const counts = useMemo(() => ({
    all: all.length,
    overdue: all.filter((i) => i.status === "overdue").length,
    unpaid: all.filter((i) => ["unpaid", "part_paid", "overdue"].includes(i.status)).length,
    paid: all.filter((i) => i.status === "paid").length,
    draft: all.filter((i) => i.status === "draft").length,
    cancelled: all.filter((i) => i.status === "cancelled").length,
    duplicate: all.filter((i) => !!i.duplicated_from).length,
    quick: all.filter((i) => i.kind === "sale").length,
  }), [all]);
  const overdueTotal = all.filter((i) => i.status === "overdue").reduce((a, i) => a + i.due, 0);

  const list = useMemo(() => {
    const from = span === "today" ? dayjs().startOf("day") : span === "week" ? dayjs().startOf("week") : span === "month" ? dayjs().startOf("month") : null;
    let l = all.filter((i) =>
      filter === "all" ? true
      : filter === "quick" ? i.kind === "sale"
      : filter === "unpaid" ? ["unpaid", "part_paid", "overdue"].includes(i.status)
      : filter === "duplicate" ? !!i.duplicated_from
      : i.status === filter);
    // A chosen day beats a chosen month, which beats the rough period chips.
    if (day) l = l.filter((i) => dayjs(i.created_at).isSame(dayjs(day), "day"));
    else if (month) l = l.filter((i) => dayjs(i.created_at).format("YYYY-MM") === month);
    else if (from) l = l.filter((i) => dayjs(i.created_at).isAfter(from));
    if (rep) l = l.filter((i) => i.rep === rep);
    if (shop) l = l.filter((i) => i.shop === shop);
    l = [...l].sort((a, b) => sort === "recent" ? touched(b).localeCompare(touched(a))
      : sort === "overdue" ? b.days_overdue - a.days_overdue || b.due - a.due
      : sort === "amount" ? b.total - a.total
      : sort === "az" ? a.customer_name.localeCompare(b.customer_name)
      : b.created_at.localeCompare(a.created_at));
    return l;
  }, [all, filter, sort, span, month, day, rep, shop]);

  const repOptions = [{ key: "", label: "Everyone" }].concat(((teamQ.data as any)?.users ?? [])
    .filter((u: any) => u.active !== false).map((u: any) => ({ key: u.name, label: u.name, sub: u.role_label })));
  const shopOptions = [{ key: "", label: "All shops" }].concat(shops.options);
  const extraFilters = (span !== "all" ? 1 : 0) + (month ? 1 : 0) + (day ? 1 : 0) + (rep ? 1 : 0) + (shop ? 1 : 0);

  const chips: { k: Filter; label: string; dot?: string }[] = [
    { k: "all", label: `All ${counts.all}` },
    { k: "overdue", label: `Overdue ${counts.overdue}`, dot: colors.coral },
    { k: "unpaid", label: `Unpaid ${counts.unpaid}` },
    { k: "draft", label: `Drafts ${counts.draft}`, dot: counts.draft ? colors.amber : undefined },
    { k: "paid", label: "Paid" },
    { k: "quick", label: `Quick sale ${counts.quick}` },
    { k: "cancelled", label: `Cancelled ${counts.cancelled}` },
    { k: "duplicate", label: `Repeat ${counts.duplicate}` },
  ];

  const loading = q.isLoading || salesQ.isLoading;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="invoices-screen">
      <AppBar title="Sales" right={<><IconBtn name="search-outline" testID="invoices-search" onPress={() => router.push("/search")} /><IconBtn name="swap-vertical-outline" dot={extraFilters > 0} testID="invoices-filter" onPress={() => setSheet(true)} /></>} />
      <View style={{ height: 44 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {chips.map((c) => <Chip key={c.k} testID={`invoice-chip-${c.k}`} label={c.label} on={filter === c.k} dotColor={c.dot} onPress={() => setFilter(c.k)} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); salesQ.refetch(); }} tintColor={colors.brandPrimary} />}>
        <SyncStamp at={Math.min(q.dataUpdatedAt || Date.now(), salesQ.dataUpdatedAt || Date.now())} busy={q.isFetching || salesQ.isFetching}
          onRefresh={() => { q.refetch(); salesQ.refetch(); }} testID="invoices-sync" />
        <OutboxBanner />
        {extraFilters > 0 ? (
          <Row style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {span !== "all" && !month && !day ? <Chip label={SPANS.find(([k]) => k === span)?.[1] ?? ""} on onPress={() => setSpan("all")} testID="invoices-clear-span" /> : null}
            {day ? <Chip label={dayjs(day).format("DD MMM YYYY")} on onPress={() => setDay("")} testID="invoices-clear-day" /> : null}
            {month && !day ? <Chip label={dayjs(`${month}-01`).format("MMMM YYYY")} on onPress={() => setMonth("")} testID="invoices-clear-month" /> : null}
            {rep ? <Chip label={`Rep: ${rep}`} on onPress={() => setRep("")} testID="invoices-clear-rep" /> : null}
            {shop ? <Chip label={shop} on onPress={() => setShop("")} testID="invoices-clear-shop" /> : null}
          </Row>
        ) : null}
        {counts.draft > 0 && filter !== "draft" ? (
          <Card style={s.drafts} testID="invoices-drafts-card">
            <Row between>
              <View style={{ flex: 1 }}>
                <Lbl style={{ color: colors.amber }}>{counts.draft} draft{counts.draft === 1 ? "" : "s"} waiting</Lbl>
                <Sub>Saved but not issued — nothing has left your stock yet</Sub>
              </View>
              <Btn small variant="ghost" label="Open drafts" testID="invoices-open-drafts" style={{ paddingHorizontal: 12, minHeight: 36, paddingVertical: 8 }}
                onPress={() => setFilter("draft")} />
            </Row>
          </Card>
        ) : null}
        {overdueTotal > 0 ? (
          <Card style={s.overdue} testID="invoices-overdue-card">
            <Row between>
              <View><Lbl style={{ color: colors.coral }}>Overdue total</Lbl><Money tone="neg" size={17}>{money(overdueTotal)}</Money></View>
              <Btn small variant="coral" label="Remind all" testID="invoices-remind-all" style={{ paddingHorizontal: 12, minHeight: 36, paddingVertical: 8 }}
                onPress={() => { setFilter("overdue"); }} />
            </Row>
          </Card>
        ) : null}
        {loading ? <Loading /> : q.isError && !q.data ? (
          <Card style={{ marginTop: 9 }}>
            <Empty icon="cloud-offline-outline" title="Couldn't load sales" sub="Check your connection and try again."
              action={<Btn label="Try again" testID="invoices-retry" onPress={() => q.refetch()} />} />
          </Card>
        ) : list.length === 0 ? (
          <Card style={{ marginTop: 9 }}>
            <Empty icon="receipt-outline" title="Nothing here yet" sub="Raise an invoice or ring up a quick sale from the + button." action={<Btn label="New invoice" testID="invoices-empty-new" onPress={() => router.push("/invoices/new")} />} />
          </Card>
        ) : (
          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            {list.map((row, i) => {
              const over = row.status === "overdue";
              const draft = row.status === "draft";
              const dead = row.status === "cancelled";
              const quick = row.kind === "sale";
              return (
                <Li key={`${row.kind}-${row.id}`} testID={`invoice-row-${row.number}`} last={i === list.length - 1}
                  onPress={() => router.push(quick ? `/sales/${row.id}` : `/invoices/${row.id}`)} style={{ alignItems: "flex-start" }}>
                  {quick
                    ? <Av icon="flash-outline" tone="green" />
                    : <Av text={draft || dead ? "—" : initials(row.customer_name)} tone={over ? "coral" : draft || dead ? "sq" : "mint"} />}
                  <View style={{ flex: 1 }}>
                    <Row between><H4 style={s.num}>{row.number}</H4><Money tone={over ? "neg" : draft || dead ? "mut" : undefined}>{money(row.total)}</Money></Row>
                    <Row between style={{ marginTop: 1 }}>
                      <Sub>{row.customer_name}</Sub>
                      <Sub>{quick ? `${shortDate(row.created_at)} · ${row.method === "credit" ? "on credit" : row.method}` : dead ? "Does not count" : row.status === "paid" ? `Paid ${shortDate(row.created_at)}` : draft ? "Not issued" : `Due ${money(row.due)}`}</Sub>
                    </Row>
                    <Row between style={{ marginTop: 4 }}>
                      <Badge tone={quick ? "paid" : dead ? "over" : over ? "over" : row.status === "paid" ? "paid" : draft ? "draft" : "due"}>
                        {quick ? "Quick sale" : statusLabel(row as any)}
                      </Badge>
                      <Tag testID={`invoice-meta-${row.number}`}>{row.updated_at ? `edited ${shortDate(row.updated_at)}`
                        : row.duplicated_from_number ? `repeat of ${row.duplicated_from_number}`
                        : row.status === "part_paid" ? "part paid"
                        : quick ? `${row.lines} line${row.lines === 1 ? "" : "s"}` : "⋯"}</Tag>
                    </Row>
                  </View>
                </Li>
              );
            })}
          </Card>
        )}
      </ScrollView>

      <Sheet visible={sheet} onClose={() => setSheet(false)} testID="invoice-filter-sheet">
        <Row between><H4>Filter</H4><Sub style={{ color: colors.green700, fontFamily: fonts.bold }} onPress={() => { setFilter("all"); setSort("recent"); setSpan("all"); setMonth(""); setDay(""); setRep(""); setShop(""); }}>Reset</Sub></Row>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Status</Lbl>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {chips.map((c) => <Chip key={c.k} label={c.label.replace(/ \d+$/, "")} on={filter === c.k} onPress={() => setFilter(c.k)} />)}
        </View>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Period</Lbl>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {SPANS.map(([k, label]) => <Chip key={k} label={label} on={span === k && !month && !day} onPress={() => { setSpan(k); setMonth(""); setDay(""); }} testID={`invoice-span-${k}`} />)}
        </View>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Month</Lbl>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {MONTHS.map((m) => {
            const key = m.format("YYYY-MM");
            return <Chip key={key} label={m.format("MMM YYYY")} on={month === key && !day}
              onPress={() => { setMonth(month === key ? "" : key); setDay(""); setSpan("all"); }} testID={`invoice-month-${key}`} />;
          })}
        </View>
        <DateField label="Exact day" value={day} allowClear hint="Only the invoices and sales raised on this day."
          onChange={(iso) => { setDay(iso); if (iso) { setMonth(""); setSpan("all"); } }} style={{ marginTop: 12 }} testID="invoice-filter-day" />
        <PickerField label="Rep" value={rep} options={repOptions} onPick={setRep} searchable title="Whose sales?" style={{ marginTop: 12 }} testID="invoice-filter-rep" />
        {shops.options.length > 1 ? (
          <PickerField label="Shop" value={shop} options={shopOptions} onPick={setShop} title="Which shop?" style={{ marginTop: 10 }} testID="invoice-filter-shop" />
        ) : null}
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Sort by</Lbl>
        {([["recent", "Recently changed first"], ["overdue", "Most overdue first"], ["amount", "Highest amount"], ["newest", "Newest first"], ["az", "Customer A–Z"]] as [Sort, string][]).map(([k, label]) => (
          <Li key={k} testID={`sort-${k}`} onPress={() => setSort(k)} last={k === "az"}><H4 style={{ flex: 1 }}>{label}</H4><Radio on={sort === k} /></Li>
        ))}
        <Btn label={`Show ${list.length} record${list.length === 1 ? "" : "s"}`} testID="invoice-filter-apply" onPress={() => setSheet(false)} style={{ marginTop: 12 }} />
      </Sheet>
    </View>
  );
}
