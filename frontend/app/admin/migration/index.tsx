// SA.17 (list) — legacy ingests waiting for a decision. No ingest runs without a
// snapshot immediately before it.
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { AdminShell, Col, Fig, Loading, Note, Panel, Pill, Sub, Table } from "@/src/admin/ui";
import { fonts, useTheme } from "@/src/theme";

const STEPS = ["Upload", "Map fields", "Dry run", "Snapshot", "Commit"];

export default function Migrations() {
  const { colors } = useTheme();
  const router = useRouter();
  const d = useQuery({ queryKey: ["admin-migrations"], queryFn: () => adminApi("/migration") });

  const cols: Col<any>[] = [
    { key: "tenant", label: "Business", flex: 2, render: (r) => (
      <View>
        <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.tenant}</Text>
        <Sub numberOfLines={1}>{r.file}</Sub>
      </View>
    ) },
    { key: "rows", label: "Rows read", flex: 1, align: "right", render: (r) => <Fig>{r.rows_read.toLocaleString()}</Fig> },
    { key: "step", label: "Stage", flex: 1.4, align: "right", render: (r) => <Pill label={`${r.step} · ${STEPS[Math.max(0, r.step - 1)]}`} tone={r.committed ? "ok" : "warn"} /> },
    { key: "state", label: "", flex: 0.8, align: "right", render: (r) => <Pill label={r.committed ? "Committed" : "Open"} tone={r.committed ? "ok" : "info"} /> },
  ];

  return (
    <AdminShell title="Migration console" sub="admin.tredi.app/migration" testID="sa17-migrations">
      <Panel pad={0} title="Legacy ingests" sub="Open a run to map fields, dry-run it and commit">
        {!d.data ? <Loading /> : <Table cols={cols} rows={d.data.rows} minWidth={720} onRowPress={(r) => router.push(`/admin/migration/${r.id}` as any)} empty="No migrations queued" />}
      </Panel>
      <Note tone="info" title="A script that runs once is not the deliverable">
        The mapping, the dry run and the conflict report are. Every run takes a snapshot first and stays reversible for 30 days.
      </Note>
    </AdminShell>
  );
}
