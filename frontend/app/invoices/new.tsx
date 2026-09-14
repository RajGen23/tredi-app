// 04.3 → 04.4 → 04.5 New invoice, with 04.12 Add item, 04.13 Line item,
// 04.14 Quick add and 04.20 Discount on whole invoice.
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Check, Chip, Divider, Field, H4, IconBtn, Li, Lbl, Money, Prog, Row, Seg, Sub, Switch, Tag } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { initials, money, parseNum } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Line = { key: string; item_id?: string; name: string; quantity: number; unit_price: number; discount_type: "amount" | "percent"; discount_value: number; note: string; quick_add: boolean; unit: string; stock?: number; track?: boolean };
type DiscMode = "amount" | "percent" | "final";
const VAT = 7.5;

function calcLine(l: Line) {
  const gross = l.quantity * l.unit_price;
  const discount = l.discount_type === "percent" ? (gross * l.discount_value) / 100 : Math.min(l.discount_value, gross);
  return { gross, discount, total: gross - discount };
}
function calcTotals(lines: Line[], mode: DiscMode, value: number, vatOn: boolean) {
  const ls = lines.map(calcLine);
  const gross = ls.reduce((a, x) => a + x.gross, 0);
  const lineDisc = ls.reduce((a, x) => a + x.discount, 0);
  const after = gross - lineDisc;
  const rate = vatOn ? VAT : 0;
  let invDisc = mode === "percent" ? (after * value) / 100 : mode === "final" ? (value > 0 ? Math.max(0, after - value / (1 + rate / 100)) : 0) : Math.min(value, after);
  invDisc = Math.round(invDisc * 100) / 100;
  const taxable = after - invDisc;
  const vat = Math.round(taxable * rate) / 100;
  return { gross, lineDisc, invDisc, taxable, vat, total: taxable + vat, units: lines.reduce((a, l) => a + l.quantity, 0) };
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  faint: { backgroundColor: c.faint, paddingVertical: 8, paddingHorizontal: 11 },
  mintCard: { backgroundColor: c.brandTertiary, borderColor: c.mint2 },
  amberCard: { backgroundColor: c.warning, borderColor: "#F3E2BE" },
  qty: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: c.sqAv },
  qtyG: { backgroundColor: c.brandPrimary },
  strike: { textDecorationLine: "line-through" },
  discRow: { backgroundColor: c.brandTertiary, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 7, marginHorizontal: -7 },
  bigInput: { fontFamily: fonts.monoSemibold, fontSize: 26, color: c.onSurface, textAlign: "center", paddingVertical: 4 },
  green: { color: c.green700 },
  footer: { paddingTop: 10, paddingHorizontal: 14, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  search: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: c.onSurface, paddingVertical: 8 },
}));

