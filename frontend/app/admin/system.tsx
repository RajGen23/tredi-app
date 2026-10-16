// SA.14 System health & error logs — the log is styled as a terminal because
// that is what an engineer expects to scan; the amber card translates it.
import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import { AdminShell, Btn, Fig, Lbl, Loading, Metrics, Note, Panel, Pill, Row, Sub, Tabs, useWide } from "@/src/admin/ui";
import { stamp } from "@/src/admin/format";
import { fonts, radius, useTheme } from "@/src/theme";

export default function SystemHealth() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const [tab, setTab] = useState("all");
  const d = useQuery({ queryKey: ["admin-system", tab], queryFn: () => adminApi(`/system?tab=${tab}`), refetchInterval: 30000 });

  const qc = useQueryClient();
  const toast = useToast();
  const incident = useMutation({
    mutationFn: () => adminApi("/system/incident", { method: "POST", json: {} }),
    onSuccess: (res: any) => { toast.show(res.message, "Incident ·"); qc.invalidateQueries({ queryKey: ["admin-system"] }); },
    onError: (e: any) => toast.show(e.message),
  });

  const tone = (l: string) => (l === "ERR" ? colors.coralSoft : l === "WRN" ? "#E8C67A" : "#8FD8BE");

  return (
    <AdminShell title="System health" sub="admin.tredi.app/system"
      actions={<Row gap={8}><Pill label={d.data?.incident?.open ? "Incident open" : "All services up"} tone={d.data?.incident?.open ? "warn" : "ok"} /><Sub>Updated 30s ago</Sub></Row>} testID="sa14-system">
      {!d.data ? <Loading /> : (
        <>
          <Metrics items={d.data.metrics} />
          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <Panel style={{ flex: 1 }} title="Services" sub="Rolling 30-day uptime">
              {d.data.services.map((s: any) => (
                <Row key={s.name} style={{ justifyContent: "space-between", paddingVertical: 7 }}>
                  <Row gap={8}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.uptime >= 99.5 ? colors.brandPrimary : colors.amber }} />
                    <Lbl>{s.name}</Lbl>
                  </Row>
                  <Fig tone={s.uptime >= 99.5 ? undefined : "neg"}>{s.uptime.toFixed(2)}%</Fig>
                </Row>
              ))}
            </Panel>
            <View style={{ flex: 2, gap: 12 }}>
              <Panel pad={0} title="Error log"
                right={<Tabs items={[{ key: "all", label: "All" }, { key: "5xx", label: "5xx" }, { key: "sync", label: "Sync" }]} value={tab} onChange={setTab} />}>
                <View style={{ margin: 14, backgroundColor: colors.deep900, borderRadius: radius.md, padding: 12, gap: 6 }} testID="error-terminal">
                  {d.data.logs.map((l: any, i: number) => (
                    <Text key={i} style={{ fontFamily: fonts.mono, fontSize: 10.5, color: "rgba(255,255,255,0.8)" }} numberOfLines={2}>
                      <Text style={{ color: tone(l.level), fontFamily: fonts.monoSemibold }}>{l.level} </Text>
                      {stamp(l.ts)}  <Text style={{ color: "#FFFFFF", fontFamily: fonts.monoSemibold }}>{l.service}</Text>  {l.message}
                    </Text>
                  ))}
                </View>
              </Panel>
              <Note tone="warn" title={d.data.incident.title} action={<Btn label={d.data.incident.open ? "Resolve incident" : "Open incident"} tone={d.data.incident.open ? "primary" : "ghost"}
                busy={incident.isPending} onPress={() => incident.mutate()} testID="incident-toggle" />}>
                {d.data.incident.note}
              </Note>
            </View>
          </View>
        </>
      )}
    </AdminShell>
  );
}
