// Debtors — who owes money, how much, which invoice has been sitting longest
// and how many days late it is. The named report the old app had.
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Card, Empty, H4, Kpi, Lbl, Li, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { ExportBar, useReportMeta } from "@/src/components/export";
import { initials, money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Debtors() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const meta = useReportMeta();
  const q = useQuery({ queryKey: ["reports-debtors"], queryFn: () => api("/reports/debtors") });
  const d = q.data;
  const rows: any[] = d?.rows ?? [];

  const build = () => d && ({
    ...meta,
    title: "Debtors",
    kpis: [{ label: "Owed to you", value: money(d.total) }, { label: "Customers", value: String(d.count) },
           { label: "Overdue", value: money(d.overdue) }],
    sections: [{
      columns: [{ label: "Customer" }, { label: "Oldest unpaid" }, { label: "Days late", right: true },
                { label: "Invoices", right: true }, { label: "Owed", right: true }],
      rows: rows.map((r) => [r.customer, r.oldest_number || "—", r.oldest_days > 0 ? r.oldest_days : "—", r.invoices, money(r.owed)]),
      total: ["Total", "", "", rows.reduce((a, r) => a + r.invoices, 0), money(d.total)],
    }],
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="debtors-screen">
      <AppBar title="Debtors" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 94 }}>
        {!d ? <Loading /> : (
          <>
            <Row style={{ gap: 8 }}>
              <View style={{ flex: 1 }}><Kpi label="Owed to you" value={money(d.total)} small={`${d.count} customer${d.count === 1 ? "" : "s"}`} tone="neg" testID="debtors-total" /></View>
              <View style={{ flex: 1 }}><Kpi label="Already overdue" value={money(d.overdue)} small="Past the due date" /></View>
            </Row>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Who owes what</Lbl>
            {rows.length === 0 ? <Card><Empty icon="checkmark-circle-outline" title="Nobody owes you" sub="Every invoice has been settled." /></Card> : (
              <Card style={{ paddingVertical: 4 }} testID="debtors-rows">
                {rows.map((r, i) => (
                  <Li key={r.id || r.customer} last={i === rows.length - 1} testID={`debtor-${r.id || r.customer}`}
                    onPress={() => (r.id ? router.push(`/customers/${r.id}`) : undefined)}>
                    <Av text={initials(r.customer)} tone={r.oldest_days > 30 ? "coral" : "mint"} />
                    <View style={{ flex: 1 }}>
                      <Row between>
                        <H4 numberOfLines={1} style={{ flex: 1, paddingRight: 8 }}>{r.customer}</H4>
                        <Money tone="neg">{money(r.owed)}</Money>
                      </Row>
                      <Row between style={{ marginTop: 1 }}>
                        <Sub>Oldest unpaid {r.oldest_number || "—"} · {r.invoices} invoice{r.invoices === 1 ? "" : "s"}</Sub>
                        {r.oldest_days > 0 ? <Badge tone="over">{r.oldest_days}d late</Badge> : <Badge tone="due">Not due yet</Badge>}
                      </Row>
                      {r.over_limit ? <Tag style={{ color: colors.coral, marginTop: 3 }}>Over their {money(r.limit ?? 0)} credit limit</Tag> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={colors.ink40} />
                  </Li>
                ))}
              </Card>
            )}
            <Sub style={{ marginTop: 10 }}>Tap a customer for their ledger, where a payment can be recorded straight away.</Sub>
          </>
        )}
      </ScrollView>
      <ExportBar build={build} testID="debtors" />
    </View>
  );
}
