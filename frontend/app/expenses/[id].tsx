// 08.3 One expense — open it, correct anything that was typed wrong (including
// which shop it belongs to), see the receipt, and read the trail of who changed
// what. A row that came from a supplier payment is read-only on purpose.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Divider, Field, H4, Lbl, Li, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { Photo } from "@/src/components/photo";
import { Sheet, useToast } from "@/src/components/sheet";
import { DateField } from "@/src/components/date-field";
import { PickerField } from "@/src/components/picker";
import { useAccounts, useLookup, useShops } from "@/src/lookups";
import { pickAndUploadPhoto } from "@/src/uploads";
import { money, parseNum, shortDate } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  deep: { backgroundColor: c.deep, borderColor: c.deep },
  bold: { fontFamily: fonts.bold },
  receipt: { width: "100%", height: 190, borderRadius: 12, backgroundColor: c.surfaceTertiary },
  footer: { paddingTop: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
}));

export default function ExpenseDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["expense", id], queryFn: () => api(`/expenses/${id}`) });
  const trail = useQuery({ queryKey: ["history", id], queryFn: () => api(`/history/${id}`) });
  const cats = useLookup("expense_category");
  const { accounts, options: accountOptions } = useAccounts();
  const shops = useShops();
  const teamQ = useQuery({ queryKey: ["team"], queryFn: () => api("/team") });

  const e: any = q.data;
  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [shop, setShop] = useState("");
  const [rep, setRep] = useState("");
  const [receipt, setReceipt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [killOpen, setKillOpen] = useState(false);
  const [killReason, setKillReason] = useState("");

  const load = () => {
    if (!e) return;
    setAmount(String(e.amount ?? ""));
    setCategory(e.category ?? "");
    setAccountId(e.account_id ?? null);
    setDate(dayjs(e.created_at).format("YYYY-MM-DD"));
    setNote(e.note ?? "");
    setShop(e.shop ?? "");
    setRep(e.rep ?? "");
    setReceipt(e.receipt_url ?? "");
  };
  useEffect(load, [e?.id]);

  const repOptions = ((teamQ.data as any)?.users ?? []).filter((u: any) => u.active !== false)
    .map((u: any) => ({ key: u.name, label: u.name, sub: u.role_label }));

  const changes = e ? [
    parseNum(amount) !== e.amount ? `${money(e.amount)} → ${money(parseNum(amount))}` : "",
    category !== e.category ? `${e.category} → ${category}` : "",
    shop !== (e.shop ?? "") ? `moved to ${shop || "no shop"}` : "",
    rep !== (e.rep ?? "") ? `recorded by ${rep}` : "",
    accountId !== (e.account_id ?? null) ? `paid from ${accounts.find((a: any) => a.id === accountId)?.name ?? "Cash"}` : "",
    date !== dayjs(e.created_at).format("YYYY-MM-DD") ? `dated ${dayjs(date).format("DD MMM YYYY")}` : "",
    note !== (e.note ?? "") ? "note changed" : "",
    receipt !== (e.receipt_url ?? "") ? "receipt changed" : "",
  ].filter(Boolean) : [];

  const save = useMutation({
    mutationFn: () => api(`/expenses/${id}`, {
      method: "PUT",
      json: { amount: parseNum(amount), category, account_id: accountId, date, note, shop, rep, receipt_url: receipt || null },
    }),
    onSuccess: () => {
      ["expense", "expenses", "history", "dashboard", "accounts", "activity", "reports-summary"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setConfirm(false);
      setEdit(false);
      toast.show("The change is on the activity trail", "Expense corrected.");
    },
    onError: (err: any) => { setConfirm(false); toast.show(err.message ?? "Could not save the change"); },
  });

  const kill = useMutation({
    mutationFn: () => api(`/expenses/${id}?reason=${encodeURIComponent(killReason)}`, { method: "DELETE" }),
    onSuccess: (r: any) => {
      ["expenses", "dashboard", "accounts", "activity"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setKillOpen(false);
      toast.show(r?.message ?? "Expense removed");
      router.back();
    },
    onError: (err: any) => toast.show(err.message ?? "Could not remove it"),
  });

  const changeReceipt = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadPhoto();
      if (url) setReceipt(url);
    } catch (err: any) {
      toast.show(err.message ?? "Could not attach that photo", undefined, "bad");
    } finally {
      setUploading(false);
    }
  };

  if (!e) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]} testID="expense-detail-screen">
        <AppBar title="Expense" back />
        {q.isError ? <Sub style={{ padding: 14 }}>That expense is no longer here.</Sub> : <Loading />}
      </View>
    );
  }

  const Body = edit ? KeyboardAwareScrollView : ScrollView;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="expense-detail-screen">
      <AppBar title={edit ? "Edit expense" : e.category} back onBack={() => (edit ? (setEdit(false), load()) : router.back())}
        rightText={e.editable && !edit ? "Edit" : undefined} onRightText={() => setEdit(true)} rightTextTestID="expense-edit" />
      <Body contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 20 }} keyboardShouldPersistTaps="handled" bottomOffset={90}>
        <Card style={s.deep} testID="expense-amount-card">
          <Lbl style={{ color: colors.onDeepMuted }}>{edit ? "Amount being corrected" : "Amount"}</Lbl>
          <Money tone="white" size={24} testID="expense-detail-amount">{money(edit ? parseNum(amount) : e.amount)}</Money>
          <Row style={{ gap: 12, marginTop: 6 }}>
            <Sub style={{ color: colors.onDeepSoft }}>{shortDate(e.created_at)}</Sub>
            <Sub style={{ color: colors.onDeepSoft }}>{e.account_name}</Sub>
            {e.shop ? <Sub style={{ color: colors.onDeepSoft }}>{e.shop}</Sub> : null}
          </Row>
        </Card>

        {!e.editable ? (
          <Card style={{ marginTop: 9, backgroundColor: colors.warning, borderColor: "transparent" }} testID="expense-locked">
            <Sub>{e.locked_because ?? "This row is kept in step with another record."}</Sub>
          </Card>
        ) : null}

        {edit ? (
          <>
            <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" mono style={{ marginTop: 10 }} testID="expense-edit-amount" />
            <PickerField label="Category" value={category} options={cats.options} onPick={setCategory}
              onAdd={(v) => { cats.add(v); setCategory(v); }} addLabel="Add a category" searchable
              title="What was it spent on?" style={{ marginTop: 10 }} testID="expense-edit-category" />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <PickerField label="Paid from" value={accountId} options={accountOptions} onPick={setAccountId}
                title="Which account paid?" style={{ flex: 1 }} testID="expense-edit-account" />
              <DateField label="Date" value={date} onChange={setDate} style={{ flex: 1 }} testID="expense-edit-date" />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <PickerField label="Shop" value={shop} options={shops.options} onPick={setShop}
                title="Which shop does it belong to?" style={{ flex: 1 }} testID="expense-edit-shop" />
              <PickerField label="Recorded by" value={rep} options={repOptions} onPick={setRep} searchable
                title="Which rep spent it?" style={{ flex: 1 }} testID="expense-edit-rep" />
            </View>
            <Field label="Note" value={note} onChangeText={setNote} placeholder="What it was for" style={{ marginTop: 10 }} testID="expense-edit-note" />
            <Pressable testID="expense-edit-receipt" disabled={uploading} onPress={changeReceipt}>
              <Card style={{ marginTop: 9, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Av icon={uploading ? "cloud-upload-outline" : receipt ? "image-outline" : "camera-outline"} tone="sq" />
                <View style={{ flex: 1 }}>
                  <H4>{receipt ? "Replace the receipt" : "Attach a receipt"}</H4>
                  <Sub>{uploading ? "Uploading…" : "A photo of the bill, kept with this expense"}</Sub>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.ink40} />
              </Card>
            </Pressable>
            {receipt ? <Photo url={receipt} style={[s.receipt, { marginTop: 9 }]} testID="expense-edit-receipt-photo" /> : null}
          </>
        ) : (
          <>
            <Card style={{ marginTop: 9, paddingVertical: 4 }} testID="expense-facts">
              <Li><View style={{ flex: 1 }}><Lbl>Category</Lbl><H4>{e.category}</H4></View><Badge tone="info">{e.shop || "No shop"}</Badge></Li>
              <Li><View style={{ flex: 1 }}><Lbl>Paid from</Lbl><H4>{e.account_name}</H4></View><Tag>{shortDate(e.created_at)}</Tag></Li>
              <Li><View style={{ flex: 1 }}><Lbl>Recorded by</Lbl><H4>{e.rep || "Not recorded"}</H4></View></Li>
              <Li last><View style={{ flex: 1 }}><Lbl>Note</Lbl><H4>{e.note || "—"}</H4></View></Li>
            </Card>
            {e.receipt_url ? (
              <>
                <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Receipt</Lbl>
                <Photo url={e.receipt_url} style={s.receipt} testID="expense-receipt-photo" />
              </>
            ) : (
              <Card style={{ marginTop: 9 }}><Sub>No receipt photo on this expense.</Sub></Card>
            )}
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Activity trail</Lbl>
            <Card style={{ paddingVertical: 4 }} testID="expense-trail">
              {!trail.data ? <Loading /> : (trail.data.rows ?? []).length === 0 ? (
                <Li last><Sub style={{ flex: 1 }}>Nothing recorded against this expense yet.</Sub></Li>
              ) : (trail.data.rows ?? []).map((r: any, i: number, arr: any[]) => (
                <Li key={r.id} last={i === arr.length - 1}>
                  <Av icon="pulse-outline" tone="sq" />
                  <View style={{ flex: 1 }}>
                    <H4>{r.title}</H4>
                    <Sub>{r.sub ? `${r.sub} · ` : ""}{r.by || "—"} · {shortDate(r.created_at)}</Sub>
                  </View>
                </Li>
              ))}
            </Card>
            {e.editable ? (
              <Pressable onPress={() => setKillOpen(true)} testID="expense-delete" style={{ alignSelf: "center", marginTop: 16, padding: 6 }}>
                <H4 style={{ color: colors.coral }}>Remove this expense</H4>
              </Pressable>
            ) : null}
          </>
        )}
      </Body>

      {edit ? (
        <View style={[s.footer, { paddingBottom: pad }]}>
          <Btn label="Save changes" disabled={!parseNum(amount) || changes.length === 0} testID="expense-save-changes"
            onPress={() => setConfirm(true)} />
          <Btn variant="ghost" small label="Cancel" style={{ marginTop: 8 }} testID="expense-cancel-edit" onPress={() => { setEdit(false); load(); }} />
        </View>
      ) : null}

      <Sheet visible={confirm} onClose={() => setConfirm(false)} testID="expense-confirm-sheet">
        <H4>Save this correction?</H4>
        <Sub style={{ marginTop: 3 }}>The change is written to the activity trail with your name on it.</Sub>
        <Card style={{ marginTop: 11 }}>
          {changes.map((c) => <Row key={c} style={{ gap: 8, paddingVertical: 4 }}><Ionicons name="arrow-forward" size={13} color={colors.green700} /><Sub style={{ flex: 1 }}>{c}</Sub></Row>)}
        </Card>
        <Divider />
        <Row between><Sub>New amount</Sub><Money size={15}>{money(parseNum(amount))}</Money></Row>
        <Btn label="Yes, save it" style={{ marginTop: 12 }} loading={save.isPending} testID="expense-confirm-save" onPress={() => save.mutate()} />
      </Sheet>

      <Sheet visible={killOpen} onClose={() => setKillOpen(false)} testID="expense-kill-sheet">
        <H4>Remove this expense?</H4>
        <Sub style={{ marginTop: 3 }}>
          It comes off your books and your reports. The row stays in the <Text style={s.bold}>activity trail</Text> with the reason you give,
          so nothing disappears silently.
        </Sub>
        <Field label="Reason" value={killReason} onChangeText={setKillReason} placeholder="Entered twice by mistake" style={{ marginTop: 10 }} testID="expense-kill-reason" />
        <Btn label="Remove it" variant="coral" style={{ marginTop: 12 }} disabled={!killReason.trim()} loading={kill.isPending}
          testID="expense-kill-confirm" onPress={() => kill.mutate()} />
      </Sheet>
    </View>
  );
}
