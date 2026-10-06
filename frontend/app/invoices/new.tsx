// 04.3 → 04.4 → 04.5 New invoice, with 04.12 Add item, 04.13 Line item,
// 04.14 Quick add and 04.20 Discount on whole invoice.
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppBar, Av, Badge, Btn, Card, Check, Chip, Divider, Field, H4, IconBtn, Li, Lbl, Money, Prog, Row, Seg, Sub, Switch, Tag } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { AccountForm } from "@/src/components/account-form";
import { DateField } from "@/src/components/date-field";
import { PickerField } from "@/src/components/picker";
import { Scanner, ScanMode } from "@/src/components/scanner";
import { ScanResultSheet } from "@/src/components/scan-result";
import { group, initials, money, parseNum, sym } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Line = { key: string; item_id?: string; name: string; quantity: number; unit_price: number; discount_type: "amount" | "percent"; discount_value: number; note: string; quick_add: boolean; unit: string; photo_url?: string; stock?: number; track?: boolean };
type DiscMode = "amount" | "percent" | "final";
const VAT = 7.5;
const PAY_MODES = [
  { key: "credit", label: "On credit", sub: "Customer pays later" },
  { key: "cash", label: "Cash", sub: "Money in the till now" },
  { key: "transfer", label: "Bank transfer", sub: "Straight into an account" },
  { key: "card", label: "Card", sub: "POS terminal" },
];

