// Plan & billing — what this shop is on, what it is using, and how to move up.
// Cards are not connected yet, so choosing a plan raises a request the tredi
// team activates; the ceilings themselves are enforced by the API.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Badge, BadgeTone, Btn, Card, H4, Lbl, Loading, Money, Prog, Row, Sub, Tag } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  trialing: { label: "Free trial", tone: "info" },
  active: { label: "Active", tone: "paid" },
  expired: { label: "Ended", tone: "over" },
};

const USAGE: { key: "shops" | "users" | "businesses"; label: string; word: string }[] = [
  { key: "shops", label: "Shops and warehouses", word: "shops" },
  { key: "users", label: "Team members", word: "people" },
  { key: "businesses", label: "Separate businesses", word: "businesses" },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  hero: { borderWidth: 0, boxShadow: `0 8px 22px ${c.shadow}`, elevation: 3 },
  price: { fontFamily: fonts.monoSemibold, fontSize: 20, color: c.onSurface },
  planName: { fontFamily: fonts.extrabold, fontSize: 15, color: c.onSurface },
  cell: { width: 52, textAlign: "center" },
  head: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.6, textTransform: "uppercase", color: c.ink40 },
  matrixRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.border },
  yes: { fontFamily: fonts.bold, fontSize: 12, color: c.green700 },
  no: { fontFamily: fonts.medium, fontSize: 12, color: c.ink40 },
}));

