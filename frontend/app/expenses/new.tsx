// 08.2 Add expense — amount first and large, then the details that make the
// figure reportable: category (add your own), account, date, shop, rep and the
// receipt photo.
import { useEffect, useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppBar, Btn, Card, Field, H4, Lbl, Sub, Tag } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { DateField } from "@/src/components/date-field";
import { PickerField } from "@/src/components/picker";
import { useAccounts, useLookup, useShops } from "@/src/lookups";
import { photoSource, pickAndUploadPhoto } from "@/src/uploads";
import { group, money, parseNum, sym } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { fonts, makeStyles, useTheme } from "@/src/theme";

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
  const pad = useBottomPad();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const cats = useLookup("expense_category");
  const { accounts, options: accountOptions } = useAccounts();
  const shops = useShops();
  const teamQ = useQuery({ queryKey: ["team"], queryFn: () => api("/team") });
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [note, setNote] = useState("");
  const [shop, setShop] = useState("");
  const [rep, setRep] = useState("");
  const [receipt, setReceipt] = useState("");
  const [receiptUri, setReceiptUri] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => { if (!category && cats.values.length) setCategory(cats.values[0]); }, [cats.values, category]);
  useEffect(() => { if (!shop && shops.writeShop) setShop(shops.writeShop); }, [shops.writeShop, shop]);
  useEffect(() => { if (!rep && user?.name) setRep(user.name); }, [user?.name, rep]);
  useEffect(() => { if (!accountId && accounts.length) setAccountId(accounts[0].id); }, [accounts, accountId]);
  useEffect(() => {
    if (!receipt) return setReceiptUri("");
    photoSource(receipt).then((src) => setReceiptUri(src.uri));
  }, [receipt]);

  const repOptions = ((teamQ.data as any)?.users ?? []).filter((u: any) => u.active !== false)
    .map((u: any) => ({ key: u.name, label: u.name, sub: u.role_label }));

  const addReceipt = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadPhoto();
      if (url) {
        setReceipt(url);
        toast.show("Receipt attached — it stays with this expense");
      }
    } catch (e: any) {
      toast.show(e.message ?? "Could not attach that photo", undefined, "bad");
    } finally {
      setUploading(false);
    }
  };

  const m = useMutation({
    mutationFn: () => api("/expenses", {
      method: "POST",
      json: { amount: parseNum(amount), category, account_id: accountId, date, note, shop, rep, receipt_url: receipt || null },
    }),
    onSuccess: () => {
      ["expenses", "dashboard", "accounts", "activity", "reports-summary"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.show(`${money(parseNum(amount))} · ${category}`, "Expense saved.");
      router.back();
    },
    onError: (e: Error) => toast.show(e.message),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-expense-screen">
      <AppBar title="Add expense" close />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }} bottomOffset={80} keyboardShouldPersistTaps="handled">
        <View style={s.amountBox}>
          <Lbl>Amount</Lbl>
          <TextInput testID="expense-amount" value={group(amount)} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder={`${sym()} 0`} placeholderTextColor={colors.ink40} style={s.bigInput} autoFocus />
        </View>
        <PickerField label="Category" value={category} options={cats.options} onPick={setCategory}
          onAdd={(v) => { cats.add(v); setCategory(v); }} addLabel="Add a category" searchable
          title="What was it spent on?" style={{ marginTop: 12 }} testID="expense-category" />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <PickerField label="Paid from" value={accountId} options={accountOptions} onPick={setAccountId}
            title="Which account paid?" style={{ flex: 1 }} testID="expense-account" />
          <DateField label="Date" value={date} onChange={setDate} style={{ flex: 1 }} testID="expense-date" />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <PickerField label="Shop" value={shop} options={shops.options} onPick={setShop}
            title="Which shop does it belong to?" style={{ flex: 1 }} testID="expense-shop" />
          <PickerField label="Recorded by" value={rep} options={repOptions} onPick={setRep} searchable
            title="Which rep spent it?" style={{ flex: 1 }} testID="expense-rep" />
        </View>
        <Field testID="expense-note" label="Note" value={note} onChangeText={setNote} placeholder="Diesel for generator, 40 litres" style={{ marginTop: 10 }} />
        <Pressable testID="expense-receipt" disabled={uploading} onPress={addReceipt}>
          <Card style={{ marginTop: 9, padding: 9, flexDirection: "row", gap: 9, alignItems: "center" }}>
            {receiptUri
              ? <Image source={{ uri: receiptUri }} style={{ width: 56, height: 56, borderRadius: 10 }} testID="expense-receipt-preview" />
              : <View style={s.receipt}><Ionicons name={uploading ? "cloud-upload-outline" : "camera-outline"} size={20} color={colors.ink40} /></View>}
            <View style={{ flex: 1 }}>
              <H4>{receiptUri ? "Receipt attached" : "Attach a receipt"}</H4>
              <Sub>{uploading ? "Uploading…" : receiptUri ? "Tap to replace the photo" : "Photo of the bill, compressed for slow data"}</Sub>
              <Tag style={{ color: colors.green700 }}>Optional</Tag>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.ink40} />
          </Card>
        </Pressable>
      </KeyboardAwareScrollView>
      <View style={[s.footer, { paddingBottom: pad }]}>
        <Btn testID="expense-save" label="Save expense" onPress={() => m.mutate()} loading={m.isPending} disabled={!parseNum(amount) || !category} />
      </View>
      {m.error ? <Text style={{ display: "none" }}>{(m.error as Error).message}</Text> : null}
    </View>
  );
}