function calcLine(l: Line) {
  const gross = l.quantity * l.unit_price;
  const discount = l.discount_type === "percent" ? (gross * l.discount_value) / 100 : Math.min(l.discount_value, gross);
  return { gross, discount, total: gross - discount };
}
function calcTotals(lines: Line[], mode: DiscMode, value: number, vatOn: boolean, shipping = 0) {
  const ls = lines.map(calcLine);
  const gross = ls.reduce((a, x) => a + x.gross, 0);
  const lineDisc = ls.reduce((a, x) => a + x.discount, 0);
  const after = gross - lineDisc;
  const rate = vatOn ? VAT : 0;
  let invDisc = mode === "percent" ? (after * value) / 100 : mode === "final" ? (value > 0 ? Math.max(0, after - value / (1 + rate / 100)) : 0) : Math.min(value, after);
  invDisc = Math.round(invDisc * 100) / 100;
  const taxable = after - invDisc;
  const vat = Math.round(taxable * rate) / 100;
  const ship = Math.max(0, shipping);
  return { gross, lineDisc, invDisc, discTotal: lineDisc + invDisc, taxable, vat, shipping: ship,
    total: taxable + vat + ship, units: lines.reduce((a, l) => a + l.quantity, 0) };
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
  const pad = useBottomPad();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ customer_id?: string; from?: string; edit?: string }>();
  const editId = params.edit || "";

  const customersQ = useQuery({ queryKey: ["customers"], queryFn: () => api<any[]>("/customers") });
  const itemsQ = useQuery({ queryKey: ["items"], queryFn: () => api<any[]>("/items") });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api("/accounts") });
  const termsQ = useQuery({ queryKey: ["terms"], queryFn: () => api<any[]>("/terms") });
  const settingsQ = useQuery({ queryKey: ["invoice-settings"], queryFn: () => api("/settings/invoice") });
  const teamQ = useQuery({ queryKey: ["team"], queryFn: () => api("/team") });
  const editQ = useQuery({ queryKey: ["invoice", editId], queryFn: () => api(`/invoices/${editId}`), enabled: !!editId });

  // A repeat purchase starts from an existing invoice instead of an empty basket.
  const repeatQ = useQuery({ queryKey: ["duplicate", params.from], queryFn: () => api(`/invoices/${params.from}/duplicate`), enabled: !!params.from });
  const [step, setStep] = useState<0 | 1 | 2>(params.customer_id || params.from || params.edit ? 1 : 0);
  const [customerId, setCustomerId] = useState<string | null>(params.customer_id ?? null);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [pick, setPick] = useState(false);
  const [quick, setQuick] = useState(false);
  const [newCust, setNewCust] = useState(false);
  const [scan, setScan] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>("add");
  const [scanCode, setScanCode] = useState("");
  const [scanItem, setScanItem] = useState<any | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [discOpen, setDiscOpen] = useState(false);
  const [discMode, setDiscMode] = useState<DiscMode>("amount");
  const [discValue, setDiscValue] = useState(0);
  const [discDraft, setDiscDraft] = useState("");
  const [vatOn, setVatOn] = useState(true);
  const [payMode, setPayMode] = useState<"credit" | "cash" | "transfer" | "card">("credit");
  const [issueDate, setIssueDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [dueDate, setDueDate] = useState("");
  const [rep, setRep] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [shipping, setShipping] = useState("");
  const [bankIds, setBankIds] = useState<string[]>([]);
  const [banksOpen, setBanksOpen] = useState(false);
  const [addBank, setAddBank] = useState(false);
  const [termsOn, setTermsOn] = useState(true);
  const [termsId, setTermsId] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [useCredit, setUseCredit] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const photosAllowed = (settingsQ.data as any)?.photos_allowed;
  const summaryQ = useQuery({ queryKey: ["customer-summary", customerId], queryFn: () => api(`/customers/${customerId}/summary`), enabled: !!customerId });
  const summary: any = summaryQ.data;

  useEffect(() => { if (!rep && user?.name) setRep(user.name); }, [user?.name, rep]);

  useEffect(() => {
    const st: any = settingsQ.data;
    if (!st) return;
    setShowPhotos((v) => (v ? v : !!st.show_photos));
    setBankIds((ids) => (ids.length ? ids : st.default_bank_account_id ? [st.default_bank_account_id] : []));
    setDueDate((d) => d || dayjs().add(st.due_days ?? 7, "day").format("YYYY-MM-DD"));
  }, [settingsQ.data]);

  // Correcting an existing invoice: the same document is loaded, edited and saved back.
  useEffect(() => {
    const inv: any = editQ.data;
    if (!inv || lines.length) return;
    setCustomerId(inv.customer_id ?? null);
    setDiscMode((inv.invoice_discount_type ?? "amount") as DiscMode);
    setDiscValue(inv.invoice_discount_value ?? 0);
    setVatOn(!!inv.vat_rate);
    setPayMode(inv.payment_mode ?? "credit");
    setAccountId(inv.account_id ?? null);
    setRep(inv.rep || inv.created_by || "");
    setIssueDate(dayjs(inv.created_at).format("YYYY-MM-DD"));
    if (inv.due_date) setDueDate(dayjs(inv.due_date).format("YYYY-MM-DD"));
    setShipping(inv.totals?.shipping ? String(inv.totals.shipping) : "");
    setBankIds(inv.bank_account_ids ?? []);
    setTermsId(inv.terms_id ?? null);
    setTermsOn(!!inv.terms_id);
    setShowPhotos(!!inv.show_photos);
    setLines((inv.lines ?? []).map((l: any, i: number) => ({
      key: `${l.item_id ?? l.name}-${i}`, item_id: l.item_id ?? undefined, name: l.name, quantity: l.quantity, unit_price: l.unit_price,
      discount_type: l.discount_type ?? "amount", discount_value: l.discount_value ?? 0, note: l.note ?? "", quick_add: !!l.quick_add,
      unit: l.unit ?? "", photo_url: l.photo_url ?? "", track: true,
    })));
  }, [editQ.data, lines.length]);

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
      unit: l.unit ?? "", photo_url: l.photo_url ?? "", stock: l.stock ?? undefined, track: l.track ?? true,
    })));
    if (r.repriced?.length) toast.show(`${r.repriced.length} price${r.repriced.length === 1 ? "" : "s"} updated to today's rates`, "Repeat");
  }, [repeatQ.data]);

  const customer = customersQ.data?.find((c) => c.id === customerId);
  const wholesale = customer?.price_list === "Wholesale";
  const ship = parseNum(shipping);
  const totals = useMemo(() => calcTotals(lines, discMode, discValue, vatOn, ship), [lines, discMode, discValue, vatOn, ship]);
  const credit = Math.max(0, -(summary?.balance ?? customer?.balance ?? 0));
  const creditUsed = useCredit ? Math.min(credit, totals.total) : 0;
  // A credit limit warns, it never blocks — the person at the counter decides.
  const limit: number | null = summary?.credit_limit ?? null;
  const afterBalance = (summary?.balance ?? 0) + totals.total;
  const overLimit = !!limit && afterBalance > limit;
  const repOptions = ((teamQ.data as any)?.users ?? []).filter((u: any) => u.active !== false)
    .map((u: any) => ({ key: u.name, label: u.name, sub: u.role_label }));
  const accounts: any[] = (accountsQ.data as any)?.accounts ?? [];
  const accountOptions = accounts.map((a: any) => ({ key: a.id, label: a.name, sub: a.detail || a.kind }));
  const shopTerms = (termsQ.data ?? []).filter((t) => !t.shop || t.shop === (customer?.shop ?? "") || !customer);
  const terms = shopTerms.find((t) => t.id === termsId) ?? shopTerms.find((t) => t.is_default) ?? shopTerms[0];
  const draftTotals = useMemo(() => calcTotals(lines, discMode, parseNum(discDraft), vatOn), [lines, discMode, discDraft, vatOn]);
  const editing = lines.find((l) => l.key === editKey);

  const addItem = (it: any) => {
    const price = wholesale && it.wholesale_price ? it.wholesale_price : it.selling_price;
    setLines((ls) => {
      const ex = ls.find((l) => l.item_id === it.id);
      if (ex) return ls.map((l) => (l.item_id === it.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { key: `${it.id}-${Date.now()}`, item_id: it.id, name: it.name, quantity: 1, unit_price: price, discount_type: "amount", discount_value: 0, note: "", quick_add: false, unit: it.unit, photo_url: it.photo_url ?? "", stock: it.quantity, track: it.track_stock }];
    });
    setPick(false);
    setAddOpen(false);
  };
  const bump = (key: string, d: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity: Math.max(0, l.quantity + d) } : l)).filter((l) => l.quantity > 0));

  // Scanning straight onto the invoice. In Add mode each scan drops a line in
  // and the camera stays open; in Price check mode nothing is touched until the
  // person at the counter taps Add. An unknown code offers to create the item.
  const onScan = (code: string) => {
    const hit = (itemsQ.data ?? []).find((i) => String(i.barcode ?? "").trim() === code) ?? null;
    if (scanMode === "price" || !hit) {
      setScan(false);
      setScanCode(code);
      setScanItem(hit);
      if (!hit) toast.show("No item carries that bar code yet");
      return;
    }
    addItem(hit);
    toast.show(`${hit.name} added · ${money(wholesale && hit.wholesale_price ? hit.wholesale_price : hit.selling_price)}`);
  };
  const closeScanResult = () => { setScanCode(""); setScanItem(null); };
  const openScanner = () => { setAddOpen(false); setPick(false); setScan(true); };

  const body = (status: "draft" | "issued") => ({
    customer_id: customerId, lines: lines.map(({ key, stock, track, ...l }) => l), invoice_discount_type: discMode,
    invoice_discount_value: discValue, vat_rate: vatOn ? VAT : 0, issue_date: issueDate,
    due_date: dueDate || dayjs().add(7, "day").format("YYYY-MM-DD"), payment_mode: payMode,
    account_id: payMode !== "credit" ? accountId ?? bankIds[0] ?? accounts[0]?.id ?? null : null, status, rep,
    shipping_fee: ship, bank_account_ids: bankIds, credit_applied: creditUsed,
    terms_id: termsOn ? terms?.id ?? null : null, show_photos: showPhotos,
  });

  const save = useMutation({
    mutationFn: (status: "draft" | "issued") =>
      editId ? api(`/invoices/${editId}`, { method: "PUT", json: body(status) })
             : api("/invoices", { method: "POST", json: body(status) }),
    onSuccess: (inv: any, status) => {
      ["invoices", "invoice", "customers", "customer-summary", "items", "low-stock", "dashboard", "accounts", "activity"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.show(editId ? `${inv.number} updated` : status === "draft" ? "Draft saved — nothing has left your stock yet" : `${inv.number} raised for ${money(inv.totals.total)}`,
        editId ? "Saved." : status === "draft" ? undefined : "Issued.");
      router.replace(`/invoices/${inv.id}`);
    },
    onError: (e: Error) => toast.show(e.message),
  });

  const addCustomer = useMutation({
    mutationFn: (data: { name: string; phone: string; credit_limit: number | null }) => api("/customers", { method: "POST", json: data }),
    onSuccess: (c: any) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setCustomerId(c.id);
      setNewCust(false);
      setSearch("");
      setStep(1);
      toast.show(`${c.name} added — carry on with the invoice`, "Saved.");
    },
    onError: (e: Error) => toast.show(e.message),
  });

  const filteredCustomers = (customersQ.data ?? []).filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const filteredItems = (itemsQ.data ?? []).filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-invoice-screen">
      <AppBar title={editId ? `Edit ${(editQ.data as any)?.number ?? "invoice"}` : step === 0 ? "New invoice" : step === 1 ? "Items" : "Review & send"}
        close={step === 0} back={step > 0} onBack={() => (step > 0 ? setStep((step - 1) as 0 | 1) : router.back())}
        rightText={step === 0 && !editId ? "Save draft" : undefined} onRightText={() => (lines.length ? save.mutate("draft") : toast.show("Add an item before saving a draft"))}
        right={step === 1 ? <IconBtn name="barcode-outline" testID="items-scan" onPress={openScanner} /> : undefined} />

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
              <Li testID="invoice-new-customer" onPress={() => setNewCust(true)}>
                <Av icon="add" tone="green" /><View style={{ flex: 1 }}><H4>New customer</H4><Sub>Name and phone only — you stay on this invoice</Sub></View>
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
          <View style={[s.footer, { paddingBottom: pad }]}>
            <Btn testID="invoice-continue-items" label={customerId ? "Continue to items" : "Continue as cash sale"} onPress={() => setStep(1)} />
          </View>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            <CustomerStrip summary={summary} name={customer?.name ?? ""} sub={wholesale ? "Wholesale prices applied" : "Retail prices"}
              onChange={() => setStep(0)} testID="invoice-change-customer" />
            <Pressable testID="invoice-add-item-field" onPress={() => setAddOpen(true)} style={{ marginTop: 9 }}>
              <View style={{ backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: 11, paddingHorizontal: 12, minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="search-outline" size={16} color={colors.ink60} />
                <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.ink40 }}>Search item or scan barcode</Text>
                <Pressable onPress={openScanner} hitSlop={10} testID="invoice-search-scan"><Ionicons name="barcode-outline" size={18} color={colors.green700} /></Pressable>
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
                      <Row style={{ gap: 6, flexShrink: 1 }}>
                        {short ? <Tag style={{ color: colors.amber }}>Only {l.stock} in stock</Tag> : l.track && l.stock !== undefined ? <Tag>{l.stock} in stock</Tag> : l.quick_add ? <Tag>quick add</Tag> : null}
                        <LineDiscount line={l} onChange={(patch) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, ...patch } : x)))} />
                      </Row>
                      <View style={{ alignItems: "flex-end" }}>
                        {t.discount > 0 ? <Tag style={s.strike}>{money(t.gross, { symbol: false })}</Tag> : null}
                        <Money size={12.5} numberOfLines={1}>{money(t.total)}</Money>
                      </View>
                    </Row>
                  </Card>
                );
              })}
              {lines.length === 0 ? <Card style={{ borderStyle: "dashed", alignItems: "center", paddingVertical: 22 }}><Sub>No items yet. Tap the search bar to add one.</Sub></Card> : null}
            </View>
          </ScrollView>
          <View style={[s.footer, { paddingBottom: pad }]}>
            <Row between style={{ marginBottom: 3 }}><Sub>{lines.length} items · {totals.units} units</Sub><Money tone="mut" size={11.5}>{money(totals.gross)}</Money></Row>
            <Row between style={{ marginBottom: 8 }}><Sub>After discount</Sub><Money size={16} testID="items-after-discount">{money(totals.gross - totals.lineDisc)}</Money></Row>
            <Btn testID="invoice-review" label="Review invoice" onPress={() => (lines.length ? setStep(2) : setAddOpen(true))} />
          </View>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }}>
            <CustomerStrip summary={summary} name={customer?.name ?? ""} sub={customer?.phone || "No phone on file"}
              onChange={() => setStep(0)} testID="review-edit-customer" />
            <Card style={{ marginTop: 9, paddingVertical: 4 }}>
              {lines.map((l, i) => <Li key={l.key} last={i === lines.length - 1}><View style={{ flex: 1 }}><H4>{l.name}</H4><Tag>{l.quantity} × {money(l.unit_price, { symbol: false })}</Tag></View><Money>{money(calcLine(l).total, { symbol: false })}</Money></Li>)}
            </Card>
            <Card style={{ marginTop: 9 }} testID="review-totals">
              <Row between style={{ marginBottom: 5 }}><Sub>Gross total</Sub><Money>{money(totals.gross)}</Money></Row>
              <Pressable testID="review-invoice-discount" onPress={() => { setDiscDraft(discValue ? String(discValue) : ""); setDiscOpen(true); }}>
                <Row between style={[s.discRow, { marginBottom: 5 }]}>
                  <View style={{ flex: 1 }}>
                    <H4 style={s.green}>Total discount</H4>
                    <Tag>{lines.filter((l) => calcLine(l).discount > 0).length} item discount{lines.filter((l) => calcLine(l).discount > 0).length === 1 ? "" : "s"}{totals.invDisc > 0 ? ` + ${money(totals.invDisc)} on the whole invoice` : " · tap to discount the whole invoice"}</Tag>
                  </View>
                  <Money tone="pos" testID="review-total-discount">− {money(totals.discTotal)}</Money>
                </Row>
              </Pressable>
              <Row between style={{ marginBottom: 5 }}><Sub>Subtotal</Sub><Money testID="review-subtotal">{money(totals.taxable)}</Money></Row>
              <Row between style={{ marginBottom: 5 }}>
                <Row style={{ gap: 8 }}><Sub>VAT {VAT}%</Sub><Switch on={vatOn} onChange={setVatOn} testID="review-vat-toggle" /></Row>
                <Money>{money(totals.vat)}</Money>
              </Row>
              <Row between style={{ marginBottom: 5, alignItems: "center" }}>
                <View style={{ flex: 1 }}><Sub>Shipping fee</Sub><Tag>Delivery or logistics — not taxed</Tag></View>
                <TextInput testID="review-shipping" value={group(shipping)} onChangeText={(v) => setShipping(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad"
                  placeholder={`${sym()} 0`} placeholderTextColor={colors.ink40}
                  style={{ width: 96, textAlign: "right", fontFamily: fonts.monoSemibold, fontSize: 13, color: colors.onSurface, borderWidth: 1, borderColor: ship > 0 ? colors.brandPrimary : colors.border, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 8 }} />
              </Row>
              <Divider />
              <Row between><H4>Grand total</H4><Money size={16} testID="review-total">{money(totals.total)}</Money></Row>
              {creditUsed > 0 ? (
                <>
                  <Row between style={{ marginTop: 6 }}><Sub>Amount received</Sub><Money tone="pos" testID="review-received">{money(creditUsed)}</Money></Row>
                  <Row between style={{ marginTop: 4 }}><H4>Balance due</H4><Money size={15} testID="review-balance">{money(totals.total - creditUsed)}</Money></Row>
                </>
              ) : null}
            </Card>
            {credit > 0 ? (
              <Card style={[s.mintCard, { marginTop: 9, flexDirection: "row", alignItems: "center", gap: 10 }]} testID="review-credit-card">
                <View style={{ flex: 1 }}>
                  <H4>Apply unused credit</H4>
                  <Sub>{customer?.name} has {money(credit)} sitting in their account</Sub>
                </View>
                <Switch on={useCredit} onChange={setUseCredit} testID="review-use-credit" />
              </Card>
            ) : null}
            {overLimit ? (
              <Card style={[s.amberCard, { marginTop: 9 }]} testID="review-credit-warning">
                <Row style={{ alignItems: "flex-start", gap: 8 }}>
                  <Text style={{ color: colors.amber, fontFamily: fonts.bold }}>!</Text>
                  <Sub style={{ flex: 1 }}>
                    This takes <Text style={{ fontFamily: fonts.bold }}>{customer?.name}</Text> to {money(afterBalance)} against a {money(limit ?? 0)} credit limit —{" "}
                    {money(afterBalance - (limit ?? 0))} over. You can still sell; this is a warning, not a block.
                  </Sub>
                </Row>
              </Card>
            ) : limit ? (
              <Card style={[s.mintCard, { marginTop: 9 }]} testID="review-credit-ok">
                <Sub>{money(Math.max(0, limit - afterBalance))} of {customer?.name}&rsquo;s {money(limit)} credit limit is left after this invoice.</Sub>
              </Card>
            ) : null}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
              <DateField label="Issue date" value={issueDate} onChange={setIssueDate} style={{ flex: 1 }} testID="review-issue-date" />
              <DateField label="Due date" value={dueDate} onChange={setDueDate} style={{ flex: 1 }} testID="review-due-date" />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
              <PickerField label="Payment" value={payMode} options={PAY_MODES} onPick={(k) => setPayMode(k as any)} title="How is this being paid?" style={{ flex: 1 }} testID="review-payment-mode" />
              <PickerField label="Sold by" value={rep} options={repOptions} onPick={setRep} title="Which rep sold this?" placeholder="Choose rep" searchable style={{ flex: 1 }} testID="review-rep" />
            </View>
            {payMode !== "credit" ? (
              <PickerField label="Paid into" value={accountId ?? accounts[0]?.id ?? null} options={accountOptions} onPick={setAccountId}
                title="Which account received the money?" style={{ marginTop: 9 }} testID="review-account" />
            ) : null}
            <Card style={{ marginTop: 8, paddingVertical: 2 }}>
              <Li testID="review-pay-into" onPress={() => setBanksOpen(true)}>
                <Av icon="card-outline" tone="sq" size={24} />
                <View style={{ flex: 1 }}>
                  <H4 style={{ fontSize: 12.5 }}>Bank accounts on this invoice</H4>
                  <Tag>{bankIds.length === 0 ? "None — nothing prints" : (accountsQ.data?.accounts ?? []).filter((a: any) => bankIds.includes(a.id)).map((a: any) => a.name).join(", ")}</Tag>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.ink40} />
              </Li>
              <Li testID="review-terms" onPress={() => setTermsOpen(true)}>
                <Av icon="document-text-outline" tone="sq" size={24} />
                <View style={{ flex: 1 }}>
                  <H4 style={{ fontSize: 12.5 }}>Terms of payment</H4>
                  <Tag>{!termsOn ? "Off" : terms ? `${terms.name}${terms.shop ? ` · ${terms.shop}` : ""}` : "No saved set yet"}</Tag>
                </View>
                <Switch on={termsOn} onChange={setTermsOn} testID="review-terms-toggle" />
              </Li>
              <Li last>
                <Av icon="image-outline" tone="sq" size={24} />
                <View style={{ flex: 1 }}><H4 style={{ fontSize: 12.5 }}>Show item photos</H4>
                  <Tag>{photosAllowed === false ? "Not on your plan" : showPhotos ? "Photos print beside each item" : "Off"}</Tag></View>
                <Switch on={showPhotos && photosAllowed !== false} onChange={photosAllowed === false ? undefined : setShowPhotos} testID="review-photos" />
              </Li>
            </Card>
          </ScrollView>
          <View style={[s.footer, { paddingBottom: pad }]}>
            {editId ? (
              <Btn label="Save changes" onPress={() => save.mutate(((editQ.data as any)?.status === "draft" ? "draft" : "issued"))} loading={save.isPending} testID="review-save-changes" />
            ) : (
              <>
                <Sub style={{ marginBottom: 7, textAlign: "center", fontSize: 11 }}>
                  A draft touches nothing. Issuing takes the items off your shelf.
                </Sub>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Btn small variant="ghost" label="Save as draft" style={{ flex: 1 }} onPress={() => save.mutate("draft")} loading={save.isPending && save.variables === "draft"} testID="review-save-draft" />
                  <Btn small label="Issue invoice" style={{ flex: 1 }} icon="checkmark-circle-outline" onPress={() => save.mutate("issued")} loading={save.isPending && save.variables === "issued"} testID="review-send" />
                </View>
              </>
            )}
          </View>
        </>
      ) : null}

      {/* 04.12 Add item */}
      <Sheet visible={addOpen} onClose={() => { setAddOpen(false); setPick(false); }} testID="add-item-sheet">
        {!pick ? (
          <>
            <H4>Add item</H4>
            <View style={{ gap: 6, marginTop: 11 }}>
              <Pressable testID="add-item-scan" onPress={openScanner}><Card style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 }}><Av icon="barcode-outline" tone="sq" size={32} /><View style={{ flex: 1 }}><H4>Scan bar code</H4><Sub>Fastest at the counter · or check a price</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} /></Card></Pressable>
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

      {/* Scan straight onto the invoice, or switch the camera to a price check */}
      <Scanner visible={scan} onClose={() => setScan(false)} onScan={onScan} title="Scan onto this invoice"
        hint="Point at the bar code — each scan adds one line" mode={scanMode} onMode={setScanMode} addLabel="Add to invoice" />
      <ScanResultSheet testID="invoice-scan" code={scanCode} item={scanItem} onClose={closeScanResult}
        onScanAgain={() => { closeScanResult(); setScan(true); }}
        addLabel="Add to invoice"
        onAdd={(it) => { addItem(it); closeScanResult(); toast.show(`${it.name} added to the invoice`); }} />

      {/* New customer, without leaving the invoice */}
      <NewCustomerSheet visible={newCust} onClose={() => setNewCust(false)} saving={addCustomer.isPending}
        onSave={(d) => addCustomer.mutate(d)} />

      {/* 04.13 Line item details */}
      {editing ? <LineEditor line={editing} onClose={() => setEditKey(null)} onSave={(l) => { setLines((ls) => ls.map((x) => (x.key === l.key ? l : x))); setEditKey(null); }} onRemove={() => { setLines((ls) => ls.filter((x) => x.key !== editing.key)); setEditKey(null); }} /> : null}

      {/* Bank accounts that print on this invoice */}
      <Sheet visible={banksOpen} onClose={() => { setBanksOpen(false); setAddBank(false); }} testID="banks-sheet">
        <H4>Bank accounts on this invoice</H4>
        <Sub style={{ marginTop: 3 }}>Tick the accounts the customer should pay into. They print in the bank details block.</Sub>
        {addBank ? (
          <View style={{ marginTop: 11 }}>
            <AccountForm saveLabel="Save and use on this invoice" onCancel={() => setAddBank(false)}
              onCreated={(a) => { setBankIds((ids) => [...ids, a.id]); setAddBank(false); }} />
          </View>
        ) : (
          <>
            <Card style={{ marginTop: 10, paddingVertical: 2 }}>
              {(accountsQ.data?.accounts ?? []).map((a: any) => (
                <Li key={a.id} testID={`bank-pick-${a.id}`}
                  onPress={() => setBankIds((ids) => (ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}>
                  <Av icon="card-outline" tone={bankIds.includes(a.id) ? "green" : "sq"} />
                  <View style={{ flex: 1 }}><H4>{a.name}</H4><Sub>{a.detail || a.kind}</Sub></View>
                  <Check on={bankIds.includes(a.id)} />
                </Li>
              ))}
              <Li last testID="bank-add" onPress={() => setAddBank(true)}>
                <Av icon="add" tone="green" />
                <View style={{ flex: 1 }}><H4>Add a bank account</H4><Sub>Saved to your books and ticked here</Sub></View>
                <Ionicons name="chevron-forward" size={15} color={colors.ink40} />
              </Li>
            </Card>
            <Btn label="Done" style={{ marginTop: 12 }} onPress={() => setBanksOpen(false)} testID="banks-done" />
          </>
        )}
      </Sheet>

      {/* Terms of payment set, per shop */}
      <Sheet visible={termsOpen} onClose={() => setTermsOpen(false)} testID="terms-sheet">
        <H4>Terms of payment</H4>
        <Sub style={{ marginTop: 3 }}>Saved sets are tied to a shop, so the right terms come up for the right branch.</Sub>
        <Card style={{ marginTop: 10, paddingVertical: 2 }}>
          {shopTerms.map((t: any, i: number) => (
            <Li key={t.id} last={i === shopTerms.length - 1} testID={`terms-pick-${t.id}`} onPress={() => { setTermsId(t.id); setTermsOn(true); setTermsOpen(false); }}>
              <Av icon="document-text-outline" tone={terms?.id === t.id ? "green" : "sq"} />
              <View style={{ flex: 1 }}><H4>{t.name}</H4><Sub numberOfLines={2}>{t.shop ? `${t.shop} · ` : ""}{t.payment_structure || "No payment structure set"}</Sub></View>
              {terms?.id === t.id ? <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} /> : null}
            </Li>
          ))}
          {shopTerms.length === 0 ? <Li last><View style={{ flex: 1 }}><Sub>No saved sets yet.</Sub></View></Li> : null}
        </Card>
        <Btn variant="ghost" label="Manage saved sets" style={{ marginTop: 12 }} onPress={() => { setTermsOpen(false); router.push("/settings/terms"); }} testID="terms-manage" />
      </Sheet>

      {/* 04.20 Discount on whole invoice */}
      <Sheet visible={discOpen} onClose={() => setDiscOpen(false)} testID="invoice-discount-sheet">
        <Row between><H4>Discount on whole invoice</H4><Tag>{customer?.name ?? "Cash sale"}</Tag></Row>
        <View style={{ marginTop: 11 }}><Seg testID="disc-mode" value={discMode} onChange={(m) => { setDiscMode(m); setDiscDraft(""); }} options={[{ key: "amount", label: `${sym()} off` }, { key: "percent", label: "% off" }, { key: "final", label: "Final total" }]} /></View>
        <View style={{ marginTop: 10, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: 11, padding: 12, alignItems: "center" }}>
          <Lbl>{discMode === "final" ? "Make the total" : "Take off"}</Lbl>
          <TextInput testID="disc-input" value={discMode === "percent" ? discDraft : group(discDraft)} onChangeText={(v) => setDiscDraft(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder={discMode === "percent" ? "0 %" : `${sym()} 0`} placeholderTextColor={colors.ink40} style={s.bigInput} autoFocus />
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

/** The small discount box inside an item card: type an amount, or switch to %. */
function LineDiscount({ line, onChange }: { line: Line; onChange: (patch: Partial<Line>) => void }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(line.discount_value ? String(line.discount_value) : "");
  const on = parseNum(draft) > 0;
  return (
    <Row style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, borderColor: on ? colors.brandPrimary : colors.border, backgroundColor: on ? colors.brandTertiary : colors.surfaceSecondary, paddingLeft: 7 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.6, color: colors.ink40 }}>DISC</Text>
        <TextInput
          testID={`line-disc-${line.key}`}
          value={draft}
          onChangeText={(v) => { setDraft(v); onChange({ discount_value: parseNum(v) }); }}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.ink40}
          style={{ width: 44, textAlign: "right", fontFamily: fonts.monoSemibold, fontSize: 12, color: colors.onSurface, paddingVertical: 4, paddingHorizontal: 4 }}
        />
        <Pressable testID={`line-disc-type-${line.key}`} onPress={() => onChange({ discount_type: line.discount_type === "amount" ? "percent" : "amount" })}
          hitSlop={6} style={{ paddingHorizontal: 8, paddingVertical: 5, borderLeftWidth: 1, borderLeftColor: on ? colors.mint2 : colors.border }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: on ? colors.green700 : colors.ink60 }}>{line.discount_type === "percent" ? "%" : sym()}</Text>
        </Pressable>
      </View>
    </Row>
  );
}

