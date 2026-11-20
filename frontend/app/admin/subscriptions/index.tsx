// SA.6 Subscriptions & renewals — real businesses. Renew straight from the row
// when a client pays directly; plan requests from the app sit on top.
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import { AdminModal, AdminShell, Btn, Col, Fig, Input, Lbl, Loading, Note, Panel, Pill, Row, SUB_LABEL, SUB_TONE, Sub, Table, Tabs } from "@/src/admin/ui";
import { dayMonth } from "@/src/admin/format";
import { money } from "@/src/format";
import { fonts, useTheme } from "@/src/theme";

const MONTHS = [1, 3, 6, 12];
const priceFor = (p: any, m: number) => (m === 3 ? p.prices.quarterly : m === 12 ? p.prices.yearly : p.prices.monthly * m);

export default function Subscriptions() {
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState("7");
  const [renew, setRenew] = useState<any>(null);
  const [plan, setPlan] = useState("premium");
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [decline, setDecline] = useState<any>(null);
  const [why, setWhy] = useState("");
  const d = useQuery({ queryKey: ["admin-subscriptions", tab], queryFn: () => adminApi(`/subscriptions?tab=${tab}`) });
  const reqs = useQuery({ queryKey: ["admin-plan-requests"], queryFn: () => adminApi("/plan-requests") });
  const catalogue: any[] = d.data?.catalogue ?? [];

  const invalidate = () => {
    ["admin-subscriptions", "admin-overview", "admin-businesses", "admin-plan-requests"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  const pick = (k: string, m: number) => {
    setPlan(k);
    setMonths(m);
    const p = catalogue.find((x) => x.key === k);
    if (p) setAmount(String(priceFor(p, m)));
  };
  const openRenew = (r: any) => {
    setRenew(r);
    setReference("");
    pick(catalogue.some((p) => p.key === r.plan) ? r.plan : "premium", 1);
  };
  const run = useMutation({
    mutationFn: () => adminApi(`/customers/${renew.id}/activate`, { method: "POST",
      json: { plan, months, amount: Number(amount) || 0, reference, extend: true } }),
    onSuccess: (res: any) => { toast.show(res.message, "Renewed ·"); setRenew(null); invalidate(); },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });
  const approve = useMutation({
    mutationFn: (r: any) => adminApi(`/plan-requests/${r.id}/approve`, { method: "POST", json: { months: 1 } }),
    onSuccess: (res: any) => { toast.show(res.message, "Activated ·"); invalidate(); },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });
  const refuse = useMutation({
    mutationFn: () => adminApi(`/plan-requests/${decline.id}/decline`, { method: "POST", json: { note: why } }),
    onSuccess: (res: any) => { toast.show(res.message, "Closed ·"); setDecline(null); setWhy(""); invalidate(); },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
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
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.name || "Unnamed business"}</Text>
        <Sub numberOfLines={1}>{r.owner} · {r.phone || r.email || "no contact"}</Sub>
      </View>
    ) },
    { key: "plan", label: "Plan", flex: 1, render: (r) => <Sub>{r.plan_name}</Sub> },
    { key: "status", label: "Status", flex: 0.8, render: (r) => <Pill label={SUB_LABEL[r.status] ?? r.status} tone={SUB_TONE[r.status]} /> },
    { key: "amount", label: "Price", flex: 0.9, align: "right", render: (r) => <Fig>{r.price ? money(r.price) : "—"}</Fig> },
    { key: "ends", label: "Ends", flex: 1.1, align: "right", render: (r) => (
      <View style={{ alignItems: "flex-end" }}>
        <Fig tone={r.status === "expired" || (r.days_left ?? 99) <= 3 ? "neg" : undefined}>{dayMonth(r.ends_at)}</Fig>
        <Sub style={{ fontSize: 10.5 }}>{r.status === "expired" ? "lapsed" : `${r.days_left}d left`}</Sub>
      </View>
    ) },
    { key: "act", label: "", flex: 1.2, align: "right", render: (r) => (
      <Row gap={6}>
        <Btn label="Open" onPress={() => router.push(`/admin/businesses/${r.id}` as any)} testID={`open-${r.id}`} />
        <Btn label={r.status === "trialing" ? "Activate" : "Renew"} tone="primary" onPress={() => openRenew(r)} testID={`renew-${r.id}`} />
      </Row>
    ) },
  ];

  return (
    <AdminShell title="Subscriptions" sub="Renewals for real businesses · record direct payments here"
      actions={<Btn label="Plans & pricing" tone="primary" onPress={() => router.push("/admin/subscriptions/plans")} />}
      testID="sa6-subscriptions">
      {!d.data ? <Loading /> : (
        <>
          <MetricsRow items={d.data.metrics} />
          {(reqs.data?.count ?? 0) > 0 ? (
            <Panel pad={0} title="Plan requests from the app" sub="A shop owner tapped a plan — activating it changes their live limits"
              testID="plan-requests">
              <Table cols={reqCols} rows={reqs.data.rows} minWidth={900} empty="Nothing waiting" />
            </Panel>
          ) : null}
          <Panel pad={0} title="Renewal queue" sub="Lapsed businesses can read their books but not save until renewed"
            right={<Tabs items={[{ key: "7", label: "Next 7 days" }, { key: "30", label: "30 days" }, { key: "lapsed", label: "Lapsed" },
              { key: "trial", label: "On trial" }, { key: "paying", label: "All paying" }]} value={tab} onChange={setTab} />}>
            <Table cols={cols} rows={d.data.rows} minWidth={1000} empty="Nothing in this window" testID="renewal-table" />
          </Panel>
          <Note tone="info" title="Paid you directly?">
            Tap Renew, pick the plan and months, and enter the amount and payment reference. It is logged in the business&apos;s plan history and the owner sees it in their Activity.
          </Note>

          <AdminModal visible={!!renew} onClose={() => setRenew(null)} title={`Renew ${renew?.name ?? ""}`}
            sub="Starts today, or after the time left on the same plan." testID="renew-modal"
            footer={<Row gap={8}>
              <Btn label="Cancel" onPress={() => setRenew(null)} />
              <Btn label="Activate" tone="primary" busy={run.isPending} onPress={() => run.mutate()} testID="renew-confirm" />
            </Row>}>
            <Lbl>Plan</Lbl>
            <Row gap={6} wrapped style={{ marginTop: 6, marginBottom: 10 }}>
              {catalogue.map((p) => <Btn key={p.key} label={p.name} tone={plan === p.key ? "deep" : "ghost"} onPress={() => pick(p.key, months)} testID={`renew-plan-${p.key}`} />)}
            </Row>
            <Lbl>How long</Lbl>
            <Row gap={6} wrapped style={{ marginTop: 6, marginBottom: 10 }}>
              {MONTHS.map((m) => <Btn key={m} label={`${m} mo`} tone={months === m ? "deep" : "ghost"} onPress={() => pick(plan, m)} testID={`renew-months-${m}`} />)}
            </Row>
            <Row gap={8}>
              <View style={{ flex: 1, gap: 6 }}>
                <Lbl>Amount received (₦)</Lbl>
                <Input value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ""))} keyboardType="numeric" testID="renew-amount" />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Lbl>Payment reference</Lbl>
                <Input value={reference} onChangeText={setReference} placeholder="Transfer ref" testID="renew-reference" />
              </View>
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
