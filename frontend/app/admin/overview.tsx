// SA.2 Overview — "Needs attention" sits above the growth chart on purpose.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { adminApi } from "@/src/admin/api";
import {
  AdminShell, Avatar, Bars, Btn, Col, Fig, H2, Lbl, Loading, Metrics, Panel, Pill, Row, STATUS_LABEL, STATUS_TONE, Sub, Table, Tabs, useWide,
} from "@/src/admin/ui";
import { compactMoney } from "@/src/admin/format";
import { fonts, useTheme } from "@/src/theme";

const ATTENTION: { key: string; label: string; route: string; tone: "bad" | "warn" | "info" }[] = [
  { key: "sync", label: "Sync failures > 6h", route: "/admin/sync", tone: "bad" },
  { key: "expiring", label: "Subscriptions expiring", route: "/admin/subscriptions", tone: "warn" },
  { key: "overdue", label: "Payments overdue", route: "/admin/subscriptions", tone: "warn" },
  { key: "migrations", label: "Migrations queued", route: "/admin/migration", tone: "info" },
  { key: "support", label: "Support access open", route: "/admin/support", tone: "info" },
];

export default function Overview() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const router = useRouter();
  const [window, setWindow] = useState("30");
  const [q, setQ] = useState("");
  const d = useQuery({ queryKey: ["admin-overview", window], queryFn: () => adminApi(`/overview?window=${window}`) });

  const cols: Col<any>[] = [
    { key: "name", label: "Recently joined", flex: 2.4, render: (r) => (
      <Row gap={9}>
        <Avatar text={r.initials} />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.name}</Text>
          <Sub numberOfLines={1}>{r.city} · {r.sector}</Sub>
        </View>
      </Row>
    ) },
    { key: "plan", label: "Plan", flex: 0.8, render: (r) => <Pill label={r.plan === "pro" ? "Pro" : r.plan === "basic" ? "Basic" : r.plan === "trial" ? "Trial" : "Lapsed"} tone={r.plan === "pro" ? "info" : "mut"} /> },
    { key: "shops", label: "Shops", flex: 0.6, align: "right", render: (r) => <Fig>{r.shops}</Fig> },
    { key: "users", label: "Users", flex: 0.6, align: "right", render: (r) => <Fig>{r.users}</Fig> },
    { key: "first", label: "First invoice", flex: 1.4, render: (r) => <Sub numberOfLines={1}>{r.first_invoice}</Sub> },
    { key: "status", label: "Status", flex: 1, align: "right", render: (r) => <Pill label={STATUS_LABEL[r.status] ?? r.status} tone={STATUS_TONE[r.status] ?? "mut"} /> },
  ];

  return (
    <AdminShell title="Overview" sub="admin.tredi.app/overview" search={q} onSearch={setQ}
      actions={<Btn label="Audit log" icon="receipt-outline" onPress={() => router.push("/admin/security/audit")} />}
      testID="sa2-overview">
      {!d.data ? <Loading label="Reading the platform" /> : (
        <>
          <Metrics items={d.data.metrics} />

          <Panel title="Needs attention" sub="Fourteen stuck syncs are fourteen shops whose books are currently wrong." testID="attention-panel">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {ATTENTION.map((a) => (
                <Pressable key={a.key} testID={`attention-${a.key}`} onPress={() => router.push(a.route as any)}
                  style={({ hovered }: any) => [{ flexGrow: 1, flexBasis: 150, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: hovered ? colors.faint : colors.surfaceSecondary }]}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Lbl numberOfLines={2} style={{ flex: 1 }}>{a.label}</Lbl>
                    <Ionicons name="chevron-forward" size={13} color={colors.ink40} />
                  </Row>
                  <Fig size={21} tone={a.tone === "bad" ? "neg" : undefined} style={{ marginTop: 6 }}>{d.data.attention[a.key] ?? 0}</Fig>
                </Pressable>
              ))}
            </View>
          </Panel>

          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <Panel style={{ flex: 2 }} title="Platform activity" sub="Invoices raised vs sales recorded"
              right={<Tabs items={[{ key: "30", label: "30 days" }, { key: "90", label: "90 days" }]} value={window} onChange={setWindow} />}>
              <Bars data={d.data.series} height={150}
                keys={[{ key: "invoices", color: colors.brandPrimary, label: "Invoices raised" }, { key: "sales", color: colors.mint2, label: "Sales recorded" }]} />
            </Panel>
            <Panel style={{ flex: 1 }} title="Gross sales · 30 days" sub="All tenants, all shops">
              <Fig size={26}>{compactMoney(Number(String(d.data.metrics[3].value).replace(/[^\d.]/g, "")) || 0)}</Fig>
              <Sub style={{ marginTop: 4 }}>{d.data.metrics[3].delta} vs previous period</Sub>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }} />
              <H2>Where to look first</H2>
              <Sub style={{ marginTop: 4 }}>Vanity metrics belong under the work, not over it. Clear the stuck queues, then read the chart.</Sub>
              <Row style={{ marginTop: 10 }} gap={8} wrapped>
                <Btn label="Sync monitor" icon="sync-outline" onPress={() => router.push("/admin/sync")} />
                <Btn label="Renewals" icon="card-outline" onPress={() => router.push("/admin/subscriptions")} />
              </Row>
            </Panel>
          </View>

          <Panel pad={0} testID="recent-panel">
            <Table cols={cols} rows={d.data.recent} onRowPress={(r) => router.push(`/admin/businesses/${r.id}` as any)} />
          </Panel>
        </>
      )}
    </AdminShell>
  );
}
