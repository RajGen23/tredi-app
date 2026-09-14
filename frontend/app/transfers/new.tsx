// New transfer — pick two shops, then what is going.
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Btn, Card, Chip, Field, H4, Lbl, Li, Loading, Money, Row, Sub, Switch } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { money, parseNum } from "@/src/format";
import { fonts, makeStyles } from "@/src/theme";

type Line = { item_id: string; name: string; quantity: number; unit: string };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  bar: { backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 14, paddingTop: 10 },
  total: { fontFamily: fonts.monoSemibold, fontSize: 18, letterSpacing: -0.5, color: c.onSurface },
}));

export default function NewTransfer() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState(false);
  const [draft, setDraft] = useState<{ id: string; name: string; unit: string; have: number; qty: string } | null>(null);
  const [approval, setApproval] = useState(true);

  const shops = useQuery({ queryKey: ["shops"], queryFn: () => api("/shops") });
  const items = useQuery({ queryKey: ["items"], queryFn: () => api("/items") });
  const names: string[] = (shops.data?.shops ?? []).map((x: any) => x.name);
  const value = useMemo(() => {
    const by: Record<string, any> = Object.fromEntries((items.data ?? []).map((i: any) => [i.id, i]));
    return lines.reduce((a, l) => a + l.quantity * (by[l.item_id]?.cost_price ?? 0), 0);
  }, [lines, items.data]);

  const save = useMutation({
    mutationFn: () => api("/transfers", { method: "POST", json: { from_shop: from, to_shop: to, lines, needs_approval: approval } }),
    onSuccess: (r: any) => { qc.invalidateQueries(); toast.show(approval ? "Waiting for approval" : "Sent", r.number); router.replace("/transfers"); },
    onError: (e: any) => toast.show(e.message),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-transfer-screen">
      <AppBar title="New transfer" close />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {names.length < 2 ? (
          <Card>
            <Sub>You need a second shop before stock can move. A warehouse counts as a shop with sales turned off.</Sub>
            <Btn label="Add a shop" small style={{ marginTop: 12 }} testID="transfer-add-shop" onPress={() => router.push("/shops/new")} />
          </Card>
        ) : (
          <>
            <Lbl style={{ marginBottom: 6 }}>Moving from</Lbl>
            <Row style={{ gap: 6, flexWrap: "wrap" }}>
              {names.map((n) => <Chip key={n} label={n} on={from === n} onPress={() => setFrom(n)} testID={`transfer-from-${n}`} />)}
            </Row>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Moving to</Lbl>
            <Row style={{ gap: 6, flexWrap: "wrap" }}>
              {names.filter((n) => n !== from).map((n) => <Chip key={n} label={n} on={to === n} onPress={() => setTo(n)} testID={`transfer-to-${n}`} />)}
            </Row>
            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>What is going</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {lines.map((l, i) => (
                <Li key={`${l.item_id}-${i}`} testID={`transfer-line-${i}`} onPress={() => setLines((x) => x.filter((_, j) => j !== i))}>
                  <View style={{ flex: 1 }}><H4>{l.name}</H4><Sub>{l.quantity} {l.unit}</Sub></View>
                  <Sub>remove</Sub>
                </Li>
              ))}
              <Li last testID="transfer-add-item" onPress={() => setPick(true)}>
                <Av icon="add" tone="green" />
                <View style={{ flex: 1 }}><H4>Add item</H4><Sub>Only tracked stock can move</Sub></View>
              </Li>
            </Card>
            <Row between style={{ marginTop: 12 }}>
              <View style={{ flex: 1 }}><H4>Needs approval first</H4><Sub>Off sends it straight into transit</Sub></View>
              <Switch on={approval} onChange={setApproval} testID="transfer-approval" />
            </Row>
          </>
        )}
      </ScrollView>
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Row between>
          <View><Lbl>Value at cost</Lbl><Text style={s.total} testID="transfer-value">{money(value)}</Text></View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Btn label="Send transfer" disabled={!from || !to || lines.length === 0} loading={save.isPending} testID="transfer-save" onPress={() => save.mutate()} />
          </View>
        </Row>
      </View>

      <Sheet visible={pick} onClose={() => { setPick(false); setDraft(null); }} testID="transfer-item-sheet">
        {!draft ? (
          <>
            <H4>Which item?</H4>
            {!items.data ? <Loading /> : items.data.filter((i: any) => i.track_stock).map((it: any, i: number, arr: any[]) => (
              <Li key={it.id} last={i === arr.length - 1} testID={`transfer-item-${it.id}`}
                onPress={() => setDraft({ id: it.id, name: it.name, unit: it.unit, have: it.quantity, qty: "" })}>
                <Av icon="cube-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>{it.name}</H4><Sub>{it.quantity} {it.unit} on hand</Sub></View>
              </Li>
            ))}
          </>
        ) : (
          <>
            <H4>{draft.name}</H4>
            <Sub style={{ marginTop: 4 }}>{draft.have} {draft.unit} on hand at {from ?? "the sending shop"}.</Sub>
            <Field label={`How many ${draft.unit.toLowerCase()}`} placeholder="0" keyboardType="numeric" mono value={draft.qty}
              onChangeText={(v) => setDraft({ ...draft, qty: v })} testID="transfer-draft-qty" style={{ marginTop: 10 }} />
            <Btn label="Add to transfer" style={{ marginTop: 14 }} disabled={parseNum(draft.qty) <= 0} testID="transfer-draft-add"
              onPress={() => {
                if (parseNum(draft.qty) > draft.have) toast.show("More than you have — recount before sending");
                setLines((l) => [...l, { item_id: draft.id, name: draft.name, quantity: parseNum(draft.qty), unit: draft.unit }]);
                setDraft(null);
                setPick(false);
              }} />
          </>
        )}
      </Sheet>
    </View>
  );
}