function LineEditor({ line, onClose, onSave, onRemove }: { line: Line; onClose: () => void; onSave: (l: Line) => void; onRemove: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
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
      {/* The sheet itself rides the keyboard now, so a nested keyboard-aware
          scroll view would compensate twice. */}
      <View>
        <Card style={[s.faint, { flexDirection: "row", alignItems: "center", gap: 8 }]}><Av icon="cube-outline" tone="sq" /><View><H4 style={{ fontSize: 12.5 }}>{line.unit || "Unit"}</H4><Tag>{line.track && line.stock !== undefined ? `${line.stock} in stock` : line.quick_add ? "quick add" : "not tracked"}</Tag></View></Card>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
          <Field label="Selling price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" mono style={{ flex: 1 }} testID="line-price" />
          <Field label="Quantity" value={qty} onChangeText={setQty} keyboardType="decimal-pad" mono style={{ flex: 1 }} testID="line-qty" />
        </View>
        <Card style={{ marginTop: 9 }}>
          <Row between><Lbl>Discount</Lbl><View style={{ width: 100 }}><Seg testID="line-disc-type" value={dtype} onChange={setDtype} options={[{ key: "amount", label: sym() }, { key: "percent", label: "%" }]} /></View></Row>
          <Field value={dval} onChangeText={setDval} keyboardType="decimal-pad" mono placeholder="0" style={{ marginTop: 7 }} testID="line-disc-value" />
          <Row between style={{ marginTop: 7 }}><Sub>That is {pct}% off the line</Sub><Money tone="pos">{money(t.total)}</Money></Row>
        </Card>
        <Field label="Note on this item" value={note} onChangeText={setNote} placeholder="Prints under the item name" multiline style={{ marginTop: 9 }} testID="line-note" right={<Tag>{note.length} / 650</Tag>} />
        <Sub style={{ marginTop: 7 }}>Notes print under the item name on the invoice.</Sub>
        <Btn label={`Update line — ${money(t.total)}`} onPress={() => onSave(draft)} style={{ marginTop: 12 }} testID="line-update" />
        <Pressable onPress={onRemove} style={{ alignSelf: "center", marginTop: 12, padding: 6 }} testID="line-remove"><Sub style={{ color: colors.coral, fontFamily: fonts.bold }}>Remove from invoice</Sub></Pressable>
      </View>
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
          <Field label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" mono placeholder={`${sym()} 0`} style={{ flex: 1 }} testID="quick-price" />
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

/** Who the invoice is for, with what they owe and the room left on their limit. */
function CustomerStrip({ summary, name, sub, onChange, testID }: {
  summary: any; name: string; sub: string; onChange: () => void; testID: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Card style={[s.faint, { paddingVertical: 9 }]} testID="invoice-customer-strip">
      <Row between>
        <Row style={{ gap: 8, flex: 1 }}>
          <Av text={name ? initials(name) : "—"} size={24} tone={name ? "mint" : "sq"} />
          <View style={{ flex: 1 }}><H4 style={{ fontSize: 12.5 }}>{name || "Cash sale"}</H4><Tag>{sub}</Tag></View>
        </Row>
        <Chip label="Change" onPress={onChange} testID={testID} />
      </Row>
      {summary ? (
        <Row between style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
          <View><Lbl>Owes now</Lbl><Money size={12.5} tone={summary.unpaid > 0 ? "neg" : "pos"} testID="strip-owes">{money(summary.unpaid)}</Money></View>
          <View><Lbl>Bought so far</Lbl><Money size={12.5}>{money(summary.purchased)}</Money></View>
          <View style={{ alignItems: "flex-end" }}>
            <Lbl>Credit left</Lbl>
            <Money size={12.5} tone={summary.over_limit ? "neg" : undefined} testID="strip-credit">
              {summary.credit_limit ? money(summary.credit_left) : "No limit"}
            </Money>
          </View>
        </Row>
      ) : null}
    </Card>
  );
}

/** 04.3 — add a customer in the middle of an invoice and come straight back. */
function NewCustomerSheet({ visible, onClose, onSave, saving }: {
  visible: boolean; onClose: () => void; saving: boolean;
  onSave: (d: { name: string; phone: string; credit_limit: number | null }) => void;
}) {
  const s = useStyles();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [limitOn, setLimitOn] = useState(false);
  const [limit, setLimit] = useState("");
  return (
    <Sheet visible={visible} onClose={onClose} testID="new-customer-sheet">
      <H4>New customer</H4>
      <Sub style={{ marginTop: 3 }}>Just the name is enough. You come back to this invoice the moment it saves.</Sub>
      <View style={{ gap: 9, marginTop: 11 }}>
        <Field label="Customer name" value={name} onChangeText={setName} placeholder="Blessing Adeyemi" autoFocus testID="new-customer-name" />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+234 803 000 0000" keyboardType="phone-pad" testID="new-customer-phone" />
      </View>
      <Card style={{ marginTop: 9 }}>
        <Row between>
          <View style={{ flex: 1 }}><H4>Give them a credit limit</H4><Sub>You are warned when a sale goes past it</Sub></View>
          <Switch on={limitOn} onChange={setLimitOn} testID="new-customer-limit-toggle" />
        </Row>
        {limitOn ? <Field value={limit} onChangeText={setLimit} keyboardType="decimal-pad" mono placeholder={`${sym()} 0`} style={{ marginTop: 9 }} testID="new-customer-limit" /> : null}
      </Card>
      <Card style={[s.mintCard, { marginTop: 9, paddingVertical: 9 }]}>
        <Sub>Everything else — address, email, opening balance — can be filled in later on their profile.</Sub>
      </Card>
      <Btn label="Save and use on this invoice" style={{ marginTop: 12 }} disabled={!name.trim()} loading={saving}
        testID="new-customer-save" onPress={() => onSave({ name: name.trim(), phone: phone.trim(), credit_limit: limitOn && parseNum(limit) > 0 ? parseNum(limit) : null })} />
    </Sheet>
  );
}

export { Check };
