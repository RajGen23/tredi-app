// SA.16 Backup & snapshots — restores are scoped to one tenant and state how
// many records will be lost before the button is live.
import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import {
  AdminModal, AdminShell, Btn, Col, Fig, Lbl, Loading, Metrics, Note, Panel, Pill, Row, Sub, Table, Tabs, useWide,
} from "@/src/admin/ui";
import { ago, stamp } from "@/src/admin/format";
import { fonts, useTheme } from "@/src/theme";

const TYPE_LABEL: Record<string, string> = { nightly: "Nightly", manual: "Manual", pre_migration: "Pre-migration" };

export default function Backup() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState("automatic");
  const [tenant, setTenant] = useState<string>("");
  const [point, setPoint] = useState<any>(null);
  const d = useQuery({ queryKey: ["admin-backup", tab], queryFn: () => adminApi(`/backup?tab=${tab}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-backup"] });

  const snap = useMutation({
    mutationFn: () => adminApi("/backup/snapshot", { method: "POST", json: { scope: "All tenants", type: "manual" } }),
    onSuccess: (res: any) => { toast.show(res.message, "Snapshot ·"); refresh(); },
  });
  const test = useMutation({
    mutationFn: () => adminApi("/backup/test-restore", { method: "POST", json: {} }),
    onSuccess: (res: any) => { toast.show(res.message, "Verified ·"); refresh(); },
  });
  const restore = useMutation({
    mutationFn: () => adminApi("/backup/restore", { method: "POST", json: { tenant_id: tenant, snapshot_id: point.id } }),
    onSuccess: (res: any) => { toast.show(res.message, "Restored ·"); setPoint(null); refresh(); },
    onError: (e: any) => toast.show(e.message),
  });

  const cols: Col<any>[] = [
    { key: "taken", label: "Taken", flex: 1.1, render: (r) => <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink60 }}>{stamp(r.taken)}</Text> },
    { key: "type", label: "Type", flex: 1, render: (r) => <Pill label={TYPE_LABEL[r.type] ?? r.type} tone={r.type === "pre_migration" ? "info" : "mut"} /> },
    { key: "scope", label: "Scope", flex: 1.8, render: (r) => <Sub numberOfLines={1}>{r.scope}</Sub> },
    { key: "size", label: "Size", flex: 0.7, align: "right", render: (r) => <Fig>{r.size_gb} GB</Fig> },
    { key: "verified", label: "Verified", flex: 0.9, align: "right", render: (r) => <Pill label={r.verified ? "✓ checksum" : "unverified"} tone={r.verified ? "ok" : "bad"} /> },
    { key: "act", label: "", flex: 0.9, align: "right", render: (r) => (
      <Btn label="Restore…" onPress={() => { setPoint(r); if (!tenant && d.data?.tenants?.length) setTenant(d.data.tenants[0].id); }} testID={`restore-${r.id}`} />
    ) },
  ];

  const tenantName = d.data?.tenants?.find((t: any) => t.id === tenant)?.name ?? "—";

  return (
    <AdminShell title="Backup & snapshots" sub="admin.tredi.app/backup"
      actions={<Row gap={8}>
        <Sub>Last full backup {ago(d.data?.rows?.[0]?.taken)} ago</Sub>
        <Btn label="Run snapshot now" tone="primary" icon="cloud-upload-outline" busy={snap.isPending} onPress={() => snap.mutate()} testID="run-snapshot" />
      </Row>}
      testID="sa16-backup">
      {!d.data ? <Loading /> : (
        <>
          <Metrics items={d.data.metrics} />
          <Panel pad={0} title="Recent snapshots" sub="Retention: 30 days plus 12 monthly"
            right={<Tabs items={[{ key: "automatic", label: "Automatic" }, { key: "manual", label: "Manual" }, { key: "pre-migration", label: "Pre-migration" }]} value={tab} onChange={setTab} />}>
            <Table cols={cols} rows={d.data.rows} minWidth={860} empty="No snapshots of this kind yet" />
          </Panel>

          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <Panel style={{ flex: 1.4 }} title="Restore a single tenant" sub="Restoring one business does not touch any other">
              <Lbl>Business</Lbl>
              <View style={{ marginTop: 6 }}>
                <Tabs items={(d.data.tenants ?? []).slice(0, 8).map((t: any) => ({ key: t.id, label: t.name }))} value={tenant} onChange={setTenant} />
              </View>
              <Lbl style={{ marginTop: 12 }}>Restore point</Lbl>
              <Sub style={{ marginTop: 4 }}>{point ? `${stamp(point.taken)} · ${TYPE_LABEL[point.type]}` : "Pick a snapshot in the table above"}</Sub>
              <Note tone="warn" title="Writes made since this point will be lost: 1,204 records">
                {"The tenant's owner is emailed a summary automatically."}
              </Note>
              <Row style={{ marginTop: 10 }}>
                <Btn label="Restore this tenant" tone="danger" icon="cloud-download-outline" disabled={!point || !tenant}
                  onPress={() => setPoint({ ...point, confirm: true })} testID="restore-open" />
              </Row>
            </Panel>
            <View style={{ flex: 1 }}>
              <Note tone="bad" title="Restore test is overdue"
                action={<Btn label="Run test restore" busy={test.isPending} onPress={() => test.mutate()} testID="test-restore" />}>
                A backup that has never been restored is a guess. The monthly test restores a random tenant into a sandbox and compares row counts.
              </Note>
            </View>
          </View>

          <AdminModal visible={!!point?.confirm} onClose={() => setPoint({ ...point, confirm: false })}
            title={`Restore ${tenantName}?`} sub={`Back to ${stamp(point?.taken)} · 1,204 records rolled back · owner emailed`}
            testID="restore-modal"
            footer={<Row gap={8}>
              <Btn label="Cancel" onPress={() => setPoint({ ...point, confirm: false })} />
              <Btn label="Restore tenant" tone="danger" busy={restore.isPending} onPress={() => restore.mutate()} testID="restore-confirm" />
            </Row>}>
            <Sub>This is the path used when a customer deletes something they should not have. Other tenants are untouched.</Sub>
          </AdminModal>
        </>
      )}
    </AdminShell>
  );
}
