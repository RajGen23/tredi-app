// 08.2 Add expense — amount first and large.
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppBar, Btn, Card, Chip, Field, H4, Lbl, Sub, Tag } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { money, parseNum, slashDate, sym } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const CATS = ["Transport & fuel", "Rent", "Salaries", "Utilities", "Repairs", "Supplies", "Other"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  amountBox: { borderWidth: 1, borderColor: c.brandPrimary, borderRadius: 11, padding: 14, alignItems: "center" },
  bigInput: { fontFamily: fonts.monoSemibold, fontSize: 28, color: c.onSurface, textAlign: "center", paddingVertical: 4, minWidth: 160 },
  receipt: { width: 56, height: 56, borderRadius: 10, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  footer: { paddingTop: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.border },
}));

export default function NewExpense() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { business } = useAuth();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api("/accounts") });
  const accounts = accountsQ.data?.accounts ?? [];
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATS[0]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const account = accounts.find((a: any) => a.id === accountId) ?? accounts[0];

  const m = useMutation({
    mutationFn: () => api("/expenses", { method: "POST", json: { amount: parseNum(amount), category, account_id: account?.id ?? null, note, shop: business?.shops?.[0]?.name ?? "" } }),
    onSuccess: () => { ["expenses", "dashboard", "accounts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast.show(`${money(parseNum(amount))} · ${category}`, "Expense saved."); router.back(); },
    onError: (e: Error) => toast.show(e.message),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-expense-screen">
      <AppBar title="Add expense" close />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }} bottomOffset={80} keyboardShouldPersistTaps="handled">
        <View style={s.amountBox}>
          <Lbl>Amount</Lbl>
          <TextInput testID="expense-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={`${sym()} 0`} placeholderTextColor={colors.ink40} style={s.bigInput} autoFocus />
        </View>
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Category</Lbl>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{CATS.map((c) => <Chip key={c} label={c} on={category === c} onPress={() => setCategory(c)} testID={`expense-cat-${c}`} />)}</View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Field testID="expense-account" label="Paid from" value={account?.name ?? "Cash"} onPress={() => { const i = accounts.findIndex((a: any) => a.id === account?.id); setAccountId(accounts[(i + 1) % Math.max(1, accounts.length)]?.id ?? null); }} right={<Sub>⌄</Sub>} style={{ flex: 1 }} />
          <Field label="Date" value={slashDate()} mono onPress={() => {}} style={{ flex: 1 }} />
        </View>
        <Field testID="expense-note" label="Note" value={note} onChangeText={setNote} placeholder="Diesel for generator, 40 litres" style={{ marginTop: 10 }} />
        <Field label="Shop" value={business?.shops?.[0]?.name ?? "Main branch"} onPress={() => {}} right={<Sub>⌄</Sub>} style={{ marginTop: 10 }} />
        <Card style={{ marginTop: 9, padding: 9, flexDirection: "row", gap: 9, alignItems: "center" }} testID="expense-receipt">
          <View style={s.receipt}><Ionicons name="camera-outline" size={20} color={colors.ink40} /></View>
          <View style={{ flex: 1 }}><H4>Attach a receipt</H4><Sub>Photo upload arrives with the Documents pass</Sub><Tag style={{ color: colors.green700 }}>Optional</Tag></View>
        </Card>
      </KeyboardAwareScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Btn testID="expense-save" label="Save expense" onPress={() => m.mutate()} loading={m.isPending} disabled={!parseNum(amount)} />
      </View>
      {m.error ? <Text style={{ display: "none" }}>{(m.error as Error).message}</Text> : null}
    </View>
  );
}