export default function NewInvoice() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const params = useLocalSearchParams<{ customer_id?: string; from?: string }>();

  const customersQ = useQuery({ queryKey: ["customers"], queryFn: () => api<any[]>("/customers") });
  const itemsQ = useQuery({ queryKey: ["items"], queryFn: () => api<any[]>("/items") });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api("/accounts") });

  // A repeat purchase starts from an existing invoice instead of an empty basket.
  const repeatQ = useQuery({ queryKey: ["duplicate", params.from], queryFn: () => api(`/invoices/${params.from}/duplicate`), enabled: !!params.from });
  const [step, setStep] = useState<0 | 1 | 2>(params.customer_id || params.from ? 1 : 0);
  const [customerId, setCustomerId] = useState<string | null>(params.customer_id ?? null);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [pick, setPick] = useState(false);
  const [quick, setQuick] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [discOpen, setDiscOpen] = useState(false);
  const [discMode, setDiscMode] = useState<DiscMode>("amount");
  const [discValue, setDiscValue] = useState(0);
  const [discDraft, setDiscDraft] = useState("");
  const [vatOn, setVatOn] = useState(true);
  const [payMode, setPayMode] = useState<"credit" | "cash" | "transfer" | "card">("credit");
  const [dueDays, setDueDays] = useState(14);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    const r = repeatQ.data;
    if (!r || lines.length) return;
    setCustomerId(r.customer_id ?? null);
    setDiscMode(r.invoice_discount_type as DiscMode);
    setDiscValue(r.invoice_discount_value);
    setVatOn(!!r.vat_rate);
    setLines(r.lines.map((l: any, i: number) => ({
      key: `${l.item_id ?? l.name}-${i}`, item_id: l.item_id ?? undefined, name: l.name, quantity: l.quantity, unit_price: l.unit_price,
      discount_type: l.discount_type ?? "amount", discount_value: l.discount_value ?? 0, note: l.note ?? "", quick_add: !!l.quick_add,
      unit: l.unit ?? "", stock: l.stock ?? undefined, track: l.track ?? true,
    })));
    if (r.repriced?.length) toast.show(`${r.repriced.length} price${r.repriced.length === 1 ? "" : "s"} updated to today's rates`, "Repeat");
  }, [repeatQ.data]);

  const customer = customersQ.data?.find((c) => c.id === customerId);
  const wholesale = customer?.price_list === "Wholesale";
  const totals = useMemo(() => calcTotals(lines, discMode, discValue, vatOn), [lines, discMode, discValue, vatOn]);
  const draftTotals = useMemo(() => calcTotals(lines, discMode, parseNum(discDraft), vatOn), [lines, discMode, discDraft, vatOn]);
  const editing = lines.find((l) => l.key === editKey);

  const addItem = (it: any) => {
    const price = wholesale && it.wholesale_price ? it.wholesale_price : it.selling_price;
    setLines((ls) => {
      const ex = ls.find((l) => l.item_id === it.id);
      if (ex) return ls.map((l) => (l.item_id === it.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { key: `${it.id}-${Date.now()}`, item_id: it.id, name: it.name, quantity: 1, unit_price: price, discount_type: "amount", discount_value: 0, note: "", quick_add: false, unit: it.unit, stock: it.quantity, track: it.track_stock }];
    });
    setPick(false);
    setAddOpen(false);
  };
  const bump = (key: string, d: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity: Math.max(0, l.quantity + d) } : l)).filter((l) => l.quantity > 0));

  const save = useMutation({
    mutationFn: (status: "draft" | "issued") => api("/invoices", { method: "POST", json: {
      customer_id: customerId, lines: lines.map(({ key, stock, track, ...l }) => l), invoice_discount_type: discMode, invoice_discount_value: discValue, vat_rate: vatOn ? VAT : 0,
      due_date: dayjs().add(dueDays, "day").format("YYYY-MM-DD"), payment_mode: payMode, account_id: payMode !== "credit" ? accountId ?? accountsQ.data?.accounts?.[0]?.id ?? null : null, status,
    } }),
    onSuccess: (inv: any, status) => {
      ["invoices", "customers", "items", "dashboard", "accounts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.show(status === "draft" ? "Draft saved" : `${inv.number} raised for ${money(inv.totals.total)}`, status === "draft" ? undefined : "Sent.");
      router.replace(`/invoices/${inv.id}`);
    },
    onError: (e: Error) => toast.show(e.message),
  });

  const filteredCustomers = (customersQ.data ?? []).filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const filteredItems = (itemsQ.data ?? []).filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-invoice-screen">
      <AppBar title={step === 0 ? "New invoice" : step === 1 ? "Items" : "Review & send"} close={step === 0} back={step > 0} onBack={() => (step > 0 ? setStep((step - 1) as 0 | 1) : router.back())}
        rightText={step === 0 ? "Save draft" : undefined} onRightText={() => (lines.length ? save.mutate("draft") : toast.show("Add an item before saving a draft"))}
        right={step === 1 ? <IconBtn name="camera-outline" testID="items-photo-toggle" /> : undefined} />

      {/* progress */}
      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 14, marginBottom: 10 }}>
        {["1 Customer", "2 Items", "3 Review"].map((t, i) => (
          <View key={t} style={{ flex: 1 }}><Prog pct={i <= step ? 100 : 0} /><Tag style={{ marginTop: 4 }}>{t}</Tag></View>
        ))}
      </View>

      {step === 0 ? (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            <Field testID="invoice-customer-search" label="Bill to" value={search} onChangeText={setSearch} placeholder="Search or add a customer" autoFocus />
            <Card style={{ marginTop: 8, paddingVertical: 4 }}>
              <Li testID="invoice-new-customer" onPress={() => router.push("/customers/new")}>
                <Av icon="add" tone="green" /><View style={{ flex: 1 }}><H4>New customer</H4><Sub>Add name and phone only</Sub></View>
              </Li>
              {filteredCustomers.map((c, i) => (
                <Li key={c.id} testID={`invoice-pick-customer-${c.id}`} last={i === filteredCustomers.length - 1} onPress={() => { setCustomerId(c.id); setSearch(""); setStep(1); }}>
                  <Av text={initials(c.name)} tone={customerId === c.id ? "green" : "mint"} />
                  <View style={{ flex: 1 }}><H4>{c.name}</H4><Sub>{c.price_list} · {c.balance > 0 ? `owes ${money(c.balance)}` : c.balance < 0 ? `${money(-c.balance)} credit` : "settled"}</Sub></View>
                  {customerId === c.id ? <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} /> : null}
                </Li>
              ))}
            </Card>
            <Card style={[s.mintCard, { marginTop: 12 }]}><Sub><Text style={{ fontFamily: fonts.bold }}>Walk-in?</Text> Skip this step and invoice to “Cash sale”. You can attach a customer later.</Sub></Card>
          </ScrollView>
          <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Btn testID="invoice-continue-items" label={customerId ? "Continue to items" : "Continue as cash sale"} onPress={() => setStep(1)} />
          </View>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            <Card style={[s.faint, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
              <Av text={customer ? initials(customer.name) : "—"} size={24} tone={customer ? "mint" : "sq"} />
              <View style={{ flex: 1 }}><H4 style={{ fontSize: 12.5 }}>{customer?.name ?? "Cash sale"}</H4><Tag>{wholesale ? "Wholesale prices applied" : "Retail prices"}</Tag></View>
              <Chip label="Change" onPress={() => setStep(0)} testID="invoice-change-customer" />
            </Card>
            <Pressable testID="invoice-add-item-field" onPress={() => setAddOpen(true)} style={{ marginTop: 9 }}>
              <View style={{ backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: 11, paddingHorizontal: 12, minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="search-outline" size={16} color={colors.ink60} />
                <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.ink40 }}>Search item or scan barcode</Text>
                <Ionicons name="barcode-outline" size={18} color={colors.ink60} />
              </View>
            </Pressable>
            <View style={{ gap: 6, marginTop: 9 }}>
              {lines.map((l) => {
                const t = calcLine(l);
                const short = l.track && l.stock !== undefined && l.quantity > l.stock;
                return (
                  <Card key={l.key} style={[{ paddingVertical: 10, paddingHorizontal: 11 }, short && s.amberCard]} testID={`invoice-line-${l.key}`}>
                    <Row between>
                      <Pressable style={{ flex: 1 }} onPress={() => setEditKey(l.key)} testID={`invoice-line-edit-${l.key}`}><H4>{l.name}</H4><Sub>{money(l.unit_price)} · {l.quick_add ? "quick add" : wholesale ? "wholesale" : "retail"}</Sub></Pressable>
                      <Row style={{ gap: 8 }}>
                        <Pressable testID={`line-minus-${l.key}`} onPress={() => bump(l.key, -1)} style={s.qty}><Ionicons name="remove" size={14} color={colors.ink60} /></Pressable>
                        <Money size={12}>{l.quantity}</Money>
                        <Pressable testID={`line-plus-${l.key}`} onPress={() => bump(l.key, 1)} style={[s.qty, s.qtyG]}><Ionicons name="add" size={14} color={colors.onSurfaceInverse} /></Pressable>
                      </Row>
                    </Row>
                    <Row between style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: short ? "#F3E2BE" : colors.border }}>
                      <Row style={{ gap: 5 }}>
                        {short ? <Tag style={{ color: colors.amber }}>Only {l.stock} in stock</Tag> : t.discount > 0 ? <Badge tone="paid">− {money(t.discount)}</Badge> : l.track && l.stock !== undefined ? <Tag>{l.stock} in stock</Tag> : null}
                        <Pressable onPress={() => setEditKey(l.key)}><Tag style={t.discount > 0 ? undefined : s.green}>{t.discount > 0 ? (l.note ? "✎ note" : "✎ edit") : "＋ add discount"}</Tag></Pressable>
                      </Row>
                      <Text>{t.discount > 0 ? <Tag style={s.strike}>{money(t.gross, { symbol: false })} </Tag> : null}<Money size={12.5}>{money(t.total)}</Money></Text>
                    </Row>
                  </Card>
                );
              })}
              {lines.length === 0 ? <Card style={{ borderStyle: "dashed", alignItems: "center", paddingVertical: 22 }}><Sub>No items yet. Tap the search bar to add one.</Sub></Card> : null}
            </View>
          </ScrollView>
          <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Row between style={{ marginBottom: 3 }}><Sub>{lines.length} items · {totals.units} units</Sub><Money tone="mut" size={11.5}>{money(totals.gross)}</Money></Row>
            <Row between style={{ marginBottom: 8 }}><Sub>After discount</Sub><Money size={16} testID="items-after-discount">{money(totals.gross - totals.lineDisc)}</Money></Row>
            <Btn testID="invoice-review" label="Review invoice" onPress={() => (lines.length ? setStep(2) : setAddOpen(true))} />
          </View>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }}>
            <Card style={[s.faint, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
              <Av text={customer ? initials(customer.name) : "—"} size={24} tone={customer ? "mint" : "sq"} />
              <View style={{ flex: 1 }}><H4 style={{ fontSize: 12.5 }}>{customer?.name ?? "Cash sale"}</H4><Tag>{customer?.phone || "No phone on file"}</Tag></View>
              <Chip label="Edit" onPress={() => setStep(0)} testID="review-edit-customer" />
            </Card>
            <Card style={{ marginTop: 9, paddingVertical: 4 }}>
              {lines.map((l, i) => <Li key={l.key} last={i === lines.length - 1}><View style={{ flex: 1 }}><H4>{l.name}</H4><Tag>{l.quantity} × {money(l.unit_price, { symbol: false })}</Tag></View><Money>{money(calcLine(l).total, { symbol: false })}</Money></Li>)}
            </Card>
            <Card style={{ marginTop: 9 }} testID="review-totals">
              <Row between style={{ marginBottom: 5 }}><Sub>Gross</Sub><Money>{money(totals.gross)}</Money></Row>
              <Row between style={{ marginBottom: 5 }}><Sub>Line discounts <Tag>{lines.filter((l) => calcLine(l).discount > 0).length} item</Tag></Sub><Money tone="pos">− {money(totals.lineDisc)}</Money></Row>
              <Pressable testID="review-invoice-discount" onPress={() => { setDiscDraft(discValue ? String(discValue) : ""); setDiscOpen(true); }}>
                <Row between style={[s.discRow, { marginBottom: 5 }]}>
                  <H4 style={s.green}>{totals.invDisc > 0 ? "Discount on whole invoice" : "＋ Discount on whole invoice"}</H4>
                  {totals.invDisc > 0 ? <Money tone="pos">− {money(totals.invDisc)}</Money> : <Tag style={s.green}>Add ›</Tag>}
                </Row>
              </Pressable>
              <Row between style={{ marginBottom: 5 }}>
                <Row style={{ gap: 8 }}><Sub>VAT {VAT}%</Sub><Switch on={vatOn} onChange={setVatOn} testID="review-vat-toggle" /></Row>
                <Money>{money(totals.vat)}</Money>
              </Row>
              <Divider />
              <Row between><H4>Total</H4><Money size={16} testID="review-total">{money(totals.total)}</Money></Row>
            </Card>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
              <Field label="Due date" value={dayjs().add(dueDays, "day").format("DD MMM YYYY")} mono onPress={() => setDueDays(dueDays === 14 ? 30 : dueDays === 30 ? 7 : 14)} style={{ flex: 1 }} testID="review-due-date" />
              <Field label="Payment" value={payMode === "credit" ? "On credit" : payMode[0].toUpperCase() + payMode.slice(1)} onPress={() => setPayMode(payMode === "credit" ? "cash" : payMode === "cash" ? "transfer" : payMode === "transfer" ? "card" : "credit")} right={<Sub>⌄</Sub>} style={{ flex: 1 }} testID="review-payment-mode" />
            </View>
            <Card style={{ marginTop: 8, paddingVertical: 2 }}>
              <Li testID="review-pay-into" onPress={() => { const accs = accountsQ.data?.accounts ?? []; const idx = accs.findIndex((a: any) => a.id === accountId); setAccountId(accs[(idx + 1) % Math.max(1, accs.length)]?.id ?? null); }}>
                <Av icon="card-outline" tone="sq" size={24} /><View style={{ flex: 1 }}><H4 style={{ fontSize: 12.5 }}>Pay into</H4><Tag>{(accountsQ.data?.accounts ?? []).find((a: any) => a.id === accountId)?.name ?? accountsQ.data?.accounts?.[0]?.name ?? "Cash till"} · {Math.max(0, (accountsQ.data?.accounts?.length ?? 1) - 1)} other accounts</Tag></View><Ionicons name="chevron-down" size={14} color={colors.ink40} />
              </Li>
              <Li><Av icon="document-text-outline" tone="sq" size={24} /><View style={{ flex: 1 }}><H4 style={{ fontSize: 12.5 }}>Terms of payment</H4><Tag>Head office terms · 3 sections</Tag></View><Ionicons name="chevron-down" size={14} color={colors.ink40} /></Li>
              <Li last><Av icon="image-outline" tone="sq" size={24} /><View style={{ flex: 1 }}><H4 style={{ fontSize: 12.5 }}>Show item photos</H4><Tag>Off — no photos on these items</Tag></View><Switch on={false} /></Li>
            </Card>
          </ScrollView>
          <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Btn small variant="ghost" label="Save draft" style={{ flex: 1 }} onPress={() => save.mutate("draft")} loading={save.isPending && save.variables === "draft"} testID="review-save-draft" />
              <Btn small label="Save & send" style={{ flex: 1 }} icon="logo-whatsapp" onPress={() => save.mutate("issued")} loading={save.isPending && save.variables === "issued"} testID="review-send" />
            </View>
          </View>
        </>
      ) : null}

      {/* 04.12 Add item */}
      <Sheet visible={addOpen} onClose={() => { setAddOpen(false); setPick(false); }} testID="add-item-sheet">
        {!pick ? (
          <>
            <H4>Add item</H4>
            <View style={{ gap: 6, marginTop: 11 }}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 }} testID="add-item-scan"><Av icon="barcode-outline" tone="sq" size={32} /><View style={{ flex: 1 }}><H4>Scan bar code</H4><Sub>Fastest at the counter</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} /></Card>
              <Pressable testID="add-item-inventory" onPress={() => setPick(true)}><Card style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 }}><Av icon="cube-outline" tone="sq" size={32} /><View style={{ flex: 1 }}><H4>Choose from inventory</H4><Sub>{itemsQ.data?.length ?? 0} items · search by name or brand</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} /></Card></Pressable>
              <Pressable testID="add-item-quick" onPress={() => { setAddOpen(false); setTimeout(() => setQuick(true), 200); }}><Card style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderColor: colors.brandPrimary }}><Av icon="add" tone="green" size={32} /><View style={{ flex: 1 }}><H4>Quick add</H4><Sub>Something you don’t keep in stock</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} /></Card></Pressable>
            </View>
          </>
        ) : (
          <>
            <Row between><H4>Choose from inventory</H4><Pressable onPress={() => setPick(false)}><Sub style={[s.green, { fontFamily: fonts.bold }]}>Back</Sub></Pressable></Row>
            <View style={{ backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: 11, paddingHorizontal: 12, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="search-outline" size={16} color={colors.ink60} />
              <TextInput testID="inventory-search" value={search} onChangeText={setSearch} placeholder="Search by name" placeholderTextColor={colors.ink40} style={s.search} autoFocus />
            </View>
            <View style={{ maxHeight: 360, marginTop: 8 }}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {filteredItems.map((it, i) => (
                  <Li key={it.id} testID={`inventory-pick-${it.id}`} last={i === filteredItems.length - 1} onPress={() => addItem(it)}>
                    <Av icon={it.kind === "service" ? "construct-outline" : "cube-outline"} tone="sq" />
                    <View style={{ flex: 1 }}><H4>{it.name}</H4><Sub>{it.track_stock ? `${it.quantity} in stock` : "Service"} · {it.category}</Sub></View>
                    <Money>{money(wholesale && it.wholesale_price ? it.wholesale_price : it.selling_price)}</Money>
                  </Li>
                ))}
              </ScrollView>
            </View>
          </>
        )}
      </Sheet>

      {/* 04.14 Quick add */}
      <QuickAdd visible={quick} onClose={() => setQuick(false)} onAdd={(l) => { setLines((ls) => [...ls, l]); setQuick(false); }} />

      {/* 04.13 Line item details */}
      {editing ? <LineEditor line={editing} onClose={() => setEditKey(null)} onSave={(l) => { setLines((ls) => ls.map((x) => (x.key === l.key ? l : x))); setEditKey(null); }} onRemove={() => { setLines((ls) => ls.filter((x) => x.key !== editing.key)); setEditKey(null); }} /> : null}

      {/* 04.20 Discount on whole invoice */}
      <Sheet visible={discOpen} onClose={() => setDiscOpen(false)} testID="invoice-discount-sheet">
        <Row between><H4>Discount on whole invoice</H4><Tag>{customer?.name ?? "Cash sale"}</Tag></Row>
        <View style={{ marginTop: 11 }}><Seg testID="disc-mode" value={discMode} onChange={(m) => { setDiscMode(m); setDiscDraft(""); }} options={[{ key: "amount", label: "₦ off" }, { key: "percent", label: "% off" }, { key: "final", label: "Final total" }]} /></View>
        <View style={{ marginTop: 10, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: 11, padding: 12, alignItems: "center" }}>
          <Lbl>{discMode === "final" ? "Make the total" : "Take off"}</Lbl>
          <TextInput testID="disc-input" value={discDraft} onChangeText={setDiscDraft} keyboardType="decimal-pad" placeholder={discMode === "percent" ? "0 %" : "₦ 0"} placeholderTextColor={colors.ink40} style={s.bigInput} autoFocus />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {(discMode === "percent" ? ["5", "10", "15"] : discMode === "final" ? [String(Math.floor(totals.total / 10000) * 10000), String(Math.floor(totals.total / 1000) * 1000)] : ["5000", "10000", "20000"]).map((v) => <Chip key={v} label={discMode === "percent" ? `${v}%` : money(Number(v))} on={discDraft === v} onPress={() => setDiscDraft(v)} testID={`disc-preset-${v}`} />)}
          {discMode !== "final" ? <Chip label="Round down" onPress={() => { setDiscMode("final"); setDiscDraft(String(Math.floor(totals.total / 1000) * 1000)); }} /> : null}
        </View>
        <Card style={{ marginTop: 11, paddingVertical: 10 }}>
          <Row between style={{ paddingVertical: 3 }}><Sub>Gross</Sub><Money>{money(draftTotals.gross)}</Money></Row>
          <Row between style={{ paddingVertical: 3 }}><Sub>Line discounts</Sub><Money tone="pos">− {money(draftTotals.lineDisc)}</Money></Row>
          <Row between style={{ paddingVertical: 3 }}><Sub>This discount</Sub><Money tone="pos">− {money(draftTotals.invDisc)}</Money></Row>
          <Row between style={{ paddingTop: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border }}><Sub>Taxable amount</Sub><Money>{money(draftTotals.taxable)}</Money></Row>
          <Row between style={{ paddingVertical: 3 }}><Sub>VAT {vatOn ? VAT : 0}%</Sub><Money>{money(draftTotals.vat)}</Money></Row>
          <Row between style={[s.discRow, { marginTop: 7, paddingVertical: 8, paddingHorizontal: 10, marginHorizontal: 0 }]}>
            <View><Lbl>New total</Lbl><Money size={17} testID="disc-new-total">{money(draftTotals.total)}</Money></View>
            <View style={{ alignItems: "flex-end" }}><Tag style={s.strike}>{money(calcTotals(lines, "amount", 0, vatOn).total, { symbol: false })}</Tag><Tag style={s.green}>saves {money(calcTotals(lines, "amount", 0, vatOn).total - draftTotals.total)}</Tag></View>
          </Row>
          <Tag style={{ marginTop: 7, lineHeight: 15 }}>VAT is charged after the discount, never before.</Tag>
        </Card>
        {draftTotals.invDisc > 0 && (draftTotals.invDisc / (draftTotals.gross - draftTotals.lineDisc)) * 100 > 5 ? (
          <Card style={[s.amberCard, { marginTop: 9, paddingVertical: 9 }]}><Row style={{ alignItems: "flex-start", gap: 8 }}><Text style={{ color: colors.amber, fontFamily: fonts.bold }}>!</Text><Sub style={{ flex: 1 }}>That is <Text style={{ fontFamily: fonts.bold }}>{((draftTotals.invDisc / (draftTotals.gross - draftTotals.lineDisc)) * 100).toFixed(1)}%</Text> — above the 5% staff limit. As owner you can apply it directly.</Sub></Row></Card>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Btn small variant="ghost" label={discValue ? "Remove" : "Cancel"} style={{ flex: 1 }} onPress={() => { setDiscValue(0); setDiscOpen(false); }} testID="disc-cancel" />
          <Btn small label="Apply discount" style={{ flex: 1 }} onPress={() => { setDiscValue(parseNum(discDraft)); setDiscOpen(false); }} testID="disc-apply" />
        </View>
      </Sheet>
    </View>
  );
}

function LineEditor({ line, onClose, onSave, onRemove }: { line: Line; onClose: () => void; onSave: (l: Line) => void; onRemove: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [price, setPrice] = useState(String(line.unit_price));
  const [qty, setQty] = useState(String(line.quantity));
  const [dtype, setDtype] = useState<"amount" | "percent">(line.discount_type);
  const [dval, setDval] = useState(line.discount_value ? String(line.discount_value) : "");
  const [note, setNote] = useState(line.note);
  const draft: Line = { ...line, unit_price: parseNum(price), quantity: parseNum(qty) || 1, discount_type: dtype, discount_value: parseNum(dval), note };
  const t = calcLine(draft);
  const pct = t.gross ? ((t.discount / t.gross) * 100).toFixed(1) : "0";
  return (
    <Sheet visible onClose={onClose} testID="line-item-sheet">
      <AppBar close title={line.name} onBack={onClose} rightText="Save" onRightText={() => onSave(draft)} testID="line-editor-appbar" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom }}>
        <Card style={[s.faint, { flexDirection: "row", alignItems: "center", gap: 8 }]}><Av icon="cube-outline" tone="sq" /><View><H4 style={{ fontSize: 12.5 }}>{line.unit || "Unit"}</H4><Tag>{line.track && line.stock !== undefined ? `${line.stock} in stock` : line.quick_add ? "quick add" : "not tracked"}</Tag></View></Card>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
          <Field label="Selling price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" mono style={{ flex: 1 }} testID="line-price" />
          <Field label="Quantity" value={qty} onChangeText={setQty} keyboardType="decimal-pad" mono style={{ flex: 1 }} testID="line-qty" />
        </View>
        <Card style={{ marginTop: 9 }}>
          <Row between><Lbl>Discount</Lbl><View style={{ width: 100 }}><Seg testID="line-disc-type" value={dtype} onChange={setDtype} options={[{ key: "amount", label: "₦" }, { key: "percent", label: "%" }]} /></View></Row>
          <Field value={dval} onChangeText={setDval} keyboardType="decimal-pad" mono placeholder="0" style={{ marginTop: 7 }} testID="line-disc-value" />
          <Row between style={{ marginTop: 7 }}><Sub>That is {pct}% off the line</Sub><Money tone="pos">{money(t.total)}</Money></Row>
        </Card>
        <Field label="Note on this item" value={note} onChangeText={setNote} placeholder="Prints under the item name" multiline style={{ marginTop: 9 }} testID="line-note" right={<Tag>{note.length} / 650</Tag>} />
        <Sub style={{ marginTop: 7 }}>Notes print under the item name on the invoice.</Sub>
        <Btn label={`Update line — ${money(t.total)}`} onPress={() => onSave(draft)} style={{ marginTop: 12 }} testID="line-update" />
        <Pressable onPress={onRemove} style={{ alignSelf: "center", marginTop: 12, padding: 6 }} testID="line-remove"><Sub style={{ color: colors.coral, fontFamily: fonts.bold }}>Remove from invoice</Sub></Pressable>
      </KeyboardAwareScrollView>
    </Sheet>
  );
}

