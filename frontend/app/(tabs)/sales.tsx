// 04.1 Invoices (Sales tab) — chips, overdue card, one ⋯ per row. 04.2 filter sheet.
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, H4, IconBtn, Li, Lbl, Loading, Money, Radio, Row, Sub, Tag } from "@/src/components/ui";
import { Sheet } from "@/src/components/sheet";
import { initials, money, shortDate, statusLabel } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Filter = "all" | "overdue" | "unpaid" | "paid" | "draft" | "duplicate";
type Sort = "overdue" | "amount" | "newest" | "az";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  overdue: { backgroundColor: c.error, borderColor: "#F7D6D7", paddingVertical: 10 },
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
  const all = q.data ?? [];

  const counts = useMemo(() => ({
    all: all.length,
    overdue: all.filter((i) => i.status === "overdue").length,
    unpaid: all.filter((i) => ["unpaid", "part_paid", "overdue"].includes(i.status)).length,
    paid: all.filter((i) => i.status === "paid").length,
    draft: all.filter((i) => i.status === "draft").length,
    duplicate: all.filter((i) => !!i.duplicated_from).length,
  }), [all]);
  const overdueTotal = all.filter((i) => i.status === "overdue").reduce((a, i) => a + i.due, 0);

  const list = useMemo(() => {
    let l = all.filter((i) =>
      filter === "all" ? true
      : filter === "unpaid" ? ["unpaid", "part_paid", "overdue"].includes(i.status)
      : filter === "duplicate" ? !!i.duplicated_from
      : i.status === filter);
    l = [...l].sort((a, b) => sort === "overdue" ? b.days_overdue - a.days_overdue || b.due - a.due : sort === "amount" ? b.totals.total - a.totals.total : sort === "az" ? a.customer_name.localeCompare(b.customer_name) : b.created_at.localeCompare(a.created_at));
    return l;
  }, [all, filter, sort]);

  const chips: { k: Filter; label: string; dot?: string }[] = [
    { k: "all", label: `All ${counts.all}` },
    { k: "overdue", label: `Overdue ${counts.overdue}`, dot: colors.coral },
    { k: "unpaid", label: `Unpaid ${counts.unpaid}` },
    { k: "paid", label: "Paid" },
    { k: "draft", label: `Draft ${counts.draft}` },
    { k: "duplicate", label: `Repeat ${counts.duplicate}` },
  ];

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="invoices-screen">
      <AppBar title="Invoices" right={<><IconBtn name="search-outline" testID="invoices-search" onPress={() => router.push("/search")} /><IconBtn name="swap-vertical-outline" testID="invoices-filter" onPress={() => setSheet(true)} /></>} />
      <View style={{ height: 44 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {chips.map((c) => <Chip key={c.k} testID={`invoice-chip-${c.k}`} label={c.label} on={filter === c.k} dotColor={c.dot} onPress={() => setFilter(c.k)} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        {overdueTotal > 0 ? (
          <Card style={s.overdue} testID="invoices-overdue-card">
            <Row between>
              <View><Lbl style={{ color: colors.coral }}>Overdue total</Lbl><Money tone="neg" size={17}>{money(overdueTotal)}</Money></View>
              <Btn small variant="coral" label="Remind all" testID="invoices-remind-all" style={{ paddingHorizontal: 12, minHeight: 36, paddingVertical: 8 }} />
            </Row>
          </Card>
        ) : null}
        {q.isLoading ? <Loading /> : list.length === 0 ? (
          <Card style={{ marginTop: 9 }}>
            <Empty icon="receipt-outline" title="No invoices here" sub="Raise one from the + button." action={<Btn label="New invoice" testID="invoices-empty-new" onPress={() => router.push("/invoices/new")} />} />
          </Card>
        ) : (
          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            {list.map((inv, i) => {
              const over = inv.status === "overdue";
              const draft = inv.status === "draft";
              return (
                <Li key={inv.id} testID={`invoice-row-${inv.number}`} last={i === list.length - 1} onPress={() => router.push(`/invoices/${inv.id}`)} style={{ alignItems: "flex-start" }}>
                  <Av text={draft ? "—" : initials(inv.customer_name)} tone={over ? "coral" : draft ? "sq" : "mint"} />
                  <View style={{ flex: 1 }}>
                    <Row between><H4 style={{ fontFamily: "IBMPlexMono-SemiBold", fontSize: 12.5 }}>{inv.number}</H4><Money tone={over ? "neg" : draft ? "mut" : undefined}>{money(inv.totals.total)}</Money></Row>
                    <Row between style={{ marginTop: 1 }}><Sub>{inv.customer_name}</Sub><Sub>{inv.status === "paid" ? `Paid ${shortDate(inv.created_at)}` : draft ? "Not sent" : `Due ${money(inv.due)}`}</Sub></Row>
                    <Row between style={{ marginTop: 4 }}>
                      <Badge tone={over ? "over" : inv.status === "paid" ? "paid" : draft ? "draft" : "due"}>{statusLabel(inv)}</Badge>
                      <Tag>{inv.duplicated_from_number ? `repeat of ${inv.duplicated_from_number}` : inv.status === "part_paid" ? "part paid" : "⋯"}</Tag>
                    </Row>
                  </View>
                </Li>
              );
            })}
          </Card>
        )}
      </ScrollView>

      <Sheet visible={sheet} onClose={() => setSheet(false)} testID="invoice-filter-sheet">
        <Row between><H4>Filter</H4><Sub style={{ color: colors.green700, fontFamily: "Manrope-Bold" }} onPress={() => { setFilter("all"); setSort("overdue"); }}>Reset</Sub></Row>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Status</Lbl>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {chips.map((c) => <Chip key={c.k} label={c.label.replace(/ \d+$/, "")} on={filter === c.k} onPress={() => setFilter(c.k)} />)}
        </View>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Sort by</Lbl>
        {([["overdue", "Most overdue first"], ["amount", "Highest amount"], ["newest", "Newest first"], ["az", "Customer A–Z"]] as [Sort, string][]).map(([k, label]) => (
          <Li key={k} testID={`sort-${k}`} onPress={() => setSort(k)} last={k === "az"}><H4 style={{ flex: 1 }}>{label}</H4><Radio on={sort === k} /></Li>
        ))}
        <Btn label={`Show ${list.length} invoice${list.length === 1 ? "" : "s"}`} testID="invoice-filter-apply" onPress={() => setSheet(false)} style={{ marginTop: 12 }} />
      </Sheet>
    </View>
  );
}
