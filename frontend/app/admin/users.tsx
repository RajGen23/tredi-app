// SA.8 Users — every real person signed in to TradaBooks, with the business they
// belong to and when they were last active.
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { exportCsv } from "@/src/admin/export";
import { useToast } from "@/src/components/sheet";
import { AdminShell, Avatar, Btn, Col, Lbl, Loading, Panel, Pill, Row, Sub, Table, Tabs } from "@/src/admin/ui";
import { dayMonth, seenLabel } from "@/src/admin/format";
import { fonts, useTheme } from "@/src/theme";

const ROLES = ["", "owner", "manager", "sales", "stock", "accountant"];
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export default function Users() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const d = useQuery({
    queryKey: ["admin-users", tab, q, role, page],
    queryFn: () => adminApi(`/users?tab=${tab}&q=${encodeURIComponent(q)}&role=${role}&page=${page}`),
  });
  const [exporting, setExporting] = useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const all = await adminApi(`/users?tab=${tab}&q=${encodeURIComponent(q)}&role=${role}&page=1&size=5000`);
      const res = await exportCsv("Users", "tredi-users", all.rows.map((r: any) => ({
        name: r.name, email: r.email, phone: r.phone, business: r.business, role: r.role, shop: r.shop,
        last_active: r.last_seen, joined: r.joined,
      })));
      toast.show(res.message, "Exported ·");
    } catch (e: any) { toast.show(e.message, undefined, "bad"); } finally { setExporting(false); }
  };
  const counts = d.data?.counts ?? {};
  const pages = d.data ? Math.max(1, Math.ceil(d.data.total / d.data.size)) : 1;

  const cols: Col<any>[] = [
    { key: "user", label: "Person", flex: 2, render: (r) => (
      <Row gap={9}>
        <Avatar text={(r.name || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()} />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.name}</Text>
          <Sub numberOfLines={1}>{r.email || r.phone}</Sub>
        </View>
      </Row>
    ) },
    { key: "biz", label: "Business", flex: 1.6, render: (r) => <Sub numberOfLines={1}>{r.business || "—"}</Sub> },
    { key: "role", label: "Role", flex: 0.9, render: (r) => <Pill label={cap(r.role)} tone={r.role === "owner" ? "ok" : "mut"} /> },
    { key: "shop", label: "Shop", flex: 1, render: (r) => <Sub numberOfLines={1}>{r.shop || "—"}</Sub> },
    { key: "joined", label: "Joined", flex: 0.9, render: (r) => <Sub>{dayMonth(r.joined)}</Sub> },
    { key: "seen", label: "Last active", flex: 1, align: "right", render: (r) => (
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: r.last_seen ? colors.onSurface : colors.ink40 }}>{seenLabel(r.last_seen)}</Text>
    ) },
  ];

  return (
    <AdminShell title="Users" sub="Everyone on TradaBooks · tap a person to open their business" search={q} onSearch={(v) => { setQ(v); setPage(1); }}
      actions={<Btn label="Export" icon="download-outline" busy={exporting} onPress={doExport} testID="users-export" />} testID="sa8-users">
      <Tabs value={tab} onChange={(k) => { setTab(k); setPage(1); }}
        items={[{ key: "all", label: "All", count: counts.all }, { key: "owners", label: "Owners", count: counts.owners },
          { key: "staff", label: "Staff", count: counts.staff }, { key: "inactive", label: "Inactive 14+ days", count: counts.inactive },
          { key: "never", label: "Not seen yet", count: counts.never }]} />
      <Tabs items={ROLES.map((r) => ({ key: r, label: r ? cap(r) : "Any role" }))} value={role} onChange={(k) => { setRole(k); setPage(1); }} />
      <Panel pad={0} testID="users-table">
        {!d.data ? <Loading /> : <Table cols={cols} rows={d.data.rows} minWidth={980} empty="No one matches"
          onRowPress={(r: any) => r.business_id && router.push(`/admin/businesses/${r.business_id}` as any)} />}
      </Panel>
      <Row style={{ justifyContent: "space-between" }}>
        <Sub>Showing {d.data?.rows.length ?? 0} of {(d.data?.total ?? 0).toLocaleString()}</Sub>
        <Row gap={7}>
          <Btn label="‹" onPress={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} testID="users-prev" />
          <Lbl>{page} / {pages}</Lbl>
          <Btn label="›" onPress={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages} testID="users-next" />
        </Row>
      </Row>
    </AdminShell>
  );
}
