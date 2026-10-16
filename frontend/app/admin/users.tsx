// SA.8 Global users directory — identity is the phone number, membership is per
// business. The locked account is surfaced with the unlock action on the row.
import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { exportCsv } from "@/src/admin/export";
import { useToast } from "@/src/components/sheet";
import {
  AdminShell, Avatar, Btn, Col, Fig, Lbl, Loading, Note, Panel, Pill, Row, Sub, Table, Tabs,
} from "@/src/admin/ui";
import { ago } from "@/src/admin/format";
import { fonts, useTheme } from "@/src/theme";

const ROLES = ["", "Owner", "Manager", "Sales", "Stock", "Accountant"];

export default function Users() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const d = useQuery({
    queryKey: ["admin-users", tab, q, role, page],
    queryFn: () => adminApi(`/users?tab=${tab}&q=${encodeURIComponent(q)}&role=${role}&page=${page}`),
  });
  const unlock = useMutation({
    mutationFn: (id: string) => adminApi(`/users/${id}/unlock`, { method: "POST", json: {} }),
    onSuccess: (res: any) => { toast.show(res.message, "Unlocked ·"); qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["admin-security"] }); },
    onError: (e: any) => toast.show(e.message),
  });
  const [exporting, setExporting] = useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const all = await adminApi(`/users?tab=${tab}&q=${encodeURIComponent(q)}&role=${role}&page=1&size=5000`);
      const res = await exportCsv("Users", "tredi-users", all.rows.map((r: any) => ({
        name: r.name, contact: r.contact, businesses: r.businesses, role: r.role, shops: r.shops,
        devices: r.devices, last_seen: r.last_seen, status: r.status,
      })));
      toast.show(res.message, "Exported ·");
    } catch (e: any) { toast.show(e.message); } finally { setExporting(false); }
  };
  const counts = d.data?.counts ?? {};
  const pages = d.data ? Math.max(1, Math.ceil(d.data.total / d.data.size)) : 1;

  const cols: Col<any>[] = [
    { key: "user", label: "User", flex: 2, render: (r) => (
      <Row gap={9}>
        <Avatar text={r.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")} />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.name}</Text>
          <Sub numberOfLines={1}>{r.contact}</Sub>
        </View>
      </Row>
    ) },
    { key: "biz", label: "Business", flex: 1.6, render: (r) => <Sub numberOfLines={1}>{r.business}</Sub> },
    { key: "role", label: "Role", flex: 1.1, render: (r) => <Pill label={r.role} tone={r.custom ? "info" : r.role === "Owner" ? "ok" : "mut"} /> },
    { key: "shops", label: "Shops", flex: 1, render: (r) => <Sub numberOfLines={1}>{r.shops}</Sub> },
    { key: "devices", label: "Devices", flex: 0.7, align: "right", render: (r) => <Fig>{r.devices}</Fig> },
    { key: "seen", label: "Last seen", flex: 0.9, align: "right", render: (r) => <Sub>{r.status === "never" ? "never" : ago(r.last_seen)}</Sub> },
    { key: "status", label: "Status", flex: 1.4, align: "right", render: (r) => (
      r.status === "locked"
        ? <Row gap={7}>
            <Pill label={`Locked · ${r.failed_pins} failed PINs`} tone="bad" />
            <Btn label="Unlock" onPress={() => unlock.mutate(r.id)} testID={`unlock-${r.id}`} />
          </Row>
        : <Pill label={r.status === "never" ? "Never signed in" : "Active"} tone={r.status === "never" ? "mut" : "ok"} />
    ) },
  ];

  return (
    <AdminShell title="Users" sub="admin.tredi.app/users" search={q} onSearch={(v) => { setQ(v); setPage(1); }}
      actions={<Btn label="Export" icon="download-outline" busy={exporting} onPress={doExport} testID="users-export" />} testID="sa8-users">
      <Tabs value={tab} onChange={(k) => { setTab(k); setPage(1); }}
        items={[{ key: "all", label: "All", count: counts.all }, { key: "owners", label: "Owners", count: counts.owners },
          { key: "staff", label: "Staff", count: counts.staff }, { key: "locked", label: "Locked", count: counts.locked },
          { key: "never", label: "Never signed in", count: counts.never }]} />
      <Tabs items={ROLES.map((r) => ({ key: r, label: r || "Any role" }))} value={role} onChange={(k) => { setRole(k); setPage(1); }} />
      <Panel pad={0} testID="users-table">
        {!d.data ? <Loading /> : <Table cols={cols} rows={d.data.rows} minWidth={1040} />}
      </Panel>
      <Row style={{ justifyContent: "space-between" }}>
        <Sub>Showing {d.data?.rows.length ?? 0} of {(d.data?.total ?? 0).toLocaleString()}</Sub>
        <Row gap={7}>
          <Btn label="‹" onPress={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} />
          <Lbl>{page} / {pages}</Lbl>
          <Btn label="›" onPress={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages} />
        </Row>
      </Row>
      <Note tone="info" title="One person, several businesses">
        An accountant can hold a role in more than one business. Identity is the phone number; membership is per business, and revoking one never touches the others.
      </Note>
    </AdminShell>
  );
}
