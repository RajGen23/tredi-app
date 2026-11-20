// 06.3 Record purchase — raises stock and what you owe in one entry.
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
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
import { useBottomPad } from "@/src/safe";
import { fonts, makeStyles, useTheme } from "@/src/theme";

// Kept as typed text so every row can be edited in place; numbers on save.
type Line = { key: string; item_id: string | null; name: string; qty: string; cost: string; sell: string; unit: string };
let seq = 0;
const newKey = () => `l${Date.now()}-${seq++}`;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  total: { fontFamily: fonts.monoSemibold, fontSize: 19, letterSpacing: -0.6, color: c.onSurface },
  line: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  bar: { backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 14, paddingTop: 10 },
}));

export default function NewPurchase() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const params = useLocalSearchParams<{ supplier?: string; item?: string; edit?: string }>();
  const toast = useToast();
  const qc = useQueryClient();

  const [supplierId, setSupplierId] = useState<string | null>(params.supplier ?? null);
  const [pickSupplier, setPickSupplier] = useState(!params.supplier);
  const [newSupplier, setNewSupplier] = useState(false);
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [pickItem, setPickItem] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<"credit" | "cash" | "transfer">("credit");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [updateCost, setUpdateCost] = useState(true);

  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => api("/suppliers") });
  const items = useQuery({ queryKey: ["items"], queryFn: () => api<any[]>("/items") });
  const { accounts, options: accountOptions } = useAccounts();
  const supplier = suppliers.data?.suppliers?.find((x: any) => x.id === supplierId);
  const total = useMemo(() => lines.reduce((a, l) => a + parseNum(l.qty) * parseNum(l.cost), 0), [lines]);
  const fromItem = (it: any): Line => ({ key: newKey(), item_id: it.id, name: it.name, unit: it.unit, qty: "1", cost: it.cost_price ? String(it.cost_price) : "", sell: "" });
  const setLine = (key: string, patch: Partial<Line>) => setLines((x) => x.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const account = accounts.find((a: any) => a.id === accountId) ?? accounts[0];

  // Reordering straight from an item: it is already on the bill when the screen opens.
  useEffect(() => {
    if (!params.item || !items.data || lines.length) return;
    const it = items.data.find((x: any) => x.id === params.item);
    if (it) {
      setLines([fromItem(it)]);
      if (it.supplier && !supplierId) {
        const s2 = suppliers.data?.suppliers?.find((x: any) => x.name === it.supplier);
        if (s2) { setSupplierId(s2.id); setPickSupplier(false); }
      }
    }
  }, [params.item, items.data, lines.length, supplierId, suppliers.data]);

  // `?edit=<id>` reopens an order already on the books.
  const editQ = useQuery({ queryKey: ["purchase", params.edit], queryFn: () => api<any>(`/purchases/${params.edit}`), enabled: !!params.edit });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const d = editQ.data;
    if (!d || loaded) return;
    setLoaded(true);
    setSupplierId(d.supplier_id ?? null);
    setPickSupplier(false);
    setLines((d.lines ?? []).map((l: any) => ({ key: newKey(), item_id: l.item_id ?? null, name: l.name, unit: l.unit ?? "", qty: String(l.quantity), cost: String(l.unit_cost ?? ""), sell: "" })));
    setPaid(d.paid ? String(d.paid) : "");
    setMethod(d.method ?? "credit");
    setAccountId(d.account_id ?? null);
    setDate(dayjs(d.created_at).format("YYYY-MM-DD"));
  }, [editQ.data, loaded]);

  const save = useMutation({
    mutationFn: () => {
      const out = lines.filter((l) => l.name.trim()).map((l) => ({ item_id: l.item_id, name: l.name.trim(), unit: l.unit, quantity: parseNum(l.qty), unit_cost: parseNum(l.cost),
                                                                  selling_price: l.sell ? parseNum(l.sell) : null }));
      const json = { supplier_id: supplierId, lines: out, paid: parseNum(paid), method, update_cost: updateCost, date,
                     account_id: method === "credit" ? null : account?.id ?? null };
      return params.edit ? api(`/purchases/${params.edit}`, { method: "PUT", json }) : api("/purchases", { method: "POST", json });
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.show(params.edit ? `${money(r.total)} corrected` : `${money(r.total)} recorded`, r.number);
      router.replace(`/purchases/${r.id}`);
    },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  // Add a supplier in the middle of a purchase and come straight back to it.
  const addSupplier = useMutation({
    mutationFn: (data: { name: string; phone: string }) => api("/suppliers", { method: "POST", json: data }),
    onSuccess: (sup: any) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setSupplierId(sup.id);
      setNewSupplier(false);
      setPickSupplier(false);
      setSupName("");
      setSupPhone("");
      toast.show(`${sup.name} added — carry on with the purchase`, "Saved.");
    },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  const addPicked = () => {
    const chosen = (items.data ?? []).filter((it: any) => picked.includes(it.id));
    setLines((l) => [...l, ...chosen.map(fromItem)]);
    setPicked([]);
    setSearch("");
    setPickItem(false);
  };
  const addNew = () => {
    setLines((l) => [...l, { key: newKey(), item_id: null, name: "", unit: "Piece", qty: "1", cost: "", sell: "" }]);
    setPickItem(false);
  };
  const badQty = lines.some((l) => parseNum(l.qty) <= 0 || !l.name.trim());

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-purchase-screen">
      <AppBar title={params.edit ? "Edit purchase" : "Record purchase"} close right={<Badge tone="draft">{params.edit ? "Editing" : "Draft"}</Badge>} />
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
            <View key={l.key} style={s.line} testID={`purchase-line-${i}`}>
              <Row between style={{ gap: 8 }}>
                {l.item_id ? <H4 style={{ flex: 1 }}>{l.name}</H4> : (
                  <Field placeholder="New item name, e.g. Sugar 50kg" value={l.name} onChangeText={(v) => setLine(l.key, { name: v })}
                    style={{ flex: 1, minHeight: 40 }} testID={`purchase-line-name-${i}`} />
                )}
                <Pressable hitSlop={10} onPress={() => setLines((x) => x.filter((y) => y.key !== l.key))} testID={`purchase-line-remove-${i}`}>
                  <Ionicons name="close-circle" size={22} color={colors.ink40} />
                </Pressable>
              </Row>
              <Row style={{ gap: 8, marginTop: 6 }}>
                <Field label="Qty" placeholder="0" keyboardType="decimal-pad" mono value={l.qty} onChangeText={(v) => setLine(l.key, { qty: v })} style={{ flex: 1 }} testID={`purchase-line-qty-${i}`} />
                <Field label="Cost each" placeholder="0" keyboardType="decimal-pad" mono value={l.cost} onChangeText={(v) => setLine(l.key, { cost: v })} style={{ flex: 1.3 }} testID={`purchase-line-cost-${i}`} />
                {!l.item_id ? <Field label="Sell at" placeholder="0" keyboardType="decimal-pad" mono value={l.sell} onChangeText={(v) => setLine(l.key, { sell: v })} style={{ flex: 1.3 }} testID={`purchase-line-sell-${i}`} /> : null}
              </Row>
              <Row between style={{ marginTop: 4 }}>
                <Sub>{l.item_id ? `${l.unit || "unit"}` : "Goes into stock as a new item"}</Sub>
                <Money>{money(parseNum(l.qty) * parseNum(l.cost))}</Money>
              </Row>
            </View>
          ))}
          <Li last onPress={() => setPickItem(true)} testID="purchase-add-item">
            <Av icon="add" tone="green" />
            <View style={{ flex: 1 }}><H4>Add items</H4><Sub>Tick several from stock, or add new ones</Sub></View>
          </Li>
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Payment</Lbl>
        <Card style={{ gap: 8 }}>
          <Row style={{ gap: 6 }}>
            {(["credit", "cash", "transfer"] as const).map((m) => (
              <Chip key={m} label={m === "credit" ? "On credit" : m === "cash" ? "Cash" : "Transfer"} on={method === m} onPress={() => setMethod(m)} testID={`purchase-method-${m}`} />
            ))}
          </Row>
          <Field label="Paid now" placeholder="0" keyboardType="decimal-pad" mono value={paid} onChangeText={setPaid} testID="purchase-paid" />
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

      <View style={[s.bar, { paddingBottom: pad }]}>
        <Row between>
          <View><Lbl>Total · {parseNum(paid) >= total && total > 0 ? "paid" : "unpaid"}</Lbl><Text style={s.total} testID="purchase-total">{money(total)}</Text></View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Btn label={params.edit ? "Save the correction" : "Save purchase"} disabled={!supplierId || lines.length === 0 || badQty} loading={save.isPending} testID="purchase-save" onPress={() => save.mutate()} />
          </View>
        </Row>
      </View>

      <Sheet visible={pickSupplier} onClose={() => { setPickSupplier(false); setNewSupplier(false); }} testID="purchase-supplier-sheet">
        {newSupplier ? (
          <>
            <H4>New supplier</H4>
            <Sub style={{ marginTop: 3 }}>Just the name is enough. You come back to this purchase the moment it saves.</Sub>
            <View style={{ gap: 9, marginTop: 11 }}>
              <Field label="Supplier name" value={supName} onChangeText={setSupName} placeholder="Dangote Distributors" autoFocus testID="purchase-new-supplier-name" />
              <Field label="Phone" value={supPhone} onChangeText={setSupPhone} placeholder="+234 803 000 0000" keyboardType="phone-pad" testID="purchase-new-supplier-phone" />
            </View>
            <Sub style={{ marginTop: 9 }}>Address, email and opening balance can be filled in later on their profile.</Sub>
            <Row style={{ gap: 8, marginTop: 12 }}>
              <Btn small variant="ghost" label="Back" style={{ flex: 1 }} testID="purchase-new-supplier-back" onPress={() => setNewSupplier(false)} />
              <Btn small label="Save and use on this purchase" style={{ flex: 2 }} disabled={!supName.trim()} loading={addSupplier.isPending} testID="purchase-new-supplier-save"
                onPress={() => addSupplier.mutate({ name: supName.trim(), phone: supPhone.trim() })} />
            </Row>
          </>
        ) : (
          <>
            <H4>Who did you buy from?</H4>
            {!suppliers.data ? <Loading /> : (suppliers.data.suppliers ?? []).map((x: any, i: number, arr: any[]) => (
              <Li key={x.id} last={i === arr.length - 1} testID={`purchase-supplier-${x.id}`} onPress={() => { setSupplierId(x.id); setPickSupplier(false); }}>
                <Av text={initials(x.name)} tone="sq" />
                <View style={{ flex: 1 }}><H4>{x.name}</H4><Sub>{x.category}</Sub></View>
                <Money tone={x.owed > 0 ? "neg" : "mut"}>{money(x.owed)}</Money>
              </Li>
            ))}
            <Li last testID="purchase-new-supplier" onPress={() => setNewSupplier(true)}>
              <Av icon="add" tone="green" />
              <View style={{ flex: 1 }}><H4>New supplier</H4><Sub>Name and phone only — you stay on this purchase</Sub></View>
            </Li>
          </>
        )}
      </Sheet>

      <Sheet visible={pickItem} onClose={() => { setPickItem(false); setPicked([]); setSearch(""); }} testID="purchase-item-sheet">
        <H4>Add items</H4>
        <Sub style={{ marginTop: 3 }}>Tick everything that arrived, then set quantities and costs on the order.</Sub>
        <Field placeholder="Search stock" value={search} onChangeText={setSearch} style={{ marginTop: 10 }} testID="purchase-item-search" />
        <View style={{ maxHeight: 340, marginTop: 6 }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {(items.data ?? []).filter((it: any) => !search || it.name.toLowerCase().includes(search.toLowerCase())).slice(0, 200).map((it: any, i: number, arr: any[]) => {
              const on = picked.includes(it.id);
              return (
                <Li key={it.id} last={i === arr.length - 1} testID={`purchase-item-${it.id}`}
                  onPress={() => setPicked((p) => (on ? p.filter((x) => x !== it.id) : [...p, it.id]))}>
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.green700 : colors.ink40} />
                  <View style={{ flex: 1 }}><H4>{it.name}</H4><Sub>{it.quantity} {it.unit} on hand · cost {money(it.cost_price)}</Sub></View>
                </Li>
              );
            })}
          </ScrollView>
        </View>
        <Row style={{ gap: 8, marginTop: 12 }}>
          <Btn label="New item" variant="ghost" small style={{ flex: 1 }} testID="purchase-item-new" onPress={addNew} />
          <Btn label={picked.length ? `Add ${picked.length} item${picked.length > 1 ? "s" : ""}` : "Tick items to add"} small style={{ flex: 2 }}
            disabled={!picked.length} testID="purchase-items-add" onPress={addPicked} />
        </Row>
      </Sheet>
    </View>
  );
}
