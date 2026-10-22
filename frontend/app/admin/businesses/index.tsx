// Businesses — the businesses that actually signed up in the app. From here the
// tredi team activates a plan for a client who paid directly, tailors a plan,
// and sees when each account was last used.
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { exportCsv } from "@/src/admin/export";
import { useToast } from "@/src/components/sheet";
import { AdminShell, Avatar, Btn, Col, Fig, Loading, Panel, Pill, Row, SUB_LABEL, SUB_TONE, Sub, Table, Tabs } from "@/src/admin/ui";
import { dayMonth, seenLabel } from "@/src/admin/format";
import { fonts, useTheme } from "@/src/theme";

const SORTS = [{ key: "last_active", label: "Last active" }, { key: "expiry", label: "Ends soonest" },
  { key: "newest", label: "Newest" }, { key: "name", label: "Name" }];

const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export default function Businesses() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("last_active");
  const d = useQuery({
    queryKey: ["admin-businesses", tab, q, sort],
    queryFn: () => adminApi(`/customers?status=${tab}&q=${encodeURIComponent(q)}&sort=${sort}`),
  });
  const counts = d.data?.counts ?? {};

  const doExport = async () => {
    try {
      const res = await exportCsv("Businesses", "tredi-businesses", (d.data?.rows ?? []).map((r: any) => ({
        business: r.name, owner: r.owner, email: r.email, phone: r.phone, plan: r.plan_name, status: r.status,
        ends: r.ends_at, users: r.users, shops: r.shops, last_active: r.last_active, signed_up: r.created_at,
      })));
      toast.show(res.message, "Exported ·");
    } catch (e: any) { toast.show(e.message); }
  };

  const cols: Col<any>[] = [
    { key: "biz", label: "Business", flex: 2.4, render: (r) => (
      <Row gap={9}>
        <Avatar text={initials(r.name)} />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.name || "Unnamed business"}</Text>
          <Sub numberOfLines={1}>{r.owner || "—"} · {r.email || r.phone || "no contact"}</Sub>
        </View>
      </Row>
    ) },
    { key: "plan", label: "Plan", flex: 1.3, render: (r) => (
      <View style={{ gap: 3, alignItems: "flex-start" }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }} numberOfLines={1}>{r.plan_name}</Text>
        {r.custom ? <Pill label="Custom" tone="info" /> : null}
        {r.suspended ? <Pill label="Paused" tone="bad" /> : null}
      </View>
    ) },
    { key: "status", label: "Status", flex: 1, render: (r) => <Pill label={SUB_LABEL[r.status] ?? r.status} tone={SUB_TONE[r.status]} /> },
    { key: "ends", label: "Ends", flex: 1, render: (r) => (
      <View>
        <Sub>{r.ends_at ? dayMonth(r.ends_at) : "—"}</Sub>
        {r.days_left !== null && r.days_left >= 0 ? <Sub style={{ fontSize: 10.5 }}>{r.days_left}d left</Sub> : null}
      </View>
    ) },
    { key: "team", label: "Team", flex: 0.7, align: "right", render: (r) => <Fig>{r.users}</Fig> },
    { key: "last", label: "Last active", flex: 1.1, align: "right", render: (r) => (
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: r.last_active ? colors.onSurface : colors.ink40 }} testID={`last-${r.id}`}>
        {seenLabel(r.last_active)}
      </Text>
    ) },
  ];

  return (
    <AdminShell title="Businesses" sub="Every shop using TradaBooks · activate, tailor and watch activity"
      search={q} onSearch={setQ}
      actions={<Btn label="Export CSV" icon="download-outline" disabled={!d.data} onPress={doExport} testID="businesses-export" />}
      testID="sa-customers">
      <Tabs items={[{ key: "all", label: "All", count: counts.all }, { key: "active", label: "Active", count: counts.active },
        { key: "trialing", label: "On trial", count: counts.trialing }, { key: "expired", label: "Lapsed", count: counts.expired }]}
        value={tab} onChange={setTab} />
      <Row gap={6} wrapped style={{ marginVertical: 12 }}>
        {SORTS.map((s) => (
          <Btn key={s.key} label={s.label} tone={sort === s.key ? "deep" : "ghost"} onPress={() => setSort(s.key)} testID={`sort-${s.key}`} />
        ))}
      </Row>
      {!d.data ? <Loading /> : (
        <Panel pad={0} title={`${d.data.rows.length} businesses`} sub="Tap a row to activate or customise their plan">
          <Table cols={cols} rows={d.data.rows} minWidth={860} empty="No businesses match" testID="businesses-table"
            onRowPress={(r: any) => router.push(`/admin/businesses/${r.id}` as any)} />
        </Panel>
      )}
    </AdminShell>
  );
}
