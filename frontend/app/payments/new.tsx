// 09.2 Payment in — amount, presets, settle against invoices, into account.
import { useEffect, useMemo, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { AppBar, Av, Btn, Card, Check, Chip, H4, Li, Lbl, Money, Row, Sub, Switch, Tag } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { DateField } from "@/src/components/date-field";
import { PickerField } from "@/src/components/picker";
import { initials, money, parseNum, statusLabel, sym } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  faint: { backgroundColor: c.faint, paddingVertical: 9, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8 },
  mint: { backgroundColor: c.brandTertiary, borderColor: c.mint2, paddingVertical: 9 },
  amountBox: { borderWidth: 1, borderColor: c.brandPrimary, borderRadius: 11, padding: 14, alignItems: "center", marginTop: 9 },
  bigInput: { fontFamily: fonts.monoSemibold, fontSize: 28, color: c.onSurface, textAlign: "center", paddingVertical: 4, minWidth: 160 },
  footer: { paddingTop: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.border },
}));

const PAY_METHODS = [
  { key: "cash", label: "Cash", sub: "Notes into the till" },
  { key: "transfer", label: "Bank transfer", sub: "Into one of your accounts" },
  { key: "card", label: "Card / POS", sub: "Terminal settlement" },
  { key: "cheque", label: "Cheque", sub: "Not cleared until it lands" },
  { key: "other", label: "Other", sub: "Anything else" },
];

