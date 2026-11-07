// Plan & billing — what this shop is on, what it is using, and switching plan.
// Paid plans are bought by card on Paystack (auto-renewing); without a Paystack
// key a plan switches on straight away. Ceilings are enforced by the API on every create.
import { useEffect, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Badge, BadgeTone, Btn, Card, Chip, H4, Lbl, Loading, Money, Prog, Row, Sub, Tag } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  trialing: { label: "Free trial", tone: "info" },
  active: { label: "Active", tone: "paid" },
  expired: { label: "Ended", tone: "over" },
};

const USAGE: { key: "businesses" | "shops" | "users" | "invoices"; label: string; word: string }[] = [
  { key: "businesses", label: "Businesses", word: "businesses" },
  { key: "shops", label: "Locations", word: "locations" },
  { key: "users", label: "Staff or reps", word: "people" },
  { key: "invoices", label: "Customer invoices", word: "invoices" },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  hero: { borderWidth: 0, boxShadow: `0 8px 22px ${c.shadow}`, elevation: 3 },
  price: { fontFamily: fonts.monoSemibold, fontSize: 20, color: c.onSurface },
  planName: { fontFamily: fonts.extrabold, fontSize: 15, color: c.onSurface },
  cell: { width: 74, textAlign: "center", fontFamily: fonts.medium, fontSize: 11.5, color: c.ink40 },
  head: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.6, textTransform: "uppercase", color: c.ink40 },
  matrixRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.border },
  yes: { fontFamily: fonts.bold, fontSize: 12, color: c.green700 },
}));

const num = (v: number | null) => (v === null ? "No limit" : v.toLocaleString());

