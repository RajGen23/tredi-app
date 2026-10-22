// SA.10 Security monitor — rules rather than anomaly scoring, because a rule can
// be explained to a shop owner on the phone.
import { Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import {
  AdminShell, Btn, Col, Fig, Lbl, Loading, Metrics, Note, Panel, Pill, Row, Sub, Table, Tabs, useWide,
} from "@/src/admin/ui";
import { ago } from "@/src/admin/format";
import { fonts, useTheme } from "@/src/theme";

export default function Security() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const d = useQuery({ queryKey: ["admin-security"], queryFn: () => adminApi("/security") });
  const save = useMutation({
    mutationFn: (json: any) => adminApi("/security/policy", { method: "PATCH", json }),
    onSuccess: (res: any) => { toast.show(res.message ?? "Saved", "Policy ·"); qc.invalidateQueries({ queryKey: ["admin-security"] }); },
    onError: (e: any) => toast.show(e.message),
  });
  const p = d.data?.policy ?? {};

  const cols: Col<any>[] = [
    { key: "user", label: "User", flex: 1.6, render: (r) => (
      <View>
        <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.user}</Text>
        <Sub numberOfLines={1}>{r.business}</Sub>
      </View>
    ) },
    { key: "signal", label: "Signal", flex: 2.2, render: (r) => <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }} numberOfLines={2}>{r.signal}</Text> },
    { key: "where", label: "Where", flex: 1.2, render: (r) => <Sub numberOfLines={1}>{r.where}</Sub> },
    { key: "when", label: "When", flex: 0.8, align: "right", render: (r) => <Sub>{ago(r.when)} ago</Sub> },
    { key: "act", label: "", flex: 1, align: "right", render: (r) => (
      r.verdict === "lock" ? <Btn label="Unlock" onPress={() => router.push("/admin/users?tab=locked" as any)} testID={`signal-${r.id}`} />
        : r.verdict === "review" ? <Pill label="Review" tone="warn" />
        : <Pill label={r.verdict === "cleared" ? "Cleared" : "Expected"} tone="mut" />
    ) },
  ];

  const rowsPolicy: { key: string; label: string; value: string }[] = [
    { key: "idle_lock_min", label: "Lock app after idle", value: `${p.idle_lock_min} min` },
    { key: "failed_pins", label: "Failed PINs before lock", value: String(p.failed_pins) },
    { key: "admin_session_min", label: "Admin session timeout", value: `${p.admin_session_min} min` },
  ];

  return (
    <AdminShell title="Security" sub="TradaBooks admin · /security"
      actions={<Tabs items={[{ key: "monitor", label: "Monitor" }, { key: "audit", label: "Audit log" }]} value="monitor"
        onChange={(k) => k === "audit" && router.push("/admin/security/audit")} />}
      testID="sa10-security">
      {!d.data ? <Loading /> : (
        <>
          <Metrics items={d.data.metrics} />
          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <Panel style={{ flex: 2.2 }} pad={0} title="Flagged sign-in activity" sub="Rules, not machine learning">
              <Table cols={cols} rows={d.data.signals} minWidth={820} />
            </Panel>
            <Panel style={{ flex: 1 }} title="Session policy" sub="Applies to every tenant">
              {rowsPolicy.map((r) => (
                <Row key={r.key} style={{ justifyContent: "space-between", paddingVertical: 6 }}>
                  <Lbl>{r.label}</Lbl>
                  <Row gap={6}>
                    <Fig>{r.value}</Fig>
                    <Btn label="+" onPress={() => save.mutate({ [r.key]: (Number(String(r.value).replace(/\D/g, "")) || 0) + 1 })} testID={`bump-${r.key}`} />
                  </Row>
                </Row>
              ))}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
              <Row style={{ justifyContent: "space-between", paddingVertical: 4 }}>
                <Lbl>Force 2FA for admins</Lbl>
                <Switch value={!!p.force_2fa} onValueChange={(v) => save.mutate({ force_2fa: v })} testID="switch-2fa"
                  trackColor={{ true: colors.brandPrimary, false: colors.switchOff }} />
              </Row>
              <Row style={{ justifyContent: "space-between", paddingVertical: 4 }}>
                <Lbl>Owner sees admin reads</Lbl>
                <Switch value disabled trackColor={{ true: colors.brandPrimary, false: colors.switchOff }} />
              </Row>
              <Sub style={{ marginTop: 8 }}>The last switch cannot be turned off from this screen. Changing it requires a signed release.</Sub>
            </Panel>
          </View>
          <Note tone="info" title="“Signed into three tenants in ten minutes” is normal for an accountant">
            So it is marked expected instead of alarming. Every rule on this screen can be read out loud to a shop owner.
          </Note>
        </>
      )}
    </AdminShell>
  );
}
