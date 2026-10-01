// Sales by rep — who sold what, how often and what it was worth, with the
// collections and expenses each of them recorded. Tapping a rep opens their own
// sales; tapping the figure opens the entries behind it.
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Card, Empty, H4, IconBtn, Kpi, Lbl, Li, Loading, Money, Prog, Row, Sub, Tag } from "@/src/components/ui";
import { ExportBar, useReportMeta } from "@/src/components/export";
import { PeriodBar, PeriodSheet, usePeriod } from "@/src/period";
import { initials, money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, deep: { backgroundColor: c.deep, borderColor: c.deep } }));

export default function SalesByRep() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const { query, shortLabel } = usePeriod();
  const meta = useReportMeta();
  const q = useQuery({ queryKey: ["reports-reps", query], queryFn: () => api(`/reports/reps?${query}`) });
  const d = q.data;
  const rows: any[] = d?.rows ?? [];
  const best = Math.max(1, ...rows.map((r) => r.sales));

  const build = () => d && ({
    ...meta,
    title: "Sales by rep",
    period: d.label,
    kpis: [{ label: "Total sales", value: money(d.total) }, { label: "Best rep", value: d.best || "—" },
           { label: "Reps", value: String(rows.length) }],
    sections: [{
      columns: [{ label: "Rep" }, { label: "Invoices", right: true }, { label: "Sales", right: true },
                { label: "Collected", right: true }, { label: "Expenses", right: true }],
      rows: rows.map((r) => [r.rep, r.invoices + r.quick_sales, money(r.sales), money(r.collected), money(r.expenses)]),
      total: ["Total", rows.reduce((a, r) => a + r.invoices + r.quick_sales, 0), money(d.total),
              money(rows.reduce((a, r) => a + r.collected, 0)), money(rows.reduce((a, r) => a + r.expenses, 0))],
    }],
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="reps-report-screen">
      <AppBar title="Sales by rep" back right={<IconBtn name="calendar-outline" testID="reps-report-period" onPress={() => setSheet(true)} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad + 54 }}>
        <PeriodBar label={d?.label ?? shortLabel} onPress={() => setSheet(true)} />
        {!d ? <Loading /> : (
          <>
            <Card style={[s.deep, { marginTop: 9 }]} testID="reps-report-total">
              <Lbl style={{ color: colors.onDeepMuted }}>Sales recorded by the team</Lbl>
              <Money tone="white" size={22} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{money(d.total)}</Money>
              <Sub style={{ color: colors.onDeepSoft, marginTop: 4 }}>{d.best ? `${d.best} is ahead this period` : "Nothing recorded yet"}</Sub>
            </Card>
            <Row style={{ gap: 8, marginTop: 9 }}>
              <View style={{ flex: 1 }}><Kpi label="Collected" value={money(rows.reduce((a, r) => a + r.collected, 0))} small="Money actually in" tone="pos" /></View>
              <View style={{ flex: 1 }}><Kpi label="Expenses" value={money(rows.reduce((a, r) => a + r.expenses, 0))} small="Recorded by reps" tone="neg" /></View>
            </Row>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Rep by rep</Lbl>
            {rows.length === 0 ? <Card><Empty icon="people-outline" title="No one has recorded a sale yet" /></Card> : (
              <Card style={{ paddingVertical: 4 }} testID="reps-report-rows">
                {rows.map((r, i) => (
                  <Li key={r.rep} last={i === rows.length - 1} testID={`rep-row-${r.rep}`}
                    onPress={() => (r.user_id ? router.push(`/team/reps/${r.user_id}`) : router.push(`/reports/entries?kind=rep&key=${encodeURIComponent(r.rep)}`))}>
                    <Av text={initials(r.rep)} tone={i === 0 && r.sales > 0 ? "green" : "sq"} />
                    <View style={{ flex: 1 }}>
                      <Row between>
                        <H4 numberOfLines={1} style={{ flex: 1, paddingRight: 8 }}>{r.rep}</H4>
                        <Money>{money(r.sales)}</Money>
                      </Row>
                      <Row between style={{ marginTop: 1 }}>
                        <Sub>{r.invoices} invoice{r.invoices === 1 ? "" : "s"}{r.quick_sales ? ` · ${r.quick_sales} quick` : ""}</Sub>
                        <Tag>{r.frequency}/week · avg {money(r.average_sale, { symbol: false })}</Tag>
                      </Row>
                      <Tag style={{ marginTop: 1 }} testID={`rep-shops-${r.rep}`}>
                        {r.shops?.length ? `Posted to ${r.shops.join(", ")}` : "Every location"}
                      </Tag>
                      <View style={{ marginTop: 5 }}><Prog pct={(r.sales / best) * 100} /></View>
                      <Row between style={{ marginTop: 5 }}>
                        <Pressable testID={`rep-entries-${r.rep}`} onPress={() => router.push(`/reports/entries?kind=rep&key=${encodeURIComponent(r.rep)}`)}>
                          <Tag style={{ color: colors.green700 }}>Open the {r.count} entr{r.count === 1 ? "y" : "ies"} ›</Tag>
                        </Pressable>
                        <Row style={{ gap: 8 }}>
                          <Badge tone="paid">in {money(r.collected, { symbol: false })}</Badge>
                          <Badge tone="draft">exp {money(r.expenses, { symbol: false })}</Badge>
                        </Row>
                      </Row>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={colors.ink40} />
                  </Li>
                ))}
              </Card>
            )}
            <Sub style={{ marginTop: 10 }}>A rep is whoever recorded the sale or the expense. Tap a rep for their own transactions.</Sub>
          </>
        )}
      </ScrollView>
      <ExportBar build={build} testID="reps-report" />
      <PeriodSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