export default function PlanBilling() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const toast = useToast();
  const params = useLocalSearchParams<{ paystack?: string }>();
  const qc = useQueryClient();
  const [cadence, setCadence] = useState("monthly");
  const [picking, setPicking] = useState("");
  const sub = useQuery({ queryKey: ["subscription"], queryFn: () => api<any>("/subscription") });
  const cat = useQuery({ queryKey: ["plans"], queryFn: () => api<any>("/plans") });
  const d = sub.data;

  // Land on the cadence they are already paying for.
  useEffect(() => { if (cat.data?.cadence) setCadence(cat.data.cadence); }, [cat.data?.cadence]);

  const choose = useMutation({
    mutationFn: (plan: string) => api("/subscription/choose", { method: "POST", json: { plan, cadence } }),
    onSuccess: (r: any) => {
      ["subscription", "plans", "dashboard", "settings-invoice"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.show(r.message, r.over?.length ? "Watch the ceiling" : "Plan active");
    },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
    onSettled: () => setPicking(""),
  });

  const card = !!d?.paystack?.enabled;
  const refresh = () => ["subscription", "plans", "dashboard", "settings-invoice", "activity"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const verify = useMutation({
    mutationFn: (reference: string) => api<any>("/subscription/verify", { method: "POST", json: { reference } }),
    onSuccess: (r: any) => {
      refresh();
      if (r.paid) toast.show(r.message || "Your plan is active", "Payment received");
      else toast.show("Payment not completed — nothing was charged. Tap the plan to try again.", undefined, "bad");
    },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });
  // Coming back from Paystack in the browser (web, or a deep link on the phone)
  useEffect(() => { if (params.paystack) verify.mutate(params.paystack); }, [params.paystack]); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = useMutation({
    mutationFn: async (plan: string) => {
      const returnUrl = Linking.createURL("settings/plan");
      const r = await api<any>("/subscription/checkout", { method: "POST", json: { plan, cadence, return_url: returnUrl } });
      if (Platform.OS === "web") {
        // same tab: Paystack's page blocks popups from reporting back, and the callback brings us to ?paystack=<ref>
        window.location.assign(r.authorization_url);
        return "";
      }
      await WebBrowser.openAuthSessionAsync(r.authorization_url, returnUrl);
      return r.reference as string;
    },
    // on the phone: whether they finished or closed the page, ask Paystack what happened
    onSuccess: (reference: string) => { if (reference) verify.mutate(reference); },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
    onSettled: () => setPicking(""),
  });
  const busy = choose.isPending || pay.isPending || verify.isPending;

  const stop = useMutation({
    mutationFn: () => api<any>("/subscription/cancel", { method: "POST" }),
    onSuccess: (r: any) => { refresh(); toast.show(r.message, "Auto-renew off"); },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  const status = STATUS[d?.status ?? "active"] ?? STATUS.active;

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
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
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
              <Sub style={{ marginTop: 4, color: colors.coral }} testID="plan-expired-note">
                Your books are safe and readable — pick a plan below and saving starts again at once.
              </Sub>
            ) : null}
            {d.paystack?.auto_renew ? (
              <Row between style={{ marginTop: 10 }} testID="plan-auto-renew">
                <Sub style={{ flex: 1 }}>Auto-renews on {d.paystack.card?.brand || "card"} •••• {d.paystack.card?.last4 || "—"}</Sub>
                <Btn small variant="ghost" label="Stop auto-renew" loading={stop.isPending} disabled={!d.can_manage}
                  onPress={() => stop.mutate()} testID="plan-stop-renew" />
              </Row>
            ) : null}
          </Card>
          <Card testID="plan-usage">
            {USAGE.map((u, i) => {
              const used = d.usage[u.key] ?? 0;
              const limit = d.limits[u.key] ?? null;
              const full = limit !== null && used >= limit;
              return (
                <View key={u.key} style={{ marginTop: i ? 12 : 0 }} testID={`plan-usage-${u.key}`}>
                  <Row between>
                    <H4>{u.label}</H4>
                    <Money tone={full ? "neg" : undefined}>{used.toLocaleString()}{limit === null ? "" : ` / ${limit.toLocaleString()}`}</Money>
                  </Row>
                  <View style={{ marginTop: 6 }}>
                    <Prog pct={limit === null ? 18 : Math.min(100, (used / limit) * 100)} tone={full ? "bad" : undefined} />
                  </View>
                  <Sub style={{ marginTop: 4, fontSize: 10.5 }}>
                    {limit === null ? `No limit on ${u.word}`
                      : full ? `You are at the limit — move up a plan to add more ${u.word}`
                      : `${(limit - used).toLocaleString()} more ${u.word} on ${d.name}`}
                  </Sub>
                </View>
              );
            })}
          </Card>

          <Row between style={{ marginTop: 16, marginBottom: 6 }}>
            <Lbl>Plans</Lbl>
            <Sub style={{ fontSize: 10.5 }}>Free trial is {cat.data.trial_days} days</Sub>
          </Row>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 9 }}>
            {cat.data.cadences.map((c: any) => (
              <Chip key={c.key} label={c.note ? `${c.label} · ${c.note}` : c.label} on={cadence === c.key}
                onPress={() => setCadence(c.key)} testID={`plan-cadence-${c.key}`} />
            ))}
          </View>

          {cat.data.plans.map((p: any) => {
            const mine = p.key === d.plan;
            const trial = p.key === "trial";
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
                    <Text style={s.price} testID={`plan-price-${p.key}`}>{trial ? "Free" : p.price_labels[cadence]}</Text>
                    <Tag>{trial ? p.cadence : cat.data.cadences.find((c: any) => c.key === cadence)?.label}</Tag>
                  </View>
                </Row>
                <Row style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <Tag>{num(p.limits.businesses)} business{p.limits.businesses === 1 ? "" : "es"}</Tag>
                  <Tag>{num(p.limits.shops)} location{p.limits.shops === 1 ? "" : "s"}</Tag>
                  <Tag>{num(p.limits.users)} staff</Tag>
                  <Tag>{num(p.limits.invoices)} invoices</Tag>
                </Row>
                <View style={{ marginTop: 10, gap: 6 }}>
                  {p.perks.map((perk: string) => (
                    <Row key={perk} style={{ gap: 7, alignItems: "flex-start" }}>
                      <Ionicons name="checkmark-circle" size={15} color={colors.brandPrimary} style={{ marginTop: 1 }} />
                      <Sub style={{ flex: 1 }}>{perk}</Sub>
                    </Row>
                  ))}
                </View>
                {mine && d.status !== "expired" ? (
                  <Btn small variant="ghost" label="You are on this plan" disabled style={{ marginTop: 12 }} testID={`plan-choose-${p.key}`} />
                ) : trial ? null : (
                  <Btn small variant="deep" label={card ? (mine ? `Pay & renew ${p.name}` : `Pay & activate ${p.name}`) : (mine ? `Renew ${p.name}` : `Activate ${p.name}`)}
                    disabled={!d.can_manage || busy} loading={busy && picking === p.key} style={{ marginTop: 12 }}
                    testID={`plan-choose-${p.key}`} onPress={() => { setPicking(p.key); (card ? pay : choose).mutate(p.key); }} />
                )}
              </Card>
            );
          })}

          <Lbl style={{ marginTop: 6, marginBottom: 6 }}>Side by side</Lbl>
          <Card style={{ paddingVertical: 4 }} testID="plan-matrix">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={[s.matrixRow, { paddingVertical: 7 }]}>
                  <Text style={[s.head, { width: 168 }]}>Feature</Text>
                  {cat.data.plans.map((p: any) => <Text key={p.key} style={[s.head, { width: 74, textAlign: "center" }]} numberOfLines={1}>{p.name.replace("Free ", "")}</Text>)}
                </View>
                {cat.data.matrix.map((m: any, i: number) => (
                  <View key={m.label} style={[s.matrixRow, i === cat.data.matrix.length - 1 && { borderBottomWidth: 0 }]}>
                    <Sub style={{ width: 168, paddingRight: 8 }}>{m.label}</Sub>
                    {cat.data.plans.map((p: any) => {
                      const val = m.kind === "limit" ? num(p.limits[m.key] ?? null)
                        : m.kind === "feature" ? (p.features[m.key] ? "✓" : "—") : "✓";
                      return <Text key={p.key} style={[s.cell, val === "✓" && s.yes]} numberOfLines={1}>{val}</Text>;
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </Card>

          <Sub style={{ marginTop: 12 }}>
            {card
              ? `You pay securely on Paystack. Your card is charged again at the end of each period until you stop auto-renew.${d.paystack.test ? " Test mode — no real money moves." : ""}`
              : "Card payment is not switched on yet, so the plan you tap switches on immediately and we invoice you for it."}
            {" "}Starter saves photos on items but only Premium and above print them on invoices.
          </Sub>
        </ScrollView>
      )}
    </View>
  );
}
