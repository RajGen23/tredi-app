// SA.2 Overview — real businesses only. "Needs attention" sits above the chart on purpose.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { adminApi } from "@/src/admin/api";
import {
  AdminShell, Avatar, Bars, Btn, Col, Fig, Lbl, Loading, Metrics, Panel, Pill, Row, SUB_LABEL, SUB_TONE, Sub, Table, Tabs, useWide,
} from "@/src/admin/ui";
import { dayMonth, seenLabel } from "@/src/admin/format";
import { fonts, useTheme } from "@/src/theme";

const ATTENTION: { key: string; label: string; route: string; tone: "bad" | "warn" | "info" }[] = [
  { key: "expiring", label: "Plans ending in 7 days", route: "/admin/subscriptions", tone: "warn" },
  { key: "lapsed", label: "Lapsed · read-only", route: "/admin/subscriptions", tone: "bad" },
  { key: "plan_requests", label: "Plan requests waiting", route: "/admin/subscriptions", tone: "warn" },
  { key: "messages", label: "Help messages open", route: "/admin/support", tone: "warn" },
  { key: "inactive", label: "Inactive 14+ days", route: "/admin/businesses", tone: "info" },
];

const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export default function Overview() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const router = useRouter();
  const [window, setWindow] = useState("30");
  const d = useQuery({ queryKey: ["admin-overview", window], queryFn: () => adminApi(`/overview?window=${window}`) });

  const cols: Col<any>[] = [
    { key: "name", label: "Recently joined", flex: 2.4, render: (r) => (
      <Row gap={9}>
        <Avatar text={initials(r.name)} />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.name || "Unnamed business"}</Text>
          <Sub numberOfLines={1}>{r.owner} · {r.email || r.phone || "no contact"}</Sub>
        </View>
      </Row>
    ) },
    { key: "plan", label: "Plan", flex: 1, render: (r) => <Sub>{r.plan_name}</Sub> },
    { key: "joined", label: "Joined", flex: 1, render: (r) => <Sub>{dayMonth(r.created_at)}</Sub> },
    { key: "last", label: "Last active", flex: 1, render: (r) => <Sub>{seenLabel(r.last_active)}</Sub> },
    { key: "status", label: "Status", flex: 0.8, align: "right", render: (r) => <Pill label={SUB_LABEL[r.status] ?? r.status} tone={SUB_TONE[r.status]} /> },
  ];

  return (
    <AdminShell title="Overview" sub="Every figure here is a real business on TradaBooks"
      actions={<Btn label="Audit log" icon="receipt-outline" onPress={() => router.push("/admin/security/audit")} />}
      testID="sa2-overview">
      {!d.data ? <Loading label="Reading the platform" /> : (
        <>
          <Metrics items={d.data.metrics} />

          <Panel title="Needs attention" sub="Tap a tile to deal with it" testID="attention-panel">
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
            <Panel style={{ flex: 2 }} title="Growth" sub="New businesses and invoices raised"
              right={<Tabs items={[{ key: "30", label: "30 days" }, { key: "90", label: "90 days" }]} value={window} onChange={setWindow} />}>
              <Bars data={d.data.series} height={150}
                keys={[{ key: "invoices", color: colors.brandPrimary, label: "Invoices raised" }, { key: "signups", color: colors.mint2, label: "New businesses" }]} />
            </Panel>
            <Panel style={{ flex: 1 }} title="Quick links">
              <Sub>Activate a plan for a client who paid directly, or renew one that is ending.</Sub>
              <Row style={{ marginTop: 10 }} gap={8} wrapped>
                <Btn label="Businesses" icon="business-outline" onPress={() => router.push("/admin/businesses")} />
                <Btn label="Renewals" icon="card-outline" onPress={() => router.push("/admin/subscriptions")} />
              </Row>
            </Panel>
          </View>

          <Panel pad={0} testID="recent-panel">
            <Table cols={cols} rows={d.data.recent} minWidth={760} onRowPress={(r) => router.push(`/admin/businesses/${r.id}` as any)} />
          </Panel>
        </>
      )}
    </AdminShell>
  );
}
