// 06.2 Supplier profile — identical shape to the customer profile.
import { useState } from "react";
import { ScrollView, Linking, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Empty, Field, H4, IconBtn, Kpi, Lbl, Li, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { initials, money, parseNum, shortDate } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  name: { fontFamily: fonts.extrabold, fontSize: 18, letterSpacing: -0.3, color: "#FFFFFF" },
  phone: { fontFamily: fonts.mono, fontSize: 11.5, color: c.onDeepSoft, marginTop: 2 },
}));

export default function SupplierProfile() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [pay, setPay] = useState(false);
  const [menu, setMenu] = useState(false);
  const [list, setList] = useState<"" | "orders" | "payments">("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["supplier", id], queryFn: () => api(`/suppliers/${id}`) });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api("/accounts") });
  const d = q.data;

  const send = useMutation({
    mutationFn: () => api("/supplier-payments", { method: "POST", json: { supplier_id: id, amount: parseNum(amount), account_id: accountId, note: "Payment out" } }),
    onSuccess: () => {
      qc.invalidateQueries();
      setPay(false);
      setAmount("");
      toast.show("Payment sent", money(parseNum(amount)));
    },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  return (
    <View style={s.root} testID="supplier-profile-screen">
      <View style={[s.teal, { height: insets.top + 150 }]} />
      <View style={{ paddingTop: insets.top }}>
        <AppBar title="Supplier" back teal right={<IconBtn teal name="ellipsis-horizontal" testID="supplier-more" onPress={() => setMenu(true)} />} />
      </View>
      {!d ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
          <Row style={{ gap: 10, marginBottom: 12 }}>
            <Av text={initials(d.name)} tone="white" size={46} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{d.name}</Text>
              <Text style={s.phone}>{d.phone || d.category}</Text>
            </View>
          </Row>
          <Card testID="supplier-payable">
            <Row between style={{ alignItems: "flex-start" }}>
              <View><Lbl>Outstanding payable</Lbl><Money size={20} tone={d.owed > 0 ? "neg" : "mut"} testID="supplier-owed">{money(d.owed)}</Money></View>
              <View style={{ alignItems: "flex-end" }}><Lbl>Purchased</Lbl><Money>{money(d.total_purchased)}</Money></View>
            </Row>
            <Row style={{ marginTop: 12, gap: 8 }}>
              <View style={{ flex: 1 }}><Btn label="Record purchase" small testID="supplier-record-purchase" onPress={() => router.push(`/purchases/new?supplier=${id}`)} /></View>
              <View style={{ flex: 1 }}><Btn label="Pay supplier" small variant="deep" testID="supplier-pay" onPress={() => setPay(true)} /></View>
            </Row>
          </Card>
          <Row style={{ gap: 8, marginTop: 9 }}>
            <View style={{ flex: 1 }}><Kpi label="Orders" value={String(d.purchases.length)} small="tap to see them all" testID="supplier-kpi-orders"
              onPress={() => setList("orders")} /></View>
            <View style={{ flex: 1 }}><Kpi label="Payments sent" value={String(d.payments.length)} small={d.payments[0] ? `last from ${d.payments[0].account_name}` : "none yet"}
              testID="supplier-kpi-payments" onPress={() => setList("payments")} /></View>
          </Row>

          <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Ledger</Lbl>
          {d.purchases.length === 0 && d.payments.length === 0 ? (
            <Card><Empty icon="cart-outline" title="Nothing recorded yet" action={<Btn label="Record purchase" testID="supplier-empty-purchase" onPress={() => router.push(`/purchases/new?supplier=${id}`)} />} /></Card>
          ) : (
            <Card style={{ paddingVertical: 4 }}>
              {d.purchases.map((p: any) => (
                <Li key={p.id} testID={`supplier-purchase-${p.id}`} onPress={() => router.push(`/purchases/${p.id}`)}>
                  <Av icon="cart-outline" tone="sq" />
                  <View style={{ flex: 1 }}>
                    <Row between><H4>{p.number}</H4><Money tone="neg">+ {money(p.total)}</Money></Row>
                    <Row between><Sub>{p.lines.length} line{p.lines.length === 1 ? "" : "s"} · {shortDate(p.created_at)}</Sub>
                      {p.due > 0 ? <Badge tone="due">{money(p.due)} due</Badge> : <Badge tone="paid">Paid</Badge>}</Row>
                    <Tag>Paid from {p.account_name} · tap to see what was procured</Tag>
                  </View>
                </Li>
              ))}
              {d.payments.map((p: any, i: number) => (
                <Li key={p.id} last={i === d.payments.length - 1} testID={`supplier-payment-${p.id}`}>
                  <Av icon="arrow-up-outline" tone="mint" />
                  <View style={{ flex: 1 }}>
                    <Row between><H4>Payment sent</H4><Money tone="pos">− {money(p.amount)}</Money></Row>
                    <Sub>From {p.account_name} · {shortDate(p.created_at)}{p.note ? ` · ${p.note}` : ""}</Sub>
                  </View>
                </Li>
              ))}
            </Card>
          )}
          {d.items.length ? (
            <>
              <Lbl style={{ marginTop: 14, marginBottom: 6 }}>What you buy from them</Lbl>
              <Card style={{ paddingVertical: 4 }}>
                {d.items.map((it: any, i: number) => (
                  <Li key={it.id} last={i === d.items.length - 1} onPress={() => router.push(`/stock/${it.id}`)}>
                    <View style={{ flex: 1 }}><H4>{it.name}</H4><Sub>{it.quantity} {it.unit} on hand</Sub></View>
                    <Tag>{money(it.cost_price)}</Tag>
                  </Li>
                ))}
              </Card>
            </>
          ) : null}
        </ScrollView>
      )}

      <Sheet visible={menu} onClose={() => setMenu(false)} testID="supplier-menu-sheet">
        <H4 style={{ marginBottom: 6 }}>{d?.name ?? "Supplier"}</H4>
        <Li testID="supplier-menu-edit" onPress={() => { setMenu(false); router.push(`/suppliers/new?edit=${id}`); }}>
          <Av icon="create-outline" tone="sq" />
          <View style={{ flex: 1 }}><H4>Edit details</H4><Sub>Phone, address, what they supply, opening balance</Sub></View>
        </Li>
        <Li testID="supplier-menu-purchase" onPress={() => { setMenu(false); router.push(`/purchases/new?supplier=${id}`); }}>
          <Av icon="cart-outline" tone="sq" />
          <View style={{ flex: 1 }}><H4>Record a purchase</H4><Sub>Raises stock and what you owe in one entry</Sub></View>
        </Li>
        <Li testID="supplier-menu-pay" onPress={() => { setMenu(false); setPay(true); }}>
          <Av icon="arrow-up-outline" tone="sq" />
          <View style={{ flex: 1 }}><H4>Pay this supplier</H4><Sub>{money(d?.owed ?? 0)} outstanding</Sub></View>
        </Li>
        <Li last testID="supplier-menu-call" onPress={() => { setMenu(false); if (d?.phone) Linking.openURL(`tel:${String(d.phone).replace(/\s/g, "")}`); else toast.show("No phone saved for them yet"); }}>
          <Av icon="call-outline" tone="sq" />
          <View style={{ flex: 1 }}><H4>Call them</H4><Sub>{d?.phone || "No phone on file"}</Sub></View>
        </Li>
      </Sheet>

      <Sheet visible={list !== ""} onClose={() => setList("")} testID="supplier-list-sheet">
        <H4 style={{ marginBottom: 6 }}>{list === "orders" ? "Every order from them" : "Every payment sent"}</H4>
        <View style={{ maxHeight: 440 }}>
          <ScrollView>
            {list === "orders" ? (d?.purchases ?? []).map((p: any, i: number, arr: any[]) => (
              <Li key={p.id} last={i === arr.length - 1} testID={`supplier-list-order-${p.id}`}
                onPress={() => { setList(""); router.push(`/purchases/${p.id}`); }}>
                <Av icon="cart-outline" tone="sq" />
                <View style={{ flex: 1 }}>
                  <Row between><H4>{p.number}</H4><Money>{money(p.total)}</Money></Row>
                  <Sub>{p.lines.length} line{p.lines.length === 1 ? "" : "s"} · {shortDate(p.created_at)} · paid from {p.account_name}</Sub>
                </View>
              </Li>
            )) : (d?.payments ?? []).map((p: any, i: number, arr: any[]) => (
              <Li key={p.id} last={i === arr.length - 1} testID={`supplier-list-payment-${p.id}`}>
                <Av icon="arrow-up-outline" tone="mint" />
                <View style={{ flex: 1 }}>
                  <Row between><H4>From {p.account_name}</H4><Money tone="pos">− {money(p.amount)}</Money></Row>
                  <Sub>{shortDate(p.created_at)}{p.note ? ` · ${p.note}` : ""}</Sub>
                </View>
              </Li>
            ))}
            {(list === "orders" ? d?.purchases ?? [] : d?.payments ?? []).length === 0
              ? <Sub>Nothing recorded yet.</Sub> : null}
          </ScrollView>
        </View>
      </Sheet>

      <Sheet visible={pay} onClose={() => setPay(false)} testID="supplier-pay-sheet">
        <H4>Pay {d?.name}</H4>
        <Sub style={{ marginTop: 4 }}>Oldest orders are settled first.</Sub>
        <Field label="Amount" placeholder="0" keyboardType="numeric" mono value={amount} onChangeText={setAmount} testID="supplier-pay-amount" style={{ marginTop: 10 }} />
        <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Paid from</Lbl>
        {(accounts.data?.accounts ?? []).map((a: any, i: number, arr: any[]) => (
          <Li key={a.id} last={i === arr.length - 1} testID={`supplier-pay-account-${a.id}`} onPress={() => setAccountId(a.id)}>
            <Av icon="card-outline" tone="sq" />
            <View style={{ flex: 1 }}><H4>{a.name}</H4><Sub>{money(a.balance)} available</Sub></View>
            {accountId === a.id ? <Badge tone="paid">Chosen</Badge> : null}
          </Li>
        ))}
        <Btn label="Send payment" style={{ marginTop: 14 }} disabled={parseNum(amount) <= 0} loading={send.isPending} testID="supplier-pay-save" onPress={() => send.mutate()} />
      </Sheet>
    </View>
  );
}
