// 06.3 Record purchase — raises stock and what you owe in one entry.
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Field, H4, Lbl, Li, Loading, Money, Row, Sub, Switch } from "@/src/components/ui";
import { PickerField } from "@/src/components/picker";
import { DateField } from "@/src/components/date-field";
import { Sheet, useToast } from "@/src/components/sheet";
import { useAccounts } from "@/src/lookups";
import { initials, money, parseNum } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Line = { item_id: string | null; name: string; quantity: number; unit_cost: number; unit: string };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  total: { fontFamily: fonts.monoSemibold, fontSize: 19, letterSpacing: -0.6, color: c.onSurface },
  bar: { backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 14, paddingTop: 10 },
}));

export default function NewPurchase() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ supplier?: string; item?: string }>();
  const toast = useToast();
  const qc = useQueryClient();

  const [supplierId, setSupplierId] = useState<string | null>(params.supplier ?? null);
  const [pickSupplier, setPickSupplier] = useState(!params.supplier);
  const [pickItem, setPickItem] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<{ item_id: string | null; name: string; unit: string; qty: string; cost: string } | null>(null);
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<"credit" | "cash" | "transfer">("credit");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [updateCost, setUpdateCost] = useState(true);

  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => api("/suppliers") });
  const items = useQuery({ queryKey: ["items"], queryFn: () => api<any[]>("/items") });
  const { accounts, options: accountOptions } = useAccounts();
  const supplier = suppliers.data?.suppliers?.find((x: any) => x.id === supplierId);
  const total = useMemo(() => lines.reduce((a, l) => a + l.quantity * l.unit_cost, 0), [lines]);
  const account = accounts.find((a: any) => a.id === accountId) ?? accounts[0];

  // Reordering straight from an item: it is already on the bill when the screen opens.
  useEffect(() => {
    if (!params.item || !items.data || lines.length || draft) return;
    const it = items.data.find((x: any) => x.id === params.item);
    if (it) {
      setDraft({ item_id: it.id, name: it.name, unit: it.unit, qty: "", cost: String(it.cost_price || "") });
      setPickItem(true);
      if (it.supplier && !supplierId) {
        const s2 = suppliers.data?.suppliers?.find((x: any) => x.name === it.supplier);
        if (s2) { setSupplierId(s2.id); setPickSupplier(false); }
      }
    }
  }, [params.item, items.data, lines.length, draft, supplierId, suppliers.data]);

  const save = useMutation({
    mutationFn: () => api("/purchases", {
      method: "POST",
      json: { supplier_id: supplierId, lines, paid: parseNum(paid), method, update_cost: updateCost, date,
              account_id: method === "credit" ? null : account?.id ?? null },
    }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.show(`${money(r.total)} recorded`, r.number);
      router.replace(`/purchases/${r.id}`);
    },
    onError: (e: any) => toast.show(e.message),
  });

  const addLine = () => {
    if (!draft) return;
    const qty = parseNum(draft.qty);
    const cost = parseNum(draft.cost);
    if (qty <= 0) return toast.show("Enter how many arrived");
    setLines((l) => [...l, { item_id: draft.item_id, name: draft.name, quantity: qty, unit_cost: cost, unit: draft.unit }]);
    setDraft(null);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-purchase-screen">
      <AppBar title="Record purchase" close right={<Badge tone="draft">Draft</Badge>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Card testID="purchase-supplier-card">
          {supplier ? (
            <Row style={{ gap: 10 }}>
              <Av text={initials(supplier.name)} tone="sq" />
              <View style={{ flex: 1 }}><H4>{supplier.name}</H4><Sub>Owes {money(supplier.owed)}</Sub></View>
              <Chip label="Change" onPress={() => setPickSupplier(true)} testID="purchase-change-supplier" />
            </Row>
          ) : (
            <Btn label="Choose a supplier" variant="ghost" small testID="purchase-pick-supplier" onPress={() => setPickSupplier(true)} />
          )}
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>What arrived</Lbl>
        <Card style={{ paddingVertical: 4 }}>
          {lines.map((l, i) => (
            <Li key={`${l.name}-${i}`} testID={`purchase-line-${i}`} onPress={() => setLines((x) => x.filter((_, j) => j !== i))}>
              <View style={{ flex: 1 }}><H4>{l.name}</H4><Sub>{l.quantity} {l.unit} × {money(l.unit_cost)}</Sub></View>
              <Money>{money(l.quantity * l.unit_cost)}</Money>
            </Li>
          ))}
          <Li last onPress={() => setPickItem(true)} testID="purchase-add-item">
            <Av icon="add" tone="green" />
            <View style={{ flex: 1 }}><H4>Add item</H4><Sub>From stock, or type a new name</Sub></View>
          </Li>
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Payment</Lbl>
        <Card style={{ gap: 8 }}>
          <Row style={{ gap: 6 }}>
            {(["credit", "cash", "transfer"] as const).map((m) => (
              <Chip key={m} label={m === "credit" ? "On credit" : m === "cash" ? "Cash" : "Transfer"} on={method === m} onPress={() => setMethod(m)} testID={`purchase-method-${m}`} />
            ))}
          </Row>
          <Field label="Paid now" placeholder="0" keyboardType="numeric" mono value={paid} onChangeText={setPaid} testID="purchase-paid" />
          {method !== "credit" ? (
            <PickerField label="Paid from" value={account?.id ?? null} options={accountOptions} onPick={setAccountId}
              title="Which account paid for it?" placeholder="Cash till" testID="purchase-account" />
          ) : null}
          <DateField label="Date on the bill" value={date} onChange={setDate} testID="purchase-date" />
          <Row between>
            <View style={{ flex: 1 }}><H4>Update cost prices</H4><Sub>Uses the price on this bill</Sub></View>
            <Switch on={updateCost} onChange={setUpdateCost} testID="purchase-update-cost" />
          </Row>
        </Card>
        <Sub style={{ marginTop: 10 }}>Snap the supplier’s bill from Bills &amp; receipts and attach it to this purchase.</Sub>
      </ScrollView>

      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Row between>
          <View><Lbl>Total · {parseNum(paid) >= total && total > 0 ? "paid" : "unpaid"}</Lbl><Text style={s.total} testID="purchase-total">{money(total)}</Text></View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Btn label="Save purchase" disabled={!supplierId || lines.length === 0} loading={save.isPending} testID="purchase-save" onPress={() => save.mutate()} />
          </View>
        </Row>
      </View>

      <Sheet visible={pickSupplier} onClose={() => setPickSupplier(false)} testID="purchase-supplier-sheet">
        <H4>Who did you buy from?</H4>
        {!suppliers.data ? <Loading /> : (suppliers.data.suppliers ?? []).map((x: any, i: number, arr: any[]) => (
          <Li key={x.id} last={i === arr.length - 1} testID={`purchase-supplier-${x.id}`} onPress={() => { setSupplierId(x.id); setPickSupplier(false); }}>
            <Av text={initials(x.name)} tone="sq" />
            <View style={{ flex: 1 }}><H4>{x.name}</H4><Sub>{x.category}</Sub></View>
            <Money tone={x.owed > 0 ? "neg" : "mut"}>{money(x.owed)}</Money>
          </Li>
        ))}
        <Btn label="Add a new supplier" variant="ghost" small style={{ marginTop: 10 }} testID="purchase-new-supplier"
          onPress={() => { setPickSupplier(false); router.push("/suppliers/new"); }} />
      </Sheet>

      <Sheet visible={pickItem} onClose={() => { setPickItem(false); setDraft(null); }} testID="purchase-item-sheet">
        {!draft ? (
          <>
            <H4>Add item</H4>
            {(items.data ?? []).map((it: any, i: number, arr: any[]) => (
              <Li key={it.id} last={i === arr.length - 1} testID={`purchase-item-${it.id}`}
                onPress={() => setDraft({ item_id: it.id, name: it.name, unit: it.unit, qty: "", cost: String(it.cost_price || "") })}>
                <Av icon="cube-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>{it.name}</H4><Sub>{it.quantity} {it.unit} on hand · cost {money(it.cost_price)}</Sub></View>
              </Li>
            ))}
            <Btn label="Item not in stock yet" variant="ghost" small style={{ marginTop: 10 }} testID="purchase-item-new"
              onPress={() => setDraft({ item_id: null, name: "", unit: "Piece", qty: "", cost: "" })} />
          </>
        ) : (
          <>
            <H4>{draft.name || "New item"}</H4>
            {!draft.item_id ? <Field label="Item name" placeholder="Sugar 50kg" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} testID="purchase-draft-name" style={{ marginTop: 10 }} /> : null}
            <Row style={{ marginTop: 10, gap: 8 }}>
              <View style={{ flex: 1 }}><Field label="Quantity" placeholder="0" keyboardType="numeric" mono value={draft.qty} onChangeText={(v) => setDraft({ ...draft, qty: v })} testID="purchase-draft-qty" /></View>
              <View style={{ flex: 1 }}><Field label="Cost each" placeholder="0" keyboardType="numeric" mono value={draft.cost} onChangeText={(v) => setDraft({ ...draft, cost: v })} testID="purchase-draft-cost" /></View>
            </Row>
            <Row between style={{ marginTop: 10 }}>
              <Sub>Line total</Sub>
              <Money>{money(parseNum(draft.qty) * parseNum(draft.cost))}</Money>
            </Row>
            <Btn label="Add to purchase" style={{ marginTop: 14 }} disabled={!draft.name.trim()} testID="purchase-draft-add" onPress={addLine} />
          </>
        )}
      </Sheet>
    </View>
  );
}
