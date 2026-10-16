// SA.11 Audit log — append-only, admin rows tinted and never filtered out.
import { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { exportCsv } from "@/src/admin/export";
import { useToast } from "@/src/components/sheet";
import { AdminShell, Btn, Col, Lbl, Loading, Note, Panel, Pill, Row, Sub, Table, Tabs } from "@/src/admin/ui";
import { stamp } from "@/src/admin/format";
import { fonts, useTheme } from "@/src/theme";

const TABS = [
  { key: "all", label: "All events" }, { key: "admin", label: "Admin actions" },
  { key: "permission", label: "Permission changes" }, { key: "deletion", label: "Deletions" },
  { key: "export", label: "Data exports" }, { key: "impersonation", label: "Impersonation" },
];

export default function AuditLog() {
  const { colors } = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const d = useQuery({
    queryKey: ["admin-audit", tab, q, page],
    queryFn: () => adminApi(`/security/audit?tab=${tab}&q=${encodeURIComponent(q)}&page=${page}`),
  });
  const pages = d.data ? Math.max(1, Math.ceil(d.data.total / d.data.size)) : 1;
  const toast = useToast();
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const all = await adminApi(`/security/audit?tab=${tab}&q=${encodeURIComponent(q)}&page=1&size=5000`);
      const res = await exportCsv("Audit log", "tredi-audit-log", all.rows.map((r: any) => ({
        timestamp: r.ts, actor: r.actor, actor_kind: r.actor_kind, business: r.business, shop: r.shop,
        event: r.event, entity: r.entity, source: r.source,
      })));
      toast.show(res.message, "Exported ·");
      qc.invalidateQueries({ queryKey: ["admin-audit"] });
    } catch (e: any) { toast.show(e.message); } finally { setExporting(false); }
  };

  const cols: Col<any>[] = [
    { key: "ts", label: "Timestamp", flex: 1.1, render: (r) => <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink60 }}>{stamp(r.ts)}</Text> },
    { key: "actor", label: "Actor", flex: 1.2, render: (r) => (
      <Row gap={6}>
        {r.actor_kind !== "user" ? <Pill label={r.actor_kind === "admin" ? "ADMIN" : "SYS"} tone={r.actor_kind === "admin" ? "bad" : "mut"} /> : null}
        <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }} numberOfLines={1}>{r.actor}</Text>
      </Row>
    ) },
    { key: "biz", label: "Business / shop", flex: 1.6, render: (r) => <Sub numberOfLines={1}>{r.business}{r.shop ? ` · ${r.shop}` : ""}</Sub> },
    { key: "event", label: "Event", flex: 1.5, render: (r) => <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }} numberOfLines={1}>{r.event}</Text> },
    { key: "entity", label: "Entity", flex: 1.6, render: (r) => <Sub numberOfLines={1}>{r.entity || "—"}</Sub> },
    { key: "source", label: "Source", flex: 0.9, align: "right", render: (r) => <Pill label={r.source} tone="mut" /> },
  ];

  return (
    <AdminShell title="Audit log" sub="admin.tredi.app/security/audit" search={q} onSearch={(v) => { setQ(v); setPage(1); }}
      actions={<Row gap={8}><Pill label={d.data?.retention ?? "Append-only"} tone="mut" /><Btn label="Export" icon="download-outline" busy={exporting} onPress={doExport} testID="audit-export" />
        <Btn label="Monitor" onPress={() => router.push("/admin/security")} /></Row>}
      testID="sa11-audit">
      <Tabs items={TABS} value={tab} onChange={(k) => { setTab(k); setPage(1); }} />
      <Panel pad={0} testID="audit-table">
        {!d.data ? <Loading /> : <Table cols={cols} rows={d.data.rows} minWidth={1120} empty="No events in this filter" />}
      </Panel>
      <Row style={{ justifyContent: "space-between" }}>
        <Sub>{(d.data?.total ?? 0).toLocaleString()} events · admin rows cannot be filtered out</Sub>
        <Row gap={7}>
          <Btn label="‹" onPress={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} />
          <Lbl>{page} / {pages}</Lbl>
          <Btn label="›" onPress={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages} />
        </Row>
      </Row>
      <Note tone="info" title="Whatever the panel does to a tenant's data appears in the tenant's own history">
        With the same wording, so nothing exists here that the business owner cannot see there.
      </Note>
    </AdminShell>
  );
}
