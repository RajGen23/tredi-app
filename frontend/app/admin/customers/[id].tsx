// One real customer: activate a plan they paid for directly, tailor a plan for
// them, and see when each person on the account was last active.
import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import { AdminModal, AdminShell, Btn, Col, Fig, Input, Lbl, Loading, Note, Panel, Pill, Row, SUB_LABEL, SUB_TONE, Sub, Table, useWide } from "@/src/admin/ui";
import { dayMonth, seenLabel } from "@/src/admin/format";
import { money } from "@/src/format";
import { fonts, useTheme } from "@/src/theme";

const MONTHS = [1, 3, 6, 12];
const LIMITS = ["businesses", "shops", "users", "invoices"];

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { wide } = useWide();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const d = useQuery({ queryKey: ["admin-customer", id], queryFn: () => adminApi(`/customers/${id}`) });
  const c = d.data;

  // Activate
  const [plan, setPlan] = useState("premium");
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  // Custom
  const [cName, setCName] = useState("");
  const [cPrice, setCPrice] = useState("");
  const [cLimits, setCLimits] = useState<Record<string, string>>({});
  const [cFeatures, setCFeatures] = useState<Record<string, boolean>>({});
  const [ending, setEnding] = useState(false);

  const base = c?.catalogue.find((p: any) => p.key === plan);
  const priceFor = (p: any, m: number) => (m === 3 ? p.prices.quarterly : m === 12 ? p.prices.yearly : p.prices.monthly * m);

  useEffect(() => {
    if (!c) return;
    const k = c.catalogue.some((p: any) => p.key === c.plan) ? c.plan : "premium";
    setPlan(k);
    const cp = c.custom_plan;
    const sub = c.subscription;
    setCName(cp?.name ?? "");
    setCPrice(cp?.price != null ? String(cp.price) : "");
    setCLimits(Object.fromEntries(LIMITS.map((l) => [l, sub.limits[l] == null ? "" : String(sub.limits[l])])));
    setCFeatures({ ...sub.features });
  }, [c]);
  useEffect(() => { if (base) setAmount(String(priceFor(base, months))); }, [plan, months, base]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-customer", id] });
    qc.invalidateQueries({ queryKey: ["admin-customers"] });
  };
  const activate = useMutation({
    mutationFn: () => adminApi(`/customers/${id}/activate`, { method: "POST",
      json: { plan, months, amount: Number(amount) || 0, reference, note, extend: true } }),
    onSuccess: (res: any) => { toast.show(res.message, "Activated ·"); setConfirm(false); setReference(""); setNote(""); refresh(); },
    onError: (e: any) => toast.show(e.message),
  });
  const saveCustom = useMutation({
    mutationFn: () => {
      // Only what differs from their own plan is an override; the rest follows the plan.
      const own = c.catalogue.find((p: any) => p.key === c.plan);
      const limits = Object.fromEntries(LIMITS.map((l) => [l, cLimits[l] === "" ? null : Number(cLimits[l])])
        .filter(([l, v]) => !own || own.limits[l as string] !== v));
      const features = Object.fromEntries(Object.entries(cFeatures).filter(([f, v]) => !own || !!own.features[f] !== v));
      return adminApi(`/customers/${id}/custom-plan`, { method: "PUT", json: {
        name: cName, price: cPrice === "" ? null : Number(cPrice), limits, features } });
    },
    onSuccess: (res: any) => { toast.show(res.message, "Saved ·"); refresh(); },
    onError: (e: any) => toast.show(e.message),
  });
  const clearCustom = useMutation({
    mutationFn: () => adminApi(`/customers/${id}/custom-plan`, { method: "DELETE" }),
    onSuccess: (res: any) => { toast.show(res.message, "Removed ·"); refresh(); },
    onError: (e: any) => toast.show(e.message),
  });
  const endPlan = useMutation({
    mutationFn: () => adminApi(`/customers/${id}/end-plan`, { method: "POST", json: {} }),
    onSuccess: (res: any) => { toast.show(res.message, "Ended ·"); setEnding(false); refresh(); },
    onError: (e: any) => toast.show(e.message),
  });

  if (!c) return <AdminShell title="Customer" testID="sa-customer"><Loading /></AdminShell>;
  const sub = c.subscription;

  const teamCols: Col<any>[] = [
    { key: "name", label: "Person", flex: 2, render: (r) => (
      <View>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.name}</Text>
        <Sub numberOfLines={1}>{r.email}</Sub>
      </View>
    ) },
    { key: "role", label: "Role", flex: 1, render: (r) => <Sub>{r.role}{r.shop ? ` · ${r.shop}` : ""}</Sub> },
    { key: "seen", label: "Last active", flex: 1.2, align: "right", render: (r) => (
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: r.last_seen ? colors.onSurface : colors.ink40 }}>{seenLabel(r.last_seen)}</Text>
    ) },
  ];
  const histCols: Col<any>[] = [
    { key: "at", label: "When", flex: 1, render: (r) => <Sub>{dayMonth(r.at)}</Sub> },
    { key: "plan", label: "Plan", flex: 1.2, render: (r) => (
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }}>
        {r.plan}{r.months ? ` · ${r.months} mo` : r.cadence ? ` · ${r.cadence}` : ""}
      </Text>
    ) },
    { key: "amount", label: "Amount", flex: 1, align: "right", render: (r) => <Fig>{money(r.amount || 0)}</Fig> },
    { key: "by", label: "By", flex: 1.6, render: (r) => (
      <Sub numberOfLines={2}>{r.source === "admin" ? `Tredi team · ${r.by}` : `In app · ${r.by}`}{r.reference ? ` · ref ${r.reference}` : ""}</Sub>
    ) },
  ];

  const chip = (on: boolean, label: string, onPress: () => void, testID: string) => (
    <Btn key={testID} label={label} tone={on ? "deep" : "ghost"} onPress={onPress} testID={testID} />
  );

  return (
    <AdminShell title={c.name || "Customer"} sub={`${c.owner} · ${c.email || c.phone || "no contact"}`}
      actions={<Btn label="Back" icon="arrow-back" onPress={() => router.push("/admin/customers")} testID="customer-back" />}
      testID="sa-customer">
      <Row gap={12} wrapped style={{ marginBottom: 14 }}>
        <Panel style={{ flex: 1, minWidth: 180 }} testID="current-plan">
          <Lbl>Current plan</Lbl>
          <Row gap={8} style={{ marginTop: 6 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface }}>{sub.name}</Text>
            <Pill label={SUB_LABEL[sub.status] ?? sub.status} tone={SUB_TONE[sub.status]} />
            {sub.custom ? <Pill label="Custom" tone="info" /> : null}
          </Row>
          <Sub style={{ marginTop: 4 }}>{sub.price_label} {sub.trialing ? "" : sub.cadence}</Sub>
        </Panel>
        <Panel style={{ flex: 1, minWidth: 180 }}>
          <Lbl>{sub.status === "expired" ? "Ended" : "Ends"}</Lbl>
          <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface, marginTop: 6 }}>{dayMonth(sub.ends_at)}</Text>
          <Sub style={{ marginTop: 4 }}>{sub.days_left != null && sub.days_left >= 0 ? `${sub.days_left} days left` : "Read-only until renewed"}</Sub>
        </Panel>
        <Panel style={{ flex: 1, minWidth: 180 }} testID="last-active">
          <Lbl>Last active</Lbl>
          <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface, marginTop: 6 }}>{seenLabel(c.last_active)}</Text>
          <Sub style={{ marginTop: 4 }}>Signed up {dayMonth(c.created_at)} · {c.users} people · {c.shops} location{c.shops === 1 ? "" : "s"}</Sub>
        </Panel>
      </Row>

      {c.pending_request ? (
        <View style={{ marginBottom: 14 }}>
          <Note tone="warn" title="This customer asked for a plan in the app">Activating here also closes their request.</Note>
        </View>
      ) : null}

      <View style={{ flexDirection: wide ? "row" : "column", gap: 14, alignItems: "flex-start" }}>
        <Panel title="Activate a plan" sub="For a client who paid you directly. Starts today, or after the time left on the same plan."
          style={{ flex: 1, width: wide ? undefined : "100%" }} testID="activate-panel">
          <Lbl>Plan</Lbl>
          <Row gap={6} wrapped style={{ marginTop: 6, marginBottom: 12 }}>
            {c.catalogue.map((p: any) => chip(plan === p.key, p.name, () => setPlan(p.key), `plan-${p.key}`))}
          </Row>
          <Lbl>How long</Lbl>
          <Row gap={6} wrapped style={{ marginTop: 6, marginBottom: 12 }}>
            {MONTHS.map((m) => chip(months === m, `${m} month${m > 1 ? "s" : ""}`, () => setMonths(m), `months-${m}`))}
          </Row>
          <Lbl>Amount received (₦)</Lbl>
          <View style={{ marginTop: 6, marginBottom: 12 }}>
            <Input value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ""))} keyboardType="numeric" testID="activate-amount" />
            {base ? <Sub style={{ marginTop: 4 }}>List price {money(priceFor(base, months))}</Sub> : null}
          </View>
          <Lbl>Payment reference</Lbl>
          <View style={{ marginTop: 6, marginBottom: 12 }}>
            <Input value={reference} onChangeText={setReference} placeholder="Bank transfer ref, receipt no." testID="activate-reference" />
          </View>
          <Lbl>Note (optional)</Lbl>
          <View style={{ marginTop: 6, marginBottom: 14 }}>
            <Input value={note} onChangeText={setNote} placeholder="Paid via GTBank transfer" testID="activate-note" />
          </View>
          <Row gap={8} wrapped>
            <Btn label={`Activate ${base?.name ?? ""}`} tone="primary" icon="checkmark-circle-outline" onPress={() => setConfirm(true)} testID="activate-btn" />
            {sub.status !== "expired" ? <Btn label="End plan now" tone="danger" onPress={() => setEnding(true)} testID="end-plan" /> : null}
          </Row>
        </Panel>

        <Panel title="Custom plan for this client" sub="Override price, limits or features. Empty limit = unlimited. Applies on top of their plan."
          style={{ flex: 1, width: wide ? undefined : "100%" }} testID="custom-panel">
          <Row gap={8}>
            <View style={{ flex: 1, gap: 6 }}>
              <Lbl>Plan name shown to client</Lbl>
              <Input value={cName} onChangeText={setCName} placeholder={sub.name} testID="custom-name" />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Lbl>Price (₦)</Lbl>
              <Input value={cPrice} onChangeText={(v) => setCPrice(v.replace(/\D/g, ""))} placeholder="Standard price" keyboardType="numeric" testID="custom-price" />
            </View>
          </Row>
          <Row gap={8} wrapped style={{ marginTop: 12 }}>
            {LIMITS.map((l) => (
              <View key={l} style={{ flex: 1, minWidth: 110, gap: 6 }}>
                <Lbl>{c.limit_names[l]}</Lbl>
                <Input value={cLimits[l] ?? ""} onChangeText={(v) => setCLimits({ ...cLimits, [l]: v.replace(/\D/g, "") })}
                  placeholder="Unlimited" keyboardType="numeric" testID={`custom-limit-${l}`} />
              </View>
            ))}
          </Row>
          <View style={{ marginTop: 12, gap: 2 }}>
            {Object.keys(c.feature_names).map((f) => (
              <Row key={f} style={{ justifyContent: "space-between", paddingVertical: 4 }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: colors.onSurface, flexShrink: 1 }}>{c.feature_names[f]}</Text>
                <Switch value={!!cFeatures[f]} onValueChange={(v) => setCFeatures({ ...cFeatures, [f]: v })}
                  trackColor={{ true: colors.brandPrimary, false: colors.switchOff }} testID={`custom-feature-${f}`} />
              </Row>
            ))}
          </View>
          <Row gap={8} wrapped style={{ marginTop: 14 }}>
            <Btn label="Save custom plan" tone="primary" busy={saveCustom.isPending} onPress={() => saveCustom.mutate()} testID="custom-save" />
            {c.custom_plan ? <Btn label="Back to standard" busy={clearCustom.isPending} onPress={() => clearCustom.mutate()} testID="custom-clear" /> : null}
          </Row>
        </Panel>
      </View>

      <View style={{ flexDirection: wide ? "row" : "column", gap: 14, marginTop: 14, alignItems: "flex-start" }}>
        <Panel pad={0} title="Team activity" sub="When each person was last in the books" style={{ flex: 1, width: wide ? undefined : "100%" }}>
          <Table cols={teamCols} rows={c.team} minWidth={420} empty="No one on this account yet" testID="team-table" />
        </Panel>
        <Panel pad={0} title="Plan history" sub="Every activation, in the app or by the Tredi team" style={{ flex: 1, width: wide ? undefined : "100%" }}>
          <Table cols={histCols} rows={c.history} minWidth={460} empty="No plan changes yet" testID="history-table" />
        </Panel>
      </View>

      <AdminModal visible={confirm} onClose={() => setConfirm(false)} title={`Activate ${base?.name ?? ""} for ${c.name}?`}
        sub={`${months} month${months > 1 ? "s" : ""} · ${money(Number(amount) || 0)} received${reference ? ` · ref ${reference}` : ""}. The owner sees it in their Activity.`}
        testID="activate-modal"
        footer={<Row gap={8}>
          <Btn label="Cancel" onPress={() => setConfirm(false)} />
          <Btn label="Activate" tone="primary" busy={activate.isPending} onPress={() => activate.mutate()} testID="activate-confirm" />
        </Row>}>
        <Sub>Their books unlock straight away if they were read-only.</Sub>
      </AdminModal>
      <AdminModal visible={ending} onClose={() => setEnding(false)} title="End this plan today?"
        sub="Use this if a direct payment bounced. Nothing is deleted; the customer becomes read-only until they renew." testID="end-modal"
        footer={<Row gap={8}>
          <Btn label="Cancel" onPress={() => setEnding(false)} />
          <Btn label="End plan" tone="danger" busy={endPlan.isPending} onPress={() => endPlan.mutate()} testID="end-confirm" />
        </Row>}>
        <Sub>{c.name} · {sub.name}</Sub>
      </AdminModal>
    </AdminShell>
  );
}
