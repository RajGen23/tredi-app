// SA.17 (list) — legacy ingests waiting for a decision. No ingest runs without a
// snapshot immediately before it.
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import { AdminShell, Btn, Col, Fig, Loading, Note, Panel, Pill, Sub, Table } from "@/src/admin/ui";
import { fonts, useTheme } from "@/src/theme";

const STEPS = ["Upload", "Map fields", "Dry run", "Snapshot", "Commit"];

/** Pulls the live tredibooks MySQL into this environment's database (read-only on MySQL). */
function LiveSync() {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const st = useQuery({
    queryKey: ["admin-legacy-sync"], queryFn: () => adminApi<any>("/legacy-sync"),
    refetchInterval: (q) => (q.state.data?.job?.status === "running" ? 4000 : false),
  });
  const start = useMutation({
    mutationFn: () => adminApi<any>("/legacy-sync", { method: "POST", json: {} }),
    onSuccess: (res) => { toast.show(res.message, "Sync ·"); qc.invalidateQueries({ queryKey: ["admin-legacy-sync"] }); },
    onError: (e: any) => toast.show(e.message),
  });
  const job = st.data?.job;
  const running = job?.status === "running";
  const summary = job?.log ? job.log.split("\n").filter((l: string) => /:(new|updated)\s/.test(l)).map((l: string) => l.trim().replace(/\s+/g, " ")).join("  ·  ") : "";
  return (
    <Panel title="Sync from live database" sub="Copies new and changed invoices, stock, customers and users from the live system. Never writes back to it."
      testID="legacy-sync-panel"
      right={<Btn label={running ? "Syncing…" : "Sync now"} tone="primary" icon="sync-outline" busy={running || start.isPending}
        disabled={running || !st.data?.configured} onPress={() => start.mutate()} testID="legacy-sync-start" />}>
      {!st.data ? <Loading /> : !st.data.configured ? (
        <Sub>The live database connection is not set up on this server.</Sub>
      ) : !job ? (
        <Sub>No sync has run here yet.</Sub>
      ) : (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Pill label={running ? "Running" : job.status === "done" ? "Done" : "Failed"} tone={running ? "info" : job.status === "done" ? "ok" : "bad"} />
            <Sub testID="legacy-sync-when">Started {dayjs(job.started_at).format("DD MMM YYYY, HH:mm")}{job.finished_at ? ` · finished ${dayjs(job.finished_at).format("HH:mm")}` : ""}</Sub>
          </View>
          {summary ? <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.onSurfaceSecondary }}>{summary}</Text> : null}
          {job.status === "failed" ? <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.coral }} numberOfLines={6}>{job.log.slice(-600)}</Text> : null}
        </View>
      )}
    </Panel>
  );
}

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
      <LiveSync />
      <Panel pad={0} title="Legacy ingests" sub="Open a run to map fields, dry-run it and commit">
        {!d.data ? <Loading /> : <Table cols={cols} rows={d.data.rows} minWidth={720} onRowPress={(r) => router.push(`/admin/migration/${r.id}` as any)} empty="No migrations queued" />}
      </Panel>
      <Note tone="info" title="A script that runs once is not the deliverable">
        The mapping, the dry run and the conflict report are. Every run takes a snapshot first and stays reversible for 30 days.
      </Note>
    </AdminShell>
  );
}
