// 08.1 Expenses — period and rep filters, total + ring, a category breakdown
// where every card opens the entries inside it, and rows that open the expense
// itself so it can be corrected.
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import Svg, { Circle } from "react-native-svg";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Divider, Empty, H4, IconBtn, IonName, Li, Lbl, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { Sheet } from "@/src/components/sheet";
import { SyncStamp } from "@/src/components/sync";
import { PickerField } from "@/src/components/picker";
import { money, shortDate } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Period = "month" | "last_month" | "week" | "all";
const ICONS: Record<string, IonName> = { Rent: "home-outline", "Transport & fuel": "car-outline", Salaries: "people-outline", Utilities: "flash-outline", Repairs: "build-outline" };
const PERIOD_LABELS: Record<Period, string> = { month: "This month", last_month: "Last month", week: "This week", all: "All time" };

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, legend: { width: 8, height: 8, borderRadius: 3 } }));

export default function Expenses() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("month");
  const [rep, setRep] = useState("");
  const [category, setCategory] = useState("");
  const [filters, setFilters] = useState(false);
  const teamQ = useQuery({ queryKey: ["team"], queryFn: () => api("/team") });
  const q = useQuery({
    queryKey: ["expenses", period, rep, category],
    queryFn: () => api(`/expenses?period=${period}&rep=${encodeURIComponent(rep)}&category=${encodeURIComponent(category)}`),
  });
  // The ring and the breakdown always show the whole period, even while the
  // list below is filtered to one category.
  const allQ = useQuery({ queryKey: ["expenses", period, rep, ""], queryFn: () => api(`/expenses?period=${period}&rep=${encodeURIComponent(rep)}`) });
  const d = q.data;
  const whole = allQ.data;
  const ringColors = [colors.deep, colors.brandPrimary, colors.amber, colors.surfaceTertiary];
  const byCategory: any[] = whole?.by_category ?? [];
  const cats = byCategory.slice(0, 3).concat(byCategory.length > 3 ? [{ category: "Other", amount: byCategory.slice(3).reduce((a: number, c: any) => a + c.amount, 0) }] : []);
  const repOptions = [{ key: "", label: "Everyone" }].concat(((teamQ.data as any)?.users ?? [])
    .filter((u: any) => u.active !== false).map((u: any) => ({ key: u.name, label: u.name, sub: u.role_label })));
  let offset = 25;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="expenses-screen">
      <AppBar title="Expenses" back right={<>
        <IconBtn name="options-outline" testID="expenses-filter" onPress={() => setFilters(true)} />
        <IconBtn name="add" testID="expenses-add" onPress={() => router.push("/expenses/new")} />
      </>} />
      <View style={{ height: 44 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((k) => <Chip key={k} label={PERIOD_LABELS[k]} on={period === k} onPress={() => setPeriod(k)} testID={`expenses-period-${k}`} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); allQ.refetch(); }} tintColor={colors.brandPrimary} />}>
        <Row between>
          <SyncStamp at={q.dataUpdatedAt} busy={q.isFetching} onRefresh={() => { q.refetch(); allQ.refetch(); }} testID="expenses-sync" />
          {rep ? <Chip label={`Rep: ${rep}`} on onPress={() => setRep("")} testID="expenses-rep-chip" /> : null}
        </Row>
        {!d || !whole ? <Loading /> : (
          <>
            <Card testID="expenses-summary-card">
              <Row between>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Lbl>{PERIOD_LABELS[period]}{rep ? ` · ${rep}` : ""}</Lbl>
                  <Money tone="neg" size={20} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="expenses-total">{money(whole.total)}</Money>
                  <Sub>{whole.count} entries · {byCategory.length} categor{byCategory.length === 1 ? "y" : "ies"}</Sub>
                </View>
                <Svg width={78} height={78} viewBox="0 0 42 42">
                  <Circle cx="21" cy="21" r="15.9" fill="none" stroke={colors.surfaceTertiary} strokeWidth="7" />
                  {cats.map((c: any, i: number) => {
                    const pct = whole.total ? (c.amount / whole.total) * 100 : 0;
                    const el = <Circle key={c.category} cx="21" cy="21" r="15.9" fill="none" stroke={ringColors[i]} strokeWidth="7" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} />;
                    offset -= pct;
                    return el;
                  })}
                </Svg>
              </Row>
              <Divider />
              <View style={{ gap: 6 }}>
                {cats.map((c: any, i: number) => (
                  <Pressable key={c.category} testID={`expenses-legend-${c.category}`} disabled={c.category === "Other"}
                    onPress={() => setCategory(c.category === category ? "" : c.category)}>
                    <Row between>
                      <Row style={{ gap: 6 }}><View style={[s.legend, { backgroundColor: ringColors[i] }]} /><Sub>{c.category}</Sub></Row>
                      <Money>{money(c.amount)}</Money>
                    </Row>
                  </Pressable>
                ))}
                {cats.length === 0 ? <Sub>No spending recorded for this period.</Sub> : null}
              </View>
            </Card>

            {byCategory.length ? (
              <>
                <Lbl style={{ marginTop: 12, marginBottom: 6 }}>By category — tap one to open its entries</Lbl>
                <Card style={{ paddingVertical: 4 }} testID="expenses-categories">
                  {byCategory.map((c: any, i: number) => (
                    <Li key={c.category} last={i === byCategory.length - 1} testID={`expense-category-${c.category}`}
                      onPress={() => setCategory(c.category === category ? "" : c.category)}>
                      <Av icon={ICONS[c.category] ?? "receipt-outline"} tone={category === c.category ? "green" : "sq"} />
                      <View style={{ flex: 1 }}>
                        <Row between><H4>{c.category}</H4><Money tone="neg">{money(c.amount)}</Money></Row>
                        <Sub>{whole.total ? Math.round((c.amount / whole.total) * 100) : 0}% of spending</Sub>
                      </View>
                      {category === c.category ? <Badge tone="paid">Showing</Badge> : <Ionicons name="chevron-forward" size={15} color={colors.ink40} />}
                    </Li>
                  ))}
                </Card>
              </>
            ) : null}

            <Row between style={{ marginTop: 12, marginBottom: 6 }}>
              <Lbl>{category ? `${category} — ${d.count} entr${d.count === 1 ? "y" : "ies"} · ${money(d.total)}` : "Every entry"}</Lbl>
              {category ? <Chip label="Clear" on onPress={() => setCategory("")} testID="expenses-clear-category" /> : null}
            </Row>
            {d.items.length === 0 ? <Card><Empty icon="wallet-outline" title="Nothing here yet" action={<Btn label="Add expense" onPress={() => router.push("/expenses/new")} testID="expenses-empty-add" />} /></Card> : (
              <Card style={{ paddingVertical: 4 }}>
                {d.items.map((e: any, i: number) => (
                  <Li key={e.id} testID={`expense-row-${e.id}`} last={i === d.items.length - 1} onPress={() => router.push(`/expenses/${e.id}`)}>
                    <Av icon={ICONS[e.category] ?? "receipt-outline"} tone="sq" />
                    <View style={{ flex: 1 }}>
                      <Row between><H4>{e.note || e.category}</H4><Money tone="neg">{money(e.amount)}</Money></Row>
                      <Row between><Sub numberOfLines={1} style={{ flex: 1 }}>{e.category} · {e.account_name} · {shortDate(e.created_at)}</Sub><Tag>{e.receipt_url ? "⌾ receipt" : "no receipt"}</Tag></Row>
                    </View>
                  </Li>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>

      <Sheet visible={filters} onClose={() => setFilters(false)} testID="expenses-filter-sheet">
        <H4>Filter expenses</H4>
        <Sub style={{ marginTop: 3 }}>Period, rep and category — the same three questions every time.</Sub>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Period</Lbl>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((k) => <Chip key={k} label={PERIOD_LABELS[k]} on={period === k} onPress={() => setPeriod(k)} testID={`expenses-filter-period-${k}`} />)}
        </View>
        <PickerField label="Rep" value={rep} options={repOptions} onPick={setRep} searchable title="Whose expenses?" style={{ marginTop: 12 }} testID="expenses-filter-rep" />
        <PickerField label="Category" value={category} options={[{ key: "", label: "All categories" }].concat(byCategory.map((c: any) => ({ key: c.category, label: c.category, sub: money(c.amount) })))}
          onPick={setCategory} title="Which category?" style={{ marginTop: 10 }} testID="expenses-filter-category" />
        <Btn label="Show the entries" style={{ marginTop: 12 }} testID="expenses-filter-apply" onPress={() => setFilters(false)} />
        <Btn variant="ghost" small label="Reset" style={{ marginTop: 8 }} testID="expenses-filter-reset"
          onPress={() => { setPeriod("month"); setRep(""); setCategory(""); }} />
      </Sheet>
    </View>
  );
}
