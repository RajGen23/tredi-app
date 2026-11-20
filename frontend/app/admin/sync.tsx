// SA.13 Sync & offline monitor — this screen exists because offline-first is in
// the contract. Without it, "the app is not syncing" is unanswerable.
import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import {
  AdminShell, Btn, Col, Fig, Lbl, Loading, Metrics, Note, Panel, Pill, Row, Sub, Table, Tabs, useWide,
} from "@/src/admin/ui";
import { fonts, useTheme } from "@/src/theme";

export default function SyncMonitor() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState("stuck");
  const [picked, setPicked] = useState<string[]>([]);
  const d = useQuery({ queryKey: ["admin-sync", tab], queryFn: () => adminApi(`/sync?tab=${tab}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-sync"] }); qc.invalidateQueries({ queryKey: ["admin-overview"] }); };
  const replay = useMutation({
    mutationFn: (ids: string[]) => adminApi("/sync/replay", { method: "POST", json: { ids } }),
    onSuccess: (res: any) => { toast.show(res.message, "Replayed ·"); setPicked([]); refresh(); },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });
  const notify = useMutation({
    mutationFn: (id: string) => adminApi(`/sync/${id}/notify`, { method: "POST", json: {} }),
    onSuccess: (res: any) => toast.show(res.message, "Sent ·"),
  });

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const cols: Col<any>[] = [
    { key: "pick", label: "", w: 34, render: (r) => (
      <Btn label={picked.includes(r.id) ? "✓" : " "} tone={picked.includes(r.id) ? "primary" : "ghost"} onPress={() => toggle(r.id)} testID={`pick-${r.id}`} style={{ width: 30, paddingHorizontal: 0, height: 28 }} />
    ) },
    { key: "biz", label: "Business / device", flex: 2, render: (r) => (
      <View>
        <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.business}</Text>
        <Sub numberOfLines={1}>{r.os} · {r.device}</Sub>
      </View>
    ) },
    { key: "records", label: "Records", flex: 0.7, align: "right", render: (r) => <Fig>{r.records}</Fig> },
    { key: "oldest", label: "Oldest", flex: 0.8, align: "right", render: (r) => <Fig tone={r.oldest_hours > 24 ? "neg" : undefined}>{r.oldest_hours > 24 ? `${Math.round(r.oldest_hours / 24)} days` : `${r.oldest_hours} hours`}</Fig> },
    { key: "err", label: "Last error", flex: 2.4, render: (r) => <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.coral }} numberOfLines={2}>{r.last_error}</Text> },
    { key: "attempts", label: "Attempts", flex: 0.7, align: "right", render: (r) => <Fig>{r.attempts}</Fig> },
    { key: "act", label: "", flex: 1.1, align: "right", render: (r) => (
      r.last_error.includes("401")
        ? <Btn label="Notify user" onPress={() => notify.mutate(r.id)} testID={`notify-${r.id}`} />
        : <Btn label="Replay" onPress={() => replay.mutate([r.id])} testID={`replay-${r.id}`} />
    ) },
  ];

  return (
    <AdminShell title="Sync monitor" sub="TradaBooks admin · /sync"
      actions={<Row gap={8}>
        <Pill label={`${d.data?.stuck ?? 0} stuck`} tone="bad" />
        <Btn label={picked.length ? `Replay ${picked.length} selected` : "Replay all stuck"} tone="primary" icon="repeat-outline"
          busy={replay.isPending} onPress={() => replay.mutate(picked)} testID="replay-selected" />
      </Row>}
      testID="sa13-sync">
      {!d.data ? <Loading /> : (
        <>
          <Metrics items={d.data.metrics} />
          <Panel pad={0} title="Stuck queues" sub="Queues are per device, because a shop can have several"
            right={<Tabs items={[{ key: "stuck", label: "Stuck" }, { key: "conflict", label: "Conflicts" }, { key: "rejected", label: "Rejected" }]} value={tab} onChange={setTab} />}>
            <Table cols={cols} rows={d.data.rows} minWidth={1080} empty="Nothing in this state — queues are clear" />
          </Panel>
          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <Panel style={{ flex: 1 }} title="Conflict resolution rules" sub="Written down, not inferred">
              {d.data.rules.map((r: any) => (
                <Row key={r.kind} style={{ justifyContent: "space-between", paddingVertical: 6 }}>
                  <Lbl>{r.kind}</Lbl>
                  <Sub style={{ textAlign: "right", flexShrink: 1 }}>{r.rule}</Sub>
                </Row>
              ))}
            </Panel>
            <View style={{ flex: 1 }}>
              <Note tone="warn" title="Why the photo queue jams">
                {"Kano's device is holding 42 uncompressed bill photos on a 2G connection. Compression at capture fixes this at source; the replay tool clears the backlog for devices already on an older build."}
              </Note>
            </View>
          </View>
        </>
      )}
    </AdminShell>
  );
}
