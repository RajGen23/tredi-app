// SA.3 Businesses (tenants) — volume, storage and last-active on the row,
// because those three predict churn and cost. A lapsed tenant goes read-only.
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import {
  AdminShell, Avatar, Btn, Col, Fig, Lbl, Loading, PLAN_TONE, Panel, Pill, Row, STATUS_LABEL, STATUS_TONE, Sub, Table, Tabs,
} from "@/src/admin/ui";
import { ago, compactMoney, expiryLabel } from "@/src/admin/format";
import { fonts, useTheme } from "@/src/theme";

const PLANS = ["", "pro", "basic", "trial", "lapsed"];
const REGIONS = ["", "NG", "GH", "KE"];
const SORTS = [{ key: "last_active", label: "Sort: last active" }, { key: "volume", label: "Sort: volume" },
  { key: "expiry", label: "Sort: expiry" }, { key: "name", label: "Sort: name" }];

export default function Businesses() {
  const { colors } = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [region, setRegion] = useState("");
  const [sort, setSort] = useState("last_active");
  const [page, setPage] = useState(1);
  const d = useQuery({
    queryKey: ["admin-businesses", tab, q, plan, region, sort, page],
    queryFn: () => adminApi(`/businesses?tab=${tab}&q=${encodeURIComponent(q)}&plan=${plan}&region=${region}&sort=${sort}&page=${page}`),
  });
  const counts = d.data?.counts ?? {};
  const pages = d.data ? Math.max(1, Math.ceil(d.data.total / d.data.size)) : 1;

  const cols: Col<any>[] = [
    { key: "biz", label: "Business", flex: 2.6, render: (r) => (
      <Row gap={9}>
        <Avatar text={r.initials} />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.name}</Text>
          <Sub numberOfLines={1}>{r.tin ? `TIN ${r.tin}` : "No TIN on file"} · {r.city}</Sub>
        </View>
      </Row>
    ) },
    { key: "plan", label: "Plan", flex: 1.1, render: (r) => (
      <View>
        <Pill label={r.plan === "pro" ? "Pro" : r.plan === "basic" ? "Basic" : r.plan === "trial" ? "Trial" : "Lapsed"} tone={PLAN_TONE[r.plan] ?? "mut"} />
        <Sub style={{ marginTop: 3 }} numberOfLines={1}>{r.plan === "trial" ? `${Math.max(0, r.days_to_expiry)} days left` : r.days_to_expiry < 0 ? expiryLabel(r.days_to_expiry) : `renews in ${r.days_to_expiry}d`}</Sub>
      </View>
    ) },
    { key: "size", label: "Shops / users", flex: 1, align: "right", render: (r) => <Fig>{r.shops} / {r.users}</Fig> },
    { key: "vol", label: "30-day volume", flex: 1.1, align: "right", render: (r) => <Fig>{compactMoney(r.volume_30d)}</Fig> },
    { key: "storage", label: "Storage", flex: 1, align: "right", render: (r) => (
      <View style={{ alignItems: "flex-end" }}>
        <Fig tone={r.storage_used_gb / r.storage_limit_gb > 0.85 ? "neg" : undefined}>{r.storage_used_gb} / {r.storage_limit_gb} GB</Fig>
        <View style={{ width: 58, height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, marginTop: 4 }}>
          <View style={{ width: `${Math.min(100, (r.storage_used_gb / r.storage_limit_gb) * 100)}%`, height: 4, borderRadius: 2, backgroundColor: colors.brandPrimary }} />
        </View>
      </View>
    ) },
    { key: "seen", label: "Last active", flex: 1, align: "right", render: (r) => <Sub>{ago(r.last_active)} ago</Sub> },
    { key: "status", label: "Status", flex: 1.1, align: "right", render: (r) => (
      <Row gap={6}>
        <Pill label={STATUS_LABEL[r.status] ?? r.status} tone={STATUS_TONE[r.status] ?? "mut"} />
        {r.suspended ? <Pill label="Suspended" tone="bad" /> : null}
      </Row>
    ) },
  ];

  return (
    <AdminShell title="Businesses" sub="admin.tredi.app/businesses" search={q} onSearch={(v) => { setQ(v); setPage(1); }}
      actions={<Row gap={8}><Btn label="Export CSV" icon="download-outline" /><Btn label="Add business" icon="add" tone="primary" onPress={() => router.push("/admin/migration")} /></Row>}
      testID="sa3-businesses">
      <Tabs
        value={tab}
        onChange={(k) => { setTab(k); setPage(1); }}
        items={[{ key: "all", label: "All", count: counts.all }, { key: "active", label: "Active", count: counts.active },
          { key: "trial", label: "Trial", count: counts.trial }, { key: "expiring", label: "Expiring", count: counts.expiring },
          { key: "suspended", label: "Suspended", count: counts.suspended }]}
      />
      <Row gap={8} wrapped>
        <Tabs items={PLANS.map((p) => ({ key: p, label: p ? p[0].toUpperCase() + p.slice(1) : "Any plan" }))} value={plan} onChange={setPlan} />
        <Tabs items={REGIONS.map((r) => ({ key: r, label: r || "Any region" }))} value={region} onChange={setRegion} />
        <Tabs items={SORTS} value={sort} onChange={setSort} />
      </Row>
      <Panel pad={0} testID="businesses-table">
        {!d.data ? <Loading /> : <Table cols={cols} rows={d.data.rows} minWidth={1080} onRowPress={(r) => router.push(`/admin/businesses/${r.id}` as any)} />}
      </Panel>
      <Row style={{ justifyContent: "space-between" }}>
        <Sub>Showing {d.data?.rows.length ?? 0} of {(d.data?.total ?? 0).toLocaleString()}</Sub>
        <Row gap={7}>
          <Btn label="‹" onPress={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} />
          <Lbl>{page} / {pages}</Lbl>
          <Btn label="›" onPress={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages} testID="businesses-next" />
        </Row>
      </Row>
    </AdminShell>
  );
}