export default function PlanBilling() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [asking, setAsking] = useState("");
  const sub = useQuery({ queryKey: ["subscription"], queryFn: () => api<any>("/subscription") });
  const cat = useQuery({ queryKey: ["plans"], queryFn: () => api<any>("/plans") });
  const d = sub.data;

  const ask = useMutation({
    mutationFn: (plan: string) => api("/subscription/request", { method: "POST", json: { plan } }),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ["subscription"] }); toast.show(r.message, "Requested"); },
    onError: (e: any) => toast.show(e.message),
    onSettled: () => setAsking(""),
  });
  const cancel = useMutation({
    mutationFn: () => api("/subscription/request", { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subscription"] }); toast.show("Request withdrawn"); },
  });

  const status = STATUS[d?.status ?? "active"] ?? STATUS.active;
  const cap = (v: number | null) => (v === null ? "No limit" : String(v));

  const when = () => {
    if (!d) return "";
    if (d.status === "expired") return d.trialing ? "Your free trial has ended" : "Your subscription has lapsed";
    if (d.trialing) return `${Math.max(0, d.days_left ?? 0)} day${d.days_left === 1 ? "" : "s"} left in your free trial`;
    return d.days_left === null ? "No renewal date set" : `Renews in ${d.days_left} day${d.days_left === 1 ? "" : "s"}`;
  };

  return (
    <View style={s.root} testID="plan-screen">
      <View style={[s.teal, { height: insets.top + 118 }]} />
      <View style={{ paddingTop: insets.top }}><AppBar teal back title="Plan & billing" /></View>
      {!d || !cat.data ? <Card style={{ marginHorizontal: 14 }}><Loading /></Card> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 28 }}>
          <Card style={s.hero} testID="plan-current">
            <Row between>
              <Lbl>Your plan</Lbl>
              <Badge tone={status.tone}>{status.label}</Badge>
            </Row>
            <Row between style={{ marginTop: 6, alignItems: "flex-end" }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={s.planName} testID="plan-current-name">{d.name}</Text>
                <Sub style={{ marginTop: 2 }}>{d.tagline}</Sub>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.price}>{d.price ? d.price_label : "Free"}</Text>
                <Tag>{d.cadence}</Tag>
              </View>
            </Row>
            <Sub style={{ marginTop: 9 }} testID="plan-when">{when()}</Sub>
            {d.status === "expired" ? (
              <Sub style={{ marginTop: 4, color: colors.coral }}>Your books are safe and readable — saving starts again the moment a plan is active.</Sub>
            ) : null}
          </Card>

          {d.pending ? (
            <Card style={{ marginTop: 9, backgroundColor: colors.info, borderColor: colors.info }} testID="plan-pending">
              <Row between>
                <View style={{ flex: 1 }}>
                  <H4>{d.pending.plan_name} requested</H4>
                  <Sub>We are activating it — you keep working in the meantime.</Sub>
                </View>
                <Btn small variant="ghost" label="Withdraw" testID="plan-withdraw" onPress={() => cancel.mutate()} />
              </Row>
            </Card>
          ) : null}

          <Lbl style={{ marginTop: 14, marginBottom: 6 }}>What you are using</Lbl>
          <Card testID="plan-usage">
            {USAGE.map((u, i) => {
              const used = d.usage[u.key] ?? 0;
              const limit = d.limits[u.key];
              const full = limit !== null && used >= limit;
              return (
                <View key={u.key} style={{ marginTop: i ? 12 : 0 }} testID={`plan-usage-${u.key}`}>
                  <Row between>
                    <H4>{u.label}</H4>
                    <Money tone={full ? "neg" : undefined}>{used}{limit === null ? "" : ` / ${limit}`}</Money>
                  </Row>
                  <View style={{ marginTop: 6 }}>
                    <Prog pct={limit === null ? 18 : Math.min(100, (used / limit) * 100)} tone={full ? "bad" : undefined} />
                  </View>
                  <Sub style={{ marginTop: 4, fontSize: 10.5 }}>
                    {limit === null ? `No limit on ${u.word}` : full ? `You are at the limit — upgrade to add more ${u.word}` : `${limit - used} more ${u.word} on ${d.name}`}
                  </Sub>
                </View>
              );
            })}
          </Card>

          <Lbl style={{ marginTop: 16, marginBottom: 6 }}>Plans</Lbl>
          {cat.data.plans.map((p: any) => {
            const mine = p.key === d.plan;
            const requested = d.pending?.plan === p.key;
            return (
              <Card key={p.key} style={{ marginBottom: 9, borderColor: mine ? colors.brandPrimary : colors.border }} testID={`plan-card-${p.key}`}>
                <Row between style={{ alignItems: "flex-start" }}>
                  <View style={{ flexShrink: 1, paddingRight: 8 }}>
                    <Row style={{ gap: 6 }}>
                      <Text style={s.planName}>{p.name}</Text>
                      {mine ? <Badge tone="paid">Current</Badge> : null}
                    </Row>
                    <Sub style={{ marginTop: 2 }}>{p.tagline}</Sub>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.price}>{p.price ? p.price_label : "Free"}</Text>
                    <Tag>{p.cadence}</Tag>
                  </View>
                </Row>
                <View style={{ marginTop: 10, gap: 6 }}>
                  {p.perks.map((perk: string) => (
                    <Row key={perk} style={{ gap: 7, alignItems: "flex-start" }}>
                      <Ionicons name="checkmark-circle" size={15} color={colors.brandPrimary} style={{ marginTop: 1 }} />
                      <Sub style={{ flex: 1 }}>{perk}</Sub>
                    </Row>
                  ))}
                </View>
                {mine ? (
                  <Btn small variant="ghost" label="You are on this plan" disabled style={{ marginTop: 12 }} testID={`plan-choose-${p.key}`} />
                ) : p.key === "trial" ? null : (
                  <Btn small variant={requested ? "ghost" : "deep"} label={requested ? "Requested — we are on it" : `Choose ${p.name}`}
                    disabled={requested || !d.can_manage} loading={ask.isPending && asking === p.key} style={{ marginTop: 12 }}
                    testID={`plan-choose-${p.key}`} onPress={() => { setAsking(p.key); ask.mutate(p.key); }} />
                )}
              </Card>
            );
          })}

          <Lbl style={{ marginTop: 6, marginBottom: 6 }}>Side by side</Lbl>
          <Card style={{ paddingVertical: 4 }} testID="plan-matrix">
            <View style={[s.matrixRow, { paddingVertical: 7 }]}>
              <Text style={[s.head, { flex: 1 }]}>Feature</Text>
              {cat.data.plans.map((p: any) => <Text key={p.key} style={[s.head, s.cell]} numberOfLines={1}>{p.name.replace("Free ", "")}</Text>)}
            </View>
            {cat.data.matrix.map((m: any, i: number) => (
              <View key={m.label} style={[s.matrixRow, i === cat.data.matrix.length - 1 && { borderBottomWidth: 0 }]}>
                <Sub style={{ flex: 1, paddingRight: 8 }}>{m.label}</Sub>
                {cat.data.plans.map((p: any) => {
                  const val = m.kind === "limit" ? cap(p.limits[m.key]) : m.kind === "feature" ? (p.features[m.key] ? "✓" : "—") : "✓";
                  const good = val === "✓" || (m.kind === "limit" && val !== "—");
                  return <Text key={p.key} style={[s.cell, good && val === "✓" ? s.yes : s.no]} numberOfLines={1}>{val}</Text>;
                })}
              </View>
            ))}
          </Card>

          <Sub style={{ marginTop: 12 }}>
            Card payment is not switched on yet. Tap the plan you want and the tredi team activates it for you — nothing is charged from the app.
          </Sub>
        </ScrollView>
      )}
    </View>
  );
}
