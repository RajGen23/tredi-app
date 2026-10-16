// SA.12 Platform analytics — aggregate only. The privacy boundary is a real
// constraint: tenant-level detail requires the audited path in SA.4.
import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { exportCsv } from "@/src/admin/export";
import { useToast } from "@/src/components/sheet";
import {
  AdminShell, Bars, Btn, Col, Fig, Loading, Metrics, MiniTrend, Note, Panel, Row, Table, Tabs, useWide,
} from "@/src/admin/ui";
import { fonts, useTheme } from "@/src/theme";

const WINDOWS = [{ key: "30", label: "Last 30 days" }, { key: "90", label: "Last 90 days" }, { key: "365", label: "Last year" }];
const REGIONS = [{ key: "", label: "Any region" }, { key: "NG", label: "NG" }, { key: "GH", label: "GH" }, { key: "KE", label: "KE" }];
const PLANS = [{ key: "", label: "Any plan" }, { key: "pro", label: "Pro" }, { key: "basic", label: "Basic" }, { key: "trial", label: "Trial" }];

export default function Analytics() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const [days, setDays] = useState("90");
  const [region, setRegion] = useState("");
  const [plan, setPlan] = useState("");
  const d = useQuery({ queryKey: ["admin-analytics", days, region, plan], queryFn: () => adminApi(`/analytics?days=${days}&region=${region}&plan=${plan}`) });

  const toast = useToast();
  const doExport = async () => {
    try {
      const rows = [
        ...d.data.metrics.map((m: any) => ({ section: "Metric", label: m.label, value: m.value, note: m.delta })),
        ...d.data.series.map((s: any) => ({ section: "Weekly", label: s.label, value: s.sales, note: `debt ${s.debt}` })),
        ...d.data.categories.map((c: any) => ({ section: "Category", label: c.category, value: c.units, note: "" })),
      ];
      const res = await exportCsv("Platform analytics", `tredi-analytics-${days}d`, rows);
      toast.show(res.message, "Exported ·");
    } catch (e: any) { toast.show(e.message); }
  };

  const cols: Col<any>[] = [
    { key: "cat", label: "Category", flex: 2, render: (r) => <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }}>{r.category}</Text> },
    { key: "units", label: "Units", flex: 1, align: "right", render: (r) => <Fig>{r.units >= 1_000_000 ? `${(r.units / 1_000_000).toFixed(1)}M` : `${Math.round(r.units / 1000)}K`}</Fig> },
    { key: "trend", label: "Trend", flex: 1, align: "right", render: (r) => <MiniTrend values={r.trend} /> },
  ];

  return (
    <AdminShell title="Analytics" sub="admin.tredi.app/analytics"
      actions={<Btn label="Export" icon="download-outline" disabled={!d.data} onPress={doExport} testID="analytics-export" />} testID="sa12-analytics">
      <Row gap={8} wrapped>
        <Tabs items={WINDOWS} value={days} onChange={setDays} />
        <Tabs items={REGIONS} value={region} onChange={setRegion} />
        <Tabs items={PLANS} value={plan} onChange={setPlan} />
      </Row>
      {!d.data ? <Loading /> : (
        <>
          <Metrics items={d.data.metrics} />
          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <Panel style={{ flex: 2 }} title="Volume vs debt carried" sub={`Weekly · ${d.data.tenants.toLocaleString()} tenants in this filter`}>
              <Bars data={d.data.series} height={170}
                keys={[{ key: "sales", color: colors.brandPrimary, label: "Sales volume" }, { key: "debt", color: colors.coralSoft, label: "Debt carried" }]} />
            </Panel>
            <Panel style={{ flex: 1 }} pad={0} title="Product movement" sub="Across the platform">
              <Table cols={cols} rows={d.data.categories.map((c: any, i: number) => ({ ...c, id: String(i) }))} minWidth={380} />
            </Panel>
          </View>
          <Note tone="info" title="Aggregate only — never per-customer">
            {"These figures are computed across tenants and cannot be drilled into an individual business's customer records from this screen. Tenant-level detail requires the audited path in Business detail."}
          </Note>
        </>
      )}
    </AdminShell>
  );
}
