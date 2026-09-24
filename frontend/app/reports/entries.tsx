// The entries behind a figure (PDF 33). Every total in a report is one tap from
// the records that made it — and each record opens itself.
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Card, Empty, H4, Kpi, Lbl, Li, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { ExportBar, useReportMeta } from "@/src/components/export";
import { usePeriod } from "@/src/period";
import { money, shortDate } from "@/src/format";
import { makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function ReportEntries() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const { kind = "sales", key = "", title, start, end } = useLocalSearchParams<{ kind?: string; key?: string; title?: string; start?: string; end?: string }>();
  const { query, rep } = usePeriod();
  const meta = useReportMeta();
  // A day row on a report drills into that exact day, whatever the report's period is.
  const range = start && end ? `period=custom&start=${start}&end=${end}${rep ? `&rep=${encodeURIComponent(rep)}` : ""}` : query;
  const q = useQuery({
    queryKey: ["report-entries", kind, key, range],
    queryFn: () => api(`/reports/entries?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(key)}&${range}`),
  });
  const d = q.data;
  const heading = title || d?.title || "Entries";

  const build = () => d && ({
    ...meta,
    title: `${heading} — entries`,
    period: d.label,
    kpis: [{ label: "Total", value: money(d.total) }, { label: "Records", value: String(d.count) }],
    sections: [{
      columns: [{ label: "Date" }, { label: "Record" }, { label: "Detail" }, { label: "Amount", right: true }],
      rows: d.rows.map((r: any) => [shortDate(r.date), r.title, `${r.sub}${r.extra ? ` · ${r.extra}` : ""}`, money(r.amount)]),
      total: ["", "Total", "", money(d.total)],
    }],
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="report-entries-screen">
      <AppBar title={heading} back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad + 54 }}>
        {!d ? <Loading /> : (
          <>
            <Row style={{ gap: 8 }}>
              <View style={{ flex: 1 }}><Kpi label="Total" value={money(d.total)} small={d.label} testID="entries-total" /></View>
              <View style={{ flex: 1 }}><Kpi label="Records" value={String(d.count)} small={kind === "expenses" ? "expenses" : "sales"} /></View>
            </Row>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Every record behind that figure</Lbl>
            {d.rows.length === 0 ? <Card><Empty icon="documents-outline" title="Nothing in this period" sub="Change the period on the report and try again." /></Card> : (
              <Card style={{ paddingVertical: 4 }} testID="entries-list">
                {d.rows.map((r: any, i: number) => (
                  <Li key={`${r.id}-${i}`} last={i === d.rows.length - 1} testID={`entry-${r.id}`} onPress={() => router.push(r.route as any)}>
                    <Av icon={kind === "expenses" ? "receipt-outline" : "cart-outline"} tone="sq" />
                    <View style={{ flex: 1 }}>
                      <Row between><H4 numberOfLines={1} style={{ flex: 1, paddingRight: 8 }}>{r.title}</H4><Money tone={kind === "expenses" ? "neg" : undefined}>{money(r.amount)}</Money></Row>
                      <Row between>
                        <Sub numberOfLines={1} style={{ flex: 1 }}>{r.sub}{r.extra ? ` · ${r.extra}` : ""}</Sub>
                        <Tag>{shortDate(r.date)}{r.rep ? ` · ${r.rep}` : ""}</Tag>
                      </Row>
                    </View>
                  </Li>
                ))}
              </Card>
            )}
            <Sub style={{ marginTop: 10 }}>Tap any record to open it.</Sub>
          </>
        )}
      </ScrollView>
      <ExportBar build={build} testID="entries" />
    </View>
  );
}
