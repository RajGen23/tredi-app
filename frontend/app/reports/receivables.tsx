// Receivables & payables — the ageing buckets behind Summary's tap row.
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Badge, Card, Empty, H4, Kpi, Lbl, Li, Loading, Money, Row, Sub } from "@/src/components/ui";
import { ExportBar, useReportMeta } from "@/src/components/export";
import { money } from "@/src/format";
import { makeStyles } from "@/src/theme";

const BUCKETS: { key: string; label: string }[] = [
  { key: "current", label: "Not yet due" },
  { key: "1_30", label: "1 – 30 days" },
  { key: "31_60", label: "31 – 60 days" },
  { key: "60_plus", label: "Over 60 days" },
];

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Receivables() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const meta = useReportMeta();
  const q = useQuery({ queryKey: ["reports-receivables"], queryFn: () => api("/reports/receivables") });
  const d = q.data;

  const build = () => d && ({
    ...meta,
    title: "Receivables & payables",
    kpis: [{ label: "Owed to you", value: money(d.total) }, { label: "You owe", value: money(d.payables) },
           { label: "Open invoices", value: String(d.rows.length) }],
    sections: [
      { heading: "Ageing",
        columns: [{ label: "Bucket" }, { label: "Amount", right: true }],
        rows: BUCKETS.map((b) => [b.label, money(d.buckets[b.key])]),
        total: ["Total owed to you", money(d.total)] },
      { heading: "Who owes what",
        columns: [{ label: "Customer" }, { label: "Invoice" }, { label: "Days late", right: true }, { label: "Due", right: true }],
        rows: d.rows.map((r: any) => [r.customer, r.number, r.days_overdue > 0 ? r.days_overdue : "—", money(r.due)]) },
    ],
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="receivables-screen">
      <AppBar title="Receivables & payables" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 94 }}>
        {!d ? <Loading /> : (
          <>
            <Row style={{ gap: 8 }}>
              <View style={{ flex: 1 }}><Kpi label="Owed to you" value={money(d.total)} small={`${d.rows.length} open invoices`} tone="neg" /></View>
              <View style={{ flex: 1 }}><Kpi label="You owe" value={money(d.payables)} small="Suppliers" /></View>
            </Row>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Ageing</Lbl>
            <Card style={{ paddingVertical: 4 }} testID="receivables-buckets">
              {BUCKETS.map((b, i) => (
                <Li key={b.key} last={i === BUCKETS.length - 1}>
                  <View style={{ flex: 1 }}><H4>{b.label}</H4></View>
                  <Money tone={b.key === "60_plus" ? "neg" : undefined}>{money(d.buckets[b.key])}</Money>
                </Li>
              ))}
            </Card>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Who owes what</Lbl>
            {d.rows.length === 0 ? <Card><Empty icon="checkmark-circle-outline" title="Nothing outstanding" sub="Every invoice is settled." /></Card> : (
              <Card style={{ paddingVertical: 4 }}>
                {d.rows.map((r: any, i: number) => (
                  <Li key={r.id} last={i === d.rows.length - 1} testID={`receivable-${r.id}`} onPress={() => router.push(`/invoices/${r.id}`)}>
                    <View style={{ flex: 1 }}>
                      <H4>{r.customer}</H4>
                      <Sub>{r.number}</Sub>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 3 }}>
                      <Money tone="neg">{money(r.due)}</Money>
                      {r.days_overdue > 0 ? <Badge tone="over">{r.days_overdue}d late</Badge> : <Badge tone="due">Due</Badge>}
                    </View>
                  </Li>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
      <ExportBar build={build} testID="receivables" />
    </View>
  );
}
