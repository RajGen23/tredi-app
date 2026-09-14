// SA.4 Business detail — one tenant, one page. The right rail carries the
// commercial facts and the destructive actions, away from the reading area.
import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import {
  AdminModal, AdminShell, Avatar, Btn, Col, Fig, H2, Input, Lbl, Loading, MiniTrend, PLAN_TONE, Panel, Pill, Row,
  STATUS_LABEL, STATUS_TONE, Sub, Table, TenantTabs, useWide,
} from "@/src/admin/ui";
import { ago, compactMoney, dayMonth } from "@/src/admin/format";
import { money } from "@/src/format";
import { fonts, useTheme } from "@/src/theme";

type Action = "suspend" | "unsuspend" | "force_sync" | "schedule_deletion" | "cancel_deletion";
const NEEDS_REASON: Action[] = ["suspend", "schedule_deletion"];
const TITLES: Record<Action, string> = {
  suspend: "Suspend writes",
  unsuspend: "Restore writes",
  force_sync: "Force sync",
  schedule_deletion: "Schedule deletion",
  cancel_deletion: "Cancel deletion",
};

export default function BusinessDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { wide } = useWide();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [act, setAct] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportReason, setSupportReason] = useState("");

  const d = useQuery({ queryKey: ["admin-business", id], queryFn: () => adminApi(`/businesses/${id}`) });
  const run = useMutation({
    mutationFn: (body: { action: Action; reason: string }) => adminApi(`/businesses/${id}/action`, { method: "POST", json: body }),
    onSuccess: (res: any) => {
      toast.show(res.message, "Logged ·");
      setAct(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin-business", id] });
      qc.invalidateQueries({ queryKey: ["admin-businesses"] });
    },
    onError: (e: any) => toast.show(e.message),
  });
  const requestAccess = useMutation({
    mutationFn: () => adminApi("/support/request", { method: "POST", json: { tenant_id: id, reason: supportReason, scope: "Invoices only" } }),
    onSuccess: (res: any) => { toast.show(res.message, "Consent ·"); setSupportOpen(false); setSupportReason(""); },
    onError: (e: any) => toast.show(e.message),
  });

  const t = d.data;
  const cols: Col<any>[] = [
    { key: "event", label: "Recent platform events", flex: 2.6, render: (r) => (
      <View>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }} numberOfLines={1}>{r.event}</Text>
        {r.entity ? <Sub numberOfLines={1}>{r.entity}</Sub> : null}
      </View>
    ) },
    { key: "actor", label: "Actor", flex: 1.1, render: (r) => <Sub numberOfLines={1}>{r.actor}</Sub> },
    { key: "shop", label: "Shop", flex: 1, render: (r) => <Sub numberOfLines={1}>{r.shop || "—"}</Sub> },
    { key: "when", label: "When", flex: 0.8, align: "right", render: (r) => <Sub>{ago(r.when)} ago</Sub> },
  ];

  return (
    <AdminShell title={t?.name ?? "Business"} sub={`admin.tredi.app/businesses/${t?.slug ?? ""}`}
      actions={
        <Row gap={8}>
          <Btn label="Back" icon="arrow-back" onPress={() => router.push("/admin/businesses")} />
          <Btn label="Request support access" icon="help-buoy-outline" onPress={() => setSupportOpen(true)} testID="request-access" />
          <Btn label="Manage subscription" tone="primary" onPress={() => router.push("/admin/subscriptions")} />
        </Row>
      }
      testID="sa4-business">
      {!t ? <Loading /> : (
        <>
          <Row gap={8} wrapped>
            <Pill label={STATUS_LABEL[t.status] ?? t.status} tone={STATUS_TONE[t.status] ?? "mut"} />
            <Pill label={t.plan.toUpperCase()} tone={PLAN_TONE[t.plan] ?? "mut"} />
            {t.suspended ? <Pill label="Writes suspended" tone="bad" /> : null}
            {t.deletion_at ? <Pill label={`Deletion ${dayMonth(t.deletion_at)}`} tone="bad" /> : null}
          </Row>
          <TenantTabs id={String(id)} active="overview" />
          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <View style={{ flex: 2.4, gap: 12 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {[
                  { label: "30-day sales", value: compactMoney(t.sales_30d), delta: `▲ ${t.sales_change_pct}%`, tone: "pos" },
                  { label: "Invoices", value: String(t.invoices), delta: `${t.invoices_overdue} overdue`, tone: t.invoices_overdue ? "neg" : "" },
                  { label: "Receivables", value: compactMoney(t.receivables), delta: "held by tenant" },
                  { label: "Records", value: t.records.toLocaleString(), delta: "rows across 24 tables" },
                ].map((m) => (
                  <View key={m.label} style={{ flexGrow: 1, flexBasis: 160, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 13, backgroundColor: colors.surfaceSecondary }}>
                    <Lbl numberOfLines={1}>{m.label}</Lbl>
                    <Fig size={19} style={{ marginTop: 5 }} numberOfLines={1}>{m.value}</Fig>
                    <Sub style={{ marginTop: 2, color: m.tone === "pos" ? colors.green700 : m.tone === "neg" ? colors.coral : colors.ink60 }}>{m.delta}</Sub>
                  </View>
                ))}
              </View>
              <Panel title="Usage over time" sub="Invoices raised per week">
                <MiniTrendRow values={t.usage} />
              </Panel>
              <Panel pad={0} testID="tenant-events">
                <Table cols={cols} rows={t.events} minWidth={760} empty="No platform events for this tenant yet" />
              </Panel>
            </View>

            <View style={{ flex: 1, gap: 12 }}>
              <Panel title="Owner">
                <Row gap={10}>
                  <Avatar text={(t.owner?.name ?? "").split(" ").map((w: string) => w[0]).slice(0, 2).join("")} tone="deep" />
                  <View style={{ flexShrink: 1 }}>
                    <H2 numberOfLines={1}>{t.owner?.name}</H2>
                    <Sub numberOfLines={1}>{t.owner?.phone}</Sub>
                  </View>
                </Row>
                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }} />
                {[["Plan", t.plan === "pro" ? "Pro" : t.plan === "basic" ? "Basic" : t.plan === "trial" ? "Trial" : "Lapsed"],
                  ["Renews", dayMonth(t.plan_expires)],
                  ["Since", dayMonth(t.since)],
                  ["Region", `${t.region} · ${t.currency === "NGN" ? "₦" : t.currency}`],
                  ["Storage", `${t.storage_used_gb} / ${t.storage_limit_gb} GB`],
                  ["Receivables", money(t.receivables)]].map(([k, v]) => (
                  <Row key={k as string} style={{ justifyContent: "space-between", paddingVertical: 5 }}>
                    <Lbl>{k}</Lbl>
                    <Fig>{v}</Fig>
                  </Row>
                ))}
              </Panel>
              <Panel title="Danger zone" sub="Deletion needs a second admin and holds for 30 days." style={{ borderColor: colors.coral }}>
                <View style={{ gap: 8 }}>
                  {!t.suspended
                    ? <Btn label="Suspend writes" tone="danger" icon="hand-left-outline" onPress={() => setAct("suspend")} testID="act-suspend" />
                    : <Btn label="Restore writes" tone="primary" icon="refresh-outline" onPress={() => setAct("unsuspend")} testID="act-unsuspend" />}
                  <Btn label="Force sync" icon="sync-outline" onPress={() => setAct("force_sync")} testID="act-force-sync" />
                  {!t.deletion_at
                    ? <Btn label="Schedule deletion" tone="danger" icon="trash-outline" onPress={() => setAct("schedule_deletion")} testID="act-delete" />
                    : <Btn label="Cancel deletion" icon="close-outline" onPress={() => setAct("cancel_deletion")} testID="act-cancel-delete" />}
                </View>
                <Sub style={{ marginTop: 10 }}>Suspension is reversible and read-only for the tenant — their data stays, they just cannot write.</Sub>
              </Panel>
            </View>
          </View>

          <AdminModal visible={!!act} onClose={() => setAct(null)} title={act ? TITLES[act] : ""}
            sub={act && NEEDS_REASON.includes(act) ? "The reason is written to the tenant's own history, in these words." : "This action is logged against your name."}
            testID="action-modal"
            footer={<Row gap={8}>
              <Btn label="Cancel" onPress={() => setAct(null)} />
              <Btn label={act ? TITLES[act] : ""} tone={act && NEEDS_REASON.includes(act) ? "danger" : "primary"} busy={run.isPending}
                onPress={() => act && run.mutate({ action: act, reason })} testID="action-confirm" />
            </Row>}>
            {act && NEEDS_REASON.includes(act)
              ? <Input value={reason} onChangeText={setReason} placeholder="Why is this needed?" testID="action-reason" multiline />
              : <Sub>{act === "force_sync" ? "Queued records on every device in this business will be retried now." : "Writes resume immediately."}</Sub>}
          </AdminModal>

          <AdminModal visible={supportOpen} onClose={() => setSupportOpen(false)} title="Request support access"
            sub="Read-only, time-boxed, and the owner must approve. They see this reason."
            testID="support-modal"
            footer={<Row gap={8}>
              <Btn label="Cancel" onPress={() => setSupportOpen(false)} />
              <Btn label="Send request" tone="primary" busy={requestAccess.isPending} onPress={() => requestAccess.mutate()} testID="support-send" />
            </Row>}>
            <Input value={supportReason} onChangeText={setSupportReason} placeholder="e.g. Invoice PDF will not open" multiline testID="support-reason" />
          </AdminModal>
        </>
      )}
    </AdminShell>
  );
}

function MiniTrendRow({ values }: { values: number[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 110 }}>
        {values.map((v, i) => (
          <View key={i} style={{ flex: 1, height: `${Math.max(6, (v / max) * 100)}%`, backgroundColor: i === values.length - 1 ? colors.brandPrimary : colors.mint2, borderTopLeftRadius: 5, borderTopRightRadius: 5 }} />
        ))}
      </View>
      <Row style={{ justifyContent: "space-between", marginTop: 6 }}>
        {["8 weeks ago", "6", "4", "2", "This week"].map((l) => <Sub key={l} style={{ fontSize: 9.5 }}>{l}</Sub>)}
      </Row>
      <Row style={{ marginTop: 10 }} gap={8}>
        <MiniTrend values={values} />
        <Sub>Peak {Math.max(...values)} invoices in a week</Sub>
      </Row>
    </View>
  );
}
