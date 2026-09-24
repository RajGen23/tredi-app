// 04.1 Sales tab — invoices and counter sales in one book, chips, overdue card.
// A quick sale is money taken too, so it belongs on this list, not hidden away.
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, H4, IconBtn, Li, Lbl, Loading, Money, Radio, Row, Sub, Tag } from "@/src/components/ui";
import { Sheet } from "@/src/components/sheet";
import { initials, money, shortDate, statusLabel } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Filter = "all" | "overdue" | "unpaid" | "paid" | "draft" | "duplicate" | "quick";
type Sort = "overdue" | "amount" | "newest" | "az";

type SaleRow = {
  id: string;
  kind: "invoice" | "sale";
  number: string;
  customer_name: string;
  total: number;
  due: number;
  created_at: string;
  status: string;
  days_overdue: number;
  method?: string;
  duplicated_from?: string | null;
  duplicated_from_number?: string | null;
  lines: number;
};

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  overdue: { backgroundColor: c.error, borderColor: "#F7D6D7", paddingVertical: 10 },
  num: { fontFamily: fonts.monoSemibold, fontSize: 12.5 },
}));

export default function Sales() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("overdue");
  const [sheet, setSheet] = useState(false);
  const q = useQuery({ queryKey: ["invoices"], queryFn: () => api<any[]>("/invoices") });
  const salesQ = useQuery({ queryKey: ["sales"], queryFn: () => api<any[]>("/sales") });

  const all = useMemo<SaleRow[]>(() => {
    const invoices: SaleRow[] = (q.data ?? []).map((i) => ({
      id: i.id, kind: "invoice", number: i.number, customer_name: i.customer_name, total: i.totals.total, due: i.due,
      created_at: i.created_at, status: i.status, days_overdue: i.days_overdue, duplicated_from: i.duplicated_from,
      duplicated_from_number: i.duplicated_from_number, lines: (i.lines ?? []).length,
    }));
    const quick: SaleRow[] = (salesQ.data ?? []).map((x) => ({
      id: x.id, kind: "sale", number: x.number, customer_name: x.customer_name || "Cash sale", total: x.totals.total,
      due: x.method === "credit" ? x.totals.total : 0, created_at: x.created_at,
      status: x.method === "credit" ? "unpaid" : "paid", days_overdue: 0, method: x.method, lines: (x.lines ?? []).length,
    }));
    return [...invoices, ...quick];
  }, [q.data, salesQ.data]);

  const counts = useMemo(() => ({
    all: all.length,
    overdue: all.filter((i) => i.status === "overdue").length,
    unpaid: all.filter((i) => ["unpaid", "part_paid", "overdue"].includes(i.status)).length,
    paid: all.filter((i) => i.status === "paid").length,
    draft: all.filter((i) => i.status === "draft").length,
    duplicate: all.filter((i) => !!i.duplicated_from).length,
    quick: all.filter((i) => i.kind === "sale").length,
  }), [all]);
  const overdueTotal = all.filter((i) => i.status === "overdue").reduce((a, i) => a + i.due, 0);

  const list = useMemo(() => {
    let l = all.filter((i) =>
      filter === "all" ? true
      : filter === "quick" ? i.kind === "sale"
      : filter === "unpaid" ? ["unpaid", "part_paid", "overdue"].includes(i.status)
      : filter === "duplicate" ? !!i.duplicated_from
      : i.status === filter);
    l = [...l].sort((a, b) => sort === "overdue" ? b.days_overdue - a.days_overdue || b.due - a.due : sort === "amount" ? b.total - a.total : sort === "az" ? a.customer_name.localeCompare(b.customer_name) : b.created_at.localeCompare(a.created_at));
    return l;
  }, [all, filter, sort]);

  const chips: { k: Filter; label: string; dot?: string }[] = [
    { k: "all", label: `All ${counts.all}` },
    { k: "overdue", label: `Overdue ${counts.overdue}`, dot: colors.coral },
    { k: "unpaid", label: `Unpaid ${counts.unpaid}` },
    { k: "paid", label: "Paid" },
    { k: "quick", label: `Quick sale ${counts.quick}` },
    { k: "draft", label: `Draft ${counts.draft}` },
    { k: "duplicate", label: `Repeat ${counts.duplicate}` },
  ];

  const loading = q.isLoading || salesQ.isLoading;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="invoices-screen">
      <AppBar title="Sales" right={<><IconBtn name="search-outline" testID="invoices-search" onPress={() => router.push("/search")} /><IconBtn name="swap-vertical-outline" testID="invoices-filter" onPress={() => setSheet(true)} /></>} />
      <View style={{ height: 44 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {chips.map((c) => <Chip key={c.k} testID={`invoice-chip-${c.k}`} label={c.label} on={filter === c.k} dotColor={c.dot} onPress={() => setFilter(c.k)} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); salesQ.refetch(); }} tintColor={colors.brandPrimary} />}>
        {overdueTotal > 0 ? (
          <Card style={s.overdue} testID="invoices-overdue-card">
            <Row between>
              <View><Lbl style={{ color: colors.coral }}>Overdue total</Lbl><Money tone="neg" size={17}>{money(overdueTotal)}</Money></View>
              <Btn small variant="coral" label="Remind all" testID="invoices-remind-all" style={{ paddingHorizontal: 12, minHeight: 36, paddingVertical: 8 }}
                onPress={() => { setFilter("overdue"); }} />
            </Row>
          </Card>
        ) : null}
        {loading ? <Loading /> : list.length === 0 ? (
          <Card style={{ marginTop: 9 }}>
            <Empty icon="receipt-outline" title="Nothing here yet" sub="Raise an invoice or ring up a quick sale from the + button." action={<Btn label="New invoice" testID="invoices-empty-new" onPress={() => router.push("/invoices/new")} />} />
          </Card>
        ) : (
          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            {list.map((row, i) => {
              const over = row.status === "overdue";
              const draft = row.status === "draft";
              const quick = row.kind === "sale";
              return (
                <Li key={`${row.kind}-${row.id}`} testID={`invoice-row-${row.number}`} last={i === list.length - 1}
                  onPress={() => router.push(quick ? `/sales/${row.id}` : `/invoices/${row.id}`)} style={{ alignItems: "flex-start" }}>
                  {quick
                    ? <Av icon="flash-outline" tone="green" />
                    : <Av text={draft ? "—" : initials(row.customer_name)} tone={over ? "coral" : draft ? "sq" : "mint"} />}
                  <View style={{ flex: 1 }}>
                    <Row between><H4 style={s.num}>{row.number}</H4><Money tone={over ? "neg" : draft ? "mut" : undefined}>{money(row.total)}</Money></Row>
                    <Row between style={{ marginTop: 1 }}>
                      <Sub>{row.customer_name}</Sub>
                      <Sub>{quick ? `${shortDate(row.created_at)} · ${row.method === "credit" ? "on credit" : row.method}` : row.status === "paid" ? `Paid ${shortDate(row.created_at)}` : draft ? "Not sent" : `Due ${money(row.due)}`}</Sub>
                    </Row>
                    <Row between style={{ marginTop: 4 }}>
                      <Badge tone={quick ? "paid" : over ? "over" : row.status === "paid" ? "paid" : draft ? "draft" : "due"}>
                        {quick ? "Quick sale" : statusLabel(row as any)}
                      </Badge>
                      <Tag>{row.duplicated_from_number ? `repeat of ${row.duplicated_from_number}` : row.status === "part_paid" ? "part paid" : quick ? `${row.lines} line${row.lines === 1 ? "" : "s"}` : "⋯"}</Tag>
                    </Row>
                  </View>
                </Li>
              );
            })}
          </Card>
        )}
      </ScrollView>

      <Sheet visible={sheet} onClose={() => setSheet(false)} testID="invoice-filter-sheet">
        <Row between><H4>Filter</H4><Sub style={{ color: colors.green700, fontFamily: fonts.bold }} onPress={() => { setFilter("all"); setSort("overdue"); }}>Reset</Sub></Row>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Status</Lbl>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {chips.map((c) => <Chip key={c.k} label={c.label.replace(/ \d+$/, "")} on={filter === c.k} onPress={() => setFilter(c.k)} />)}
        </View>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Sort by</Lbl>
        {([["overdue", "Most overdue first"], ["amount", "Highest amount"], ["newest", "Newest first"], ["az", "Customer A–Z"]] as [Sort, string][]).map(([k, label]) => (
          <Li key={k} testID={`sort-${k}`} onPress={() => setSort(k)} last={k === "az"}><H4 style={{ flex: 1 }}>{label}</H4><Radio on={sort === k} /></Li>
        ))}
        <Btn label={`Show ${list.length} record${list.length === 1 ? "" : "s"}`} testID="invoice-filter-apply" onPress={() => setSheet(false)} style={{ marginTop: 12 }} />
      </Sheet>
    </View>
  );
}
