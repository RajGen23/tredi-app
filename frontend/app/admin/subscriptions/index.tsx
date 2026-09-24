// SA.6 Subscriptions & renewals — reminder history sits on the row so nobody
// chases a business that has already had three messages this week.
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import {
  AdminModal, AdminShell, Avatar, Btn, Col, Fig, Input, Loading, Note, PLAN_TONE, Panel, Pill, Row, Sub, Table, Tabs,
} from "@/src/admin/ui";
import { expiryLabel } from "@/src/admin/format";
import { money } from "@/src/format";
import { fonts, useTheme } from "@/src/theme";

export default function Subscriptions() {
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState("7");
  const [extend, setExtend] = useState<any>(null);
  const [days, setDays] = useState("30");
  const [decline, setDecline] = useState<any>(null);
  const [why, setWhy] = useState("");
  const d = useQuery({ queryKey: ["admin-subscriptions", tab], queryFn: () => adminApi(`/subscriptions?tab=${tab}`) });
  const reqs = useQuery({ queryKey: ["admin-plan-requests"], queryFn: () => adminApi("/plan-requests") });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  };
  const run = useMutation({
    mutationFn: () => adminApi(`/subscriptions/${extend.id}/extend`, { method: "POST", json: { days: Number(days) || 30 } }),
    onSuccess: (res: any) => { toast.show(res.message, "Renewed ·"); setExtend(null); invalidate(); },
    onError: (e: any) => toast.show(e.message),
  });
  const approve = useMutation({
    mutationFn: (r: any) => adminApi(`/plan-requests/${r.id}/approve`, { method: "POST", json: { months: 1 } }),
    onSuccess: (res: any) => { toast.show(res.message, "Activated ·"); qc.invalidateQueries({ queryKey: ["admin-plan-requests"] }); },
    onError: (e: any) => toast.show(e.message),
  });
  const refuse = useMutation({
    mutationFn: () => adminApi(`/plan-requests/${decline.id}/decline`, { method: "POST", json: { note: why } }),
    onSuccess: (res: any) => { toast.show(res.message, "Closed ·"); setDecline(null); setWhy(""); qc.invalidateQueries({ queryKey: ["admin-plan-requests"] }); },
    onError: (e: any) => toast.show(e.message),
  });
  const batch = useMutation({
    mutationFn: () => adminApi("/subscriptions/reminders", { method: "POST", json: {} }),
    onSuccess: (res: any) => { toast.show(res.message, "Sent ·"); invalidate(); },
  });

  const reqCols: Col<any>[] = [
    { key: "biz", label: "Business", flex: 2, render: (r) => (
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.business}</Text>
        <Sub numberOfLines={1}>asked by {r.by || "owner"} · {r.days_waiting}d waiting</Sub>
      </View>
    ) },
    { key: "from", label: "Now on", flex: 0.9, render: (r) => <Sub>{r.current_plan}</Sub> },
    { key: "want", label: "Wants", flex: 0.9, render: (r) => <Pill label={r.plan_name} tone="ok" /> },
    { key: "amt", label: "Per month", flex: 1, align: "right", render: (r) => <Fig>{money(r.amount)}</Fig> },
    { key: "act", label: "", flex: 1.4, align: "right", render: (r) => (
      <Row gap={6}>
        <Btn label="Decline" onPress={() => { setDecline(r); setWhy(""); }} testID={`decline-${r.id}`} />
        <Btn label="Activate 1 month" tone="primary" busy={approve.isPending} onPress={() => approve.mutate(r)} testID={`approve-${r.id}`} />
      </Row>
    ) },
  ];

  const cols: Col<any>[] = [
    { key: "biz", label: "Business", flex: 2.2, render: (r) => (
      <Row gap={9}>
        <Avatar text={r.initials} />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.name}</Text>
          <Sub numberOfLines={1}>{r.shops} shop{r.shops === 1 ? "" : "s"} · {r.users} users</Sub>
        </View>
      </Row>
    ) },
    { key: "plan", label: "Plan", flex: 0.9, render: (r) => <Pill label={r.plan === "pro" ? "Pro" : r.plan === "basic" ? "Basic" : r.plan === "trial" ? "Trial" : "Lapsed"} tone={PLAN_TONE[r.plan] ?? "mut"} /> },
    { key: "amount", label: "Amount", flex: 1, align: "right", render: (r) => <Fig>{r.plan_amount ? money(r.plan_amount) : "—"}</Fig> },
    { key: "expires", label: "Expires", flex: 1, align: "right", render: (r) => <Fig tone={r.days_to_expiry <= 3 ? "neg" : undefined}>{expiryLabel(r.days_to_expiry)}</Fig> },
    { key: "reminders", label: "Reminders sent", flex: 1.2, render: (r) => (
      <Row gap={6}>
        {r.reminders.length === 0 ? <Sub>None</Sub> : r.reminders.map((x: string) => <Pill key={x} label={`${x} ✓`} tone="ok" />)}
      </Row>
    ) },
    { key: "auto", label: "Auto-renew", flex: 0.9, align: "right", render: (r) => <Pill label={r.auto_renew ? "On" : "Off"} tone={r.auto_renew ? "ok" : "mut"} /> },
    { key: "act", label: "", flex: 0.9, align: "right", render: (r) => (
      <Btn label={r.plan === "trial" ? "Convert" : "Extend"} onPress={() => { setExtend(r); setDays("30"); }} testID={`extend-${r.id}`} />
    ) },
  ];

  return (
    <AdminShell title="Subscriptions" sub="admin.tredi.app/subscriptions"
      actions={<Row gap={8}>
        <Btn label="Send renewal batch" icon="send-outline" busy={batch.isPending} onPress={() => batch.mutate()} testID="reminder-batch" />
        <Btn label="Plans & pricing" tone="primary" onPress={() => router.push("/admin/subscriptions/plans")} />
      </Row>}
      testID="sa6-subscriptions">
      {!d.data ? <Loading /> : (
        <>
          <Row gap={10} wrapped>
            <View style={{ flex: 1, minWidth: 280 }}><MetricsRow items={d.data.metrics} /></View>
          </Row>
          {(reqs.data?.count ?? 0) > 0 ? (
            <Panel pad={0} title="Plan requests from the app" sub="A shop owner tapped a plan — activating it changes their live limits"
              testID="plan-requests">
              <Table cols={reqCols} rows={reqs.data.rows} minWidth={900} empty="Nothing waiting" />
            </Panel>
          ) : null}
          <Panel pad={0} title="Renewal queue" sub="Grace period: 14 days after expiry"
            right={<Tabs items={[{ key: "7", label: "Next 7 days" }, { key: "30", label: "30 days" }, { key: "lapsed", label: "Lapsed" }]} value={tab} onChange={setTab} />}>
            <Table cols={cols} rows={d.data.rows} minWidth={1000} empty="Nothing due in this window" />
          </Panel>
          <Note tone="info" title={`Grace period: ${d.data.grace_days} days after expiry`}>
            During grace the tenant keeps full access and sees an in-app banner. After that, writes stop and the app goes read-only — data is never removed.
          </Note>

          <AdminModal visible={!!extend} onClose={() => setExtend(null)} title={`Extend ${extend?.name ?? ""}`}
            sub="Recording a payment here moves the expiry date and clears the risk flag."
            testID="extend-modal"
            footer={<Row gap={8}>
              <Btn label="Cancel" onPress={() => setExtend(null)} />
              <Btn label="Extend" tone="primary" busy={run.isPending} onPress={() => run.mutate()} testID="extend-confirm" />
            </Row>}>
            <Row gap={8}>
              <Input value={days} onChangeText={setDays} placeholder="Days" keyboardType="numeric" width={110} testID="extend-days" />
              <Sub>days from today or from the current expiry, whichever is later.</Sub>
            </Row>
          </AdminModal>

          <AdminModal visible={!!decline} onClose={() => setDecline(null)} title={`Decline ${decline?.business ?? ""}`}
            sub="The owner is told why, so say something they can act on." testID="decline-modal"
            footer={<Row gap={8}>
              <Btn label="Cancel" onPress={() => setDecline(null)} />
              <Btn label="Decline request" tone="primary" busy={refuse.isPending} onPress={() => refuse.mutate()} testID="decline-confirm" />
            </Row>}>
            <Input value={why} onChangeText={setWhy} placeholder="Reason" testID="decline-why" />
          </AdminModal>
        </>
      )}
    </AdminShell>
  );
}

function MetricsRow({ items }: { items: any[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {items.map((m) => (
        <View key={m.label} style={{ flexGrow: 1, flexBasis: 170, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 13, backgroundColor: colors.surfaceSecondary }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: colors.ink40 }}>{m.label}</Text>
          <Fig size={19} style={{ marginTop: 5 }} numberOfLines={1}>{m.value}</Fig>
          <Sub style={{ marginTop: 2 }}>{m.delta}</Sub>
        </View>
      ))}
    </View>
  );
}