export default function PaymentIn() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const params = useLocalSearchParams<{ customer_id?: string; invoice_id?: string }>();
  const customersQ = useQuery({ queryKey: ["customers"], queryFn: () => api<any[]>("/customers") });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api("/accounts") });
  const [customerId, setCustomerId] = useState<string | null>(params.customer_id ?? null);
  const [pick, setPick] = useState(!params.customer_id);
  const customerQ = useQuery({ queryKey: ["customer", customerId], queryFn: () => api(`/customers/${customerId}`), enabled: !!customerId });
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState<string[]>(params.invoice_id ? [params.invoice_id] : []);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [method, setMethod] = useState("cash");
  const [payDate, setPayDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [receipt, setReceipt] = useState(true);
  const accounts = accountsQ.data?.accounts ?? [];
  const account = accounts.find((a: any) => a.id === accountId) ?? accounts[0];
  const accountOptions = accounts.map((a: any) => ({ key: a.id, label: a.name, sub: a.detail || a.kind }));
  const c = customerQ.data;
  const open = useMemo(() => (c?.invoices ?? []).filter((i: any) => i.due > 0 && !["draft", "cancelled"].includes(i.status)), [c]);
  const owed = Math.max(0, c?.balance ?? 0);
  const target = open.find((i: any) => i.id === params.invoice_id);

  useEffect(() => { if (open.length && selected.length === 0) setSelected(open.map((i: any) => i.id)); }, [open, selected.length]);
  // Arriving from an invoice: that invoice's balance is what they are here to pay.
  useEffect(() => { if (target && !amount) setAmount(String(target.due)); }, [target, amount]);

  const allocations = useMemo(() => {
    let rem = parseNum(amount);
    return open.filter((i: any) => selected.includes(i.id)).map((i: any) => { const take = Math.min(i.due, rem); rem -= take; return { invoice_id: i.id, amount: Math.round(take * 100) / 100 }; }).filter((a: any) => a.amount > 0);
  }, [amount, open, selected]);

  const m = useMutation({
    mutationFn: () => api("/payments", { method: "POST", json: {
      customer_id: customerId, amount: parseNum(amount), account_id: account?.id ?? null, method, date: payDate,
      allocations, note: `Payment in · ${PAY_METHODS.find((p) => p.key === method)?.label ?? "Cash"} · ${account?.name ?? "Cash"}`,
    } }),
    onSuccess: () => { ["customers", "customer", "customer-summary", "invoices", "invoice", "dashboard", "accounts", "account", "ledger", "activity"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast.show(`${money(parseNum(amount))} from ${c?.name}`, "Recorded."); router.back(); },
    onError: (e: Error) => toast.show(e.message),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="payment-in-screen">
      <AppBar title="Payment in" close />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }} bottomOffset={80} keyboardShouldPersistTaps="handled">
        <Card style={s.faint}>
          <Av text={c ? initials(c.name) : "?"} size={24} tone={c ? "mint" : "sq"} />
          <View style={{ flex: 1 }}><H4 style={{ fontSize: 12.5 }}>{c?.name ?? "Choose a customer"}</H4><Tag>{c ? (owed > 0 ? `Owes ${money(owed)}` : "Nothing owing") : "Who is paying?"}</Tag></View>
          <Chip label={c ? "Change" : "Choose"} onPress={() => setPick(true)} testID="payment-change-customer" />
        </Card>
        {target ? (
          <Card style={[s.mint, { marginTop: 9 }]} testID="payment-target-invoice">
            <Row between>
              <View style={{ flex: 1 }}>
                <Lbl>Paying invoice</Lbl>
                <H4 style={{ fontFamily: fonts.monoSemibold, fontSize: 13 }}>{target.number}</H4>
                <Tag>{statusLabel(target)} · {money(target.totals?.total ?? 0)} total</Tag>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Lbl>Due on it</Lbl>
                <Money size={16} tone="neg" testID="payment-target-due">{money(target.due)}</Money>
              </View>
            </Row>
          </Card>
        ) : null}
        <View style={s.amountBox}>
          <Lbl>Amount received</Lbl>
          <TextInput testID="payment-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={`${sym()} 0`} placeholderTextColor={colors.ink40} style={s.bigInput} autoFocus={!!customerId} />
        </View>
        {owed > 0 ? (
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {[Math.round(owed / 4 / 1000) * 1000, Math.round(owed / 2 / 1000) * 1000].filter((v) => v > 0 && v < owed).map((v) => <Chip key={v} label={money(v)} on={parseNum(amount) === v} onPress={() => setAmount(String(v))} testID={`payment-preset-${v}`} />)}
            <Chip label={`Full ${money(owed)}`} on={parseNum(amount) === owed} onPress={() => setAmount(String(owed))} testID="payment-preset-full" />
          </View>
        ) : null}
        {open.length ? (
          <>
            <Row between style={{ marginTop: 12, marginBottom: 6 }}>
              <Lbl>Settle against</Lbl>
              <Tag>{open.length} open · {money(open.reduce((a: number, i: any) => a + i.due, 0))} due</Tag>
            </Row>
            <Card style={{ paddingVertical: 4 }}>
              {open.map((inv: any, i: number) => {
                const on = selected.includes(inv.id);
                const alloc = allocations.find((a: any) => a.invoice_id === inv.id)?.amount ?? 0;
                return (
                  <Li key={inv.id} testID={`payment-invoice-${inv.number}`} last={i === open.length - 1} onPress={() => setSelected(on ? selected.filter((x) => x !== inv.id) : [...selected, inv.id])}>
                    <Check on={on} />
                    <View style={{ flex: 1 }}><H4 style={{ fontFamily: fonts.monoSemibold, fontSize: 12.5 }}>{inv.number}</H4><Sub>{statusLabel(inv)}</Sub></View>
                    <Money tone={on && alloc ? undefined : "mut"}>{money(on && alloc ? alloc : inv.due, { symbol: false })}</Money>
                  </Li>
                );
              })}
            </Card>
          </>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
          <PickerField label="How was it paid?" value={method} options={PAY_METHODS} onPick={setMethod} title="Means of collection" style={{ flex: 1 }} testID="payment-method" />
          <DateField label="Date of payment" value={payDate} onChange={setPayDate} style={{ flex: 1 }} testID="payment-date" />
        </View>
        <PickerField label="Into which account" value={account?.id ?? null} options={accountOptions} onPick={setAccountId}
          title="Where did the money land?" placeholder="Cash till" style={{ marginTop: 9 }} testID="payment-account" />
        <Card style={{ marginTop: 9, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}><H4>Send receipt on WhatsApp</H4><Sub>{c?.phone ? `To ${c.phone}` : "No phone on file"}</Sub></View>
          <Switch on={receipt} onChange={setReceipt} testID="payment-receipt-toggle" />
        </Card>
        {parseNum(amount) > owed && owed >= 0 && c ? <Sub style={{ marginTop: 8, textAlign: "center" }}>{money(parseNum(amount) - owed)} extra becomes unused credit on {c.name}’s account.</Sub> : null}
      </KeyboardAwareScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Btn testID="payment-record" label={`Record ${money(parseNum(amount))}`} onPress={() => m.mutate()} loading={m.isPending} disabled={!customerId || !parseNum(amount)} />
      </View>

      <Sheet visible={pick} onClose={() => setPick(false)} testID="payment-customer-sheet">
        <H4 style={{ marginBottom: 6 }}>Who is paying?</H4>
        <View style={{ maxHeight: 420 }}>
          <ScrollView>
            {(customersQ.data ?? []).map((cu, i) => (
              <Li key={cu.id} testID={`payment-pick-${cu.id}`} last={i === (customersQ.data?.length ?? 0) - 1} onPress={() => { setCustomerId(cu.id); setSelected([]); setPick(false); }}>
                <Av text={initials(cu.name)} />
                <View style={{ flex: 1 }}><H4>{cu.name}</H4><Sub>{cu.balance > 0 ? `owes ${money(cu.balance)}` : "settled"}</Sub></View>
                <Row><Money tone={cu.balance > 0 ? "neg" : undefined}>{money(cu.balance)}</Money></Row>
              </Li>
            ))}
          </ScrollView>
        </View>
      </Sheet>
    </View>
  );
}
