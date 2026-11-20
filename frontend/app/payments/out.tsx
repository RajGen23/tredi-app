// Payment out to a customer (refund), or correct an existing payment's account and date.
//   /payments/out?customer_id=…      — money paid back to the customer
//   /payments/out?edit=<payment id>  — fix the account it landed in, the date or the note
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { AppBar, Btn, Field, Sub } from "@/src/components/ui";
import { DateField } from "@/src/components/date-field";
import { PickerField } from "@/src/components/picker";
import { useToast } from "@/src/components/sheet";
import { money, parseNum } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { useTheme } from "@/src/theme";

export default function PaymentOut() {
  const p = useLocalSearchParams<{ customer_id?: string; edit?: string; amount?: string; account_id?: string; date?: string; note?: string; amount_editable?: string }>();
  const editing = !!p.edit;
  const amountEditable = !!p.amount_editable;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api<any>("/accounts") });
  const [amount, setAmount] = useState(p.edit ? String(Math.abs(parseNum(p.amount ?? "0"))) : "");
  const [reason, setReason] = useState("");
  const [accountId, setAccountId] = useState<string | null>(p.account_id || null);
  const initialDate = p.date ? dayjs(p.date).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
  const [date, setDate] = useState(initialDate);
  const [note, setNote] = useState(p.note ?? "");
  const accounts = (accountsQ.data?.accounts ?? []).filter((a: any) => !a.dormant || a.id === accountId);
  useEffect(() => { if (!accountId && !editing && accounts[0]) setAccountId(accounts[0].id); }, [accounts, accountId, editing]);

  const save = useMutation({
    mutationFn: () => editing
      ? api(`/payments/${p.edit}`, { method: "PUT", json: { account_id: accountId, note, reason, ...(date !== initialDate ? { date } : {}), ...(amountEditable ? { amount: parseNum(amount) } : {}) } })
      : api(`/customers/${p.customer_id}/payment-out`, { method: "POST", json: { amount: parseNum(amount), account_id: accountId, date, note } }),
    onSuccess: () => {
      ["customers", "customer", "customer-summary", "invoices", "invoice", "accounts", "account", "ledger", "dashboard", "activity", "history"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.show(editing ? "Payment corrected" : `${money(parseNum(amount))} paid out`, "Saved.");
      router.back();
    },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, paddingTop: insets.top }} testID="payment-out-screen">
      <AppBar title={editing ? "Correct payment" : "Payment out"} close />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: pad + 80 }} keyboardShouldPersistTaps="handled">
        {editing && !amountEditable ? <Sub>Amount {money(Math.abs(parseNum(p.amount ?? "0")))} came with the sale — change the sale to change it. You can fix where it landed or the day it came in.</Sub> : (
          <Field label={editing ? "Amount" : "Amount paid back"} keyboardType="decimal-pad" mono value={amount} onChangeText={setAmount} placeholder="0" testID="payment-out-amount" />
        )}
        <PickerField label={editing ? "Account it was paid into" : "Paid from which account"} value={accountId}
          options={accounts.map((a: any) => ({ key: a.id, label: a.name, sub: a.detail || a.kind }))} onPick={setAccountId}
          title="Which account?" placeholder="Cash till" testID="payment-out-account" />
        <DateField label="Date" value={date} onChange={setDate} testID="payment-out-date" />
        <Field label="Note — optional" value={note} onChangeText={setNote} placeholder={editing ? "" : "Refund of overpayment"} testID="payment-out-note" />
        {editing ? <Field label="Why the change — optional" value={reason} onChangeText={setReason} placeholder="Paid into the wrong account" testID="payment-edit-reason" /> : null}
        {editing ? <Sub>The old values are kept and the change shows in Activity.</Sub> : null}
      </KeyboardAwareScrollView>
      <View style={{ position: "absolute", left: 14, right: 14, bottom: pad }}>
        <Btn label={editing ? "Save correction" : "Record payment out"} disabled={(!editing || amountEditable) && parseNum(amount) <= 0} loading={save.isPending}
          onPress={() => save.mutate()} testID="payment-out-save" />
      </View>
    </View>
  );
}
