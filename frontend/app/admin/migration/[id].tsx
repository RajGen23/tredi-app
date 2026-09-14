// SA.17 Legacy data migration — upload, map, dry run, snapshot, commit. Opening
// balances are written as ledger entries dated the migration day.
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import {
  AdminShell, Btn, Col, Fig, Lbl, Loading, Note, Panel, Pill, Row, Sub, Table, useWide,
} from "@/src/admin/ui";
import { fonts, useTheme } from "@/src/theme";

const STEPS = ["Upload", "Map fields", "Dry run", "Snapshot", "Commit"];

export default function MigrationConsole() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { wide } = useWide();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const d = useQuery({ queryKey: ["admin-migration", id], queryFn: () => adminApi(`/migration/${id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-migration", id] }); qc.invalidateQueries({ queryKey: ["admin-migrations"] }); };

  const dry = useMutation({
    mutationFn: () => adminApi(`/migration/${id}/dry-run`, { method: "POST", json: {} }),
    onSuccess: (res: any) => { toast.show(res.message, "Dry run ·"); refresh(); },
    onError: (e: any) => toast.show(e.message),
  });
  const commit = useMutation({
    mutationFn: () => adminApi(`/migration/${id}/commit`, { method: "POST", json: {} }),
    onSuccess: (res: any) => { toast.show(res.message, "Imported ·"); refresh(); },
    onError: (e: any) => toast.show(e.message),
  });
  const map = useMutation({
    mutationFn: (body: { source: string; target: string }) => adminApi(`/migration/${id}/mapping`, { method: "PATCH", json: body }),
    onSuccess: () => refresh(),
  });

  const m = d.data;
  const mapCols: Col<any>[] = [
    { key: "source", label: "Source column", flex: 1.6, render: (r) => <Text style={{ fontFamily: fonts.mono, fontSize: 11.5, color: colors.onSurface }}>{r.source}</Text> },
    { key: "target", label: "Maps to", flex: 1.6, render: (r) => (
      r.target ? <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 11.5, color: colors.onSurface }}>{r.target}</Text>
        : <Sub>— not mapped</Sub>
    ) },
    { key: "ok", label: "", flex: 0.8, align: "right", render: (r) => (
      r.ok ? <Ionicons name="checkmark-circle" size={16} color={colors.green700} />
        : <Btn label="Skip?" onPress={() => map.mutate({ source: r.source, target: "" })} testID={`skip-${r.source}`} />
    ) },
  ];
  const conflictCols: Col<any>[] = [
    { key: "issue", label: "Issue", flex: 2.2, render: (r) => <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }} numberOfLines={2}>{r.issue}</Text> },
    { key: "rows", label: "Rows", flex: 0.6, align: "right", render: (r) => <Fig tone="neg">{r.rows}</Fig> },
    { key: "action", label: "Proposed action", flex: 1.6, align: "right", render: (r) => <Pill label={r.action} tone="info" /> },
  ];

  return (
    <AdminShell title="Migration console" sub={`admin.tredi.app/migration/${m?.tenant ?? ""}`}
      actions={<Row gap={8}>
        <Btn label="Back" icon="arrow-back" onPress={() => router.push("/admin/migration")} />
        <Pill label={m?.committed ? "Committed" : "Dry run · nothing written"} tone={m?.committed ? "ok" : "warn"} />
        <Btn label="Download report" icon="download-outline" />
        <Btn label="Commit import" tone="primary" busy={commit.isPending} disabled={m?.committed} onPress={() => commit.mutate()} testID="commit-import" />
      </Row>}
      testID="sa17-console">
      {!m ? <Loading /> : (
        <>
          <Row gap={7} wrapped>
            {STEPS.map((s, i) => (
              <Pill key={s} label={`${i + 1} · ${s}`} tone={m.step > i ? "ok" : m.step === i + 1 ? "info" : "mut"} />
            ))}
          </Row>
          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <Panel style={{ flex: 1.6 }} pad={0} title="Field mapping" sub={`${m.file} → ${m.target}`}>
              <Table cols={mapCols} rows={m.mappings.map((x: any, i: number) => ({ ...x, id: String(i) }))} minWidth={520} empty="Upload a file to map its columns" />
            </Panel>
            <View style={{ flex: 1, gap: 12 }}>
              <Panel title="Counts" sub="Read from the file, nothing written yet">
                {[["Rows read", m.rows_read], ["Will import", m.will_import], ["Need a decision", m.need_decision]].map(([k, v], i) => (
                  <Row key={k as string} style={{ justifyContent: "space-between", paddingVertical: 6 }}>
                    <Lbl>{k}</Lbl>
                    <Fig size={16} tone={i === 2 && Number(v) > 0 ? "neg" : undefined}>{Number(v).toLocaleString()}</Fig>
                  </Row>
                ))}
                <Btn label="Run dry run" icon="play-outline" style={{ marginTop: 8 }} busy={dry.isPending} onPress={() => dry.mutate()} testID="dry-run" />
              </Panel>
              <Note tone="info" title="Commit takes a snapshot first">
                And stays reversible for 30 days. Opening balances are written as ledger entries dated the migration day, not backdated, so historical reports stay truthful.
              </Note>
            </View>
          </View>
          <Panel pad={0} title="Conflict report" sub="These are the cases that get missed in estimates">
            <Table cols={conflictCols} rows={m.conflicts.map((x: any, i: number) => ({ ...x, id: String(i) }))} minWidth={620} empty="No conflicts — run the dry run first" />
          </Panel>
        </>
      )}
    </AdminShell>
  );
}