function QuickAdd({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (l: Line) => void }) {
  const s = useStyles();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("Service");
  const [note, setNote] = useState("");
  const [saveInv, setSaveInv] = useState(false);
  const total = parseNum(price) * (parseNum(qty) || 1);
  const add = async () => {
    if (!name || !price) return;
    let item_id: string | undefined;
    if (saveInv) {
      const it: any = await api("/items", { method: "POST", json: { name, kind: unit === "Service" ? "service" : "product", unit, selling_price: parseNum(price), track_stock: false } });
      item_id = it.id;
      qc.invalidateQueries({ queryKey: ["items"] });
    }
    onAdd({ key: `q-${Date.now()}`, item_id, name, quantity: parseNum(qty) || 1, unit_price: parseNum(price), discount_type: "amount", discount_value: 0, note, quick_add: true, unit, track: false });
    setName(""); setPrice(""); setQty("1"); setNote("");
  };
  return (
    <Sheet visible={visible} onClose={onClose} testID="quick-add-sheet">
      <AppBar back title="Quick add" onBack={onClose} />
      <Card style={[s.mintCard, { paddingVertical: 9 }]}><Sub>For something you don’t stock — a one-off supply, a delivery charge, a service. It won’t affect your stock counts.</Sub></Card>
      <View style={{ gap: 9, marginTop: 9 }}>
        <Field label="Item name" value={name} onChangeText={setName} placeholder="Roofing sheet cutting" autoFocus testID="quick-name" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Field label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" mono placeholder="₦ 0" style={{ flex: 1 }} testID="quick-price" />
          <Field label="Quantity" value={qty} onChangeText={setQty} keyboardType="decimal-pad" mono style={{ flex: 1 }} testID="quick-qty" />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Field label="Unit" value={unit} onPress={() => setUnit(unit === "Service" ? "Piece" : unit === "Piece" ? "Bag" : "Service")} right={<Sub>⌄</Sub>} style={{ flex: 1 }} testID="quick-unit" />
          <Field label="Tax (VAT) %" value="7.5" onPress={() => {}} mono style={{ flex: 1 }} />
        </View>
        <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional — prints under the name" testID="quick-note" />
      </View>
      <Card style={{ marginTop: 9, flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ flex: 1 }}><H4>Also save to inventory</H4><Sub>Keep it for next time, with stock tracking off</Sub></View><Switch on={saveInv} onChange={setSaveInv} testID="quick-save-inventory" /></Card>
      <Card style={[s.faint, { marginTop: 9, flexDirection: "row", gap: 8, alignItems: "center" }]}><Badge tone="info">Quick add</Badge><Sub style={{ flex: 1 }}>Lines like this are tagged on the invoice and in reports, so stock valuation stays honest.</Sub></Card>
      <Btn label={`Add to invoice — ${money(total)}`} onPress={add} disabled={!name || !price} style={{ marginTop: 12 }} testID="quick-add-submit" />
    </Sheet>
  );
}

export { Check };
