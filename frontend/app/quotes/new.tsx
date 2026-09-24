// New quotation — same shape as a new invoice, but nothing leaves stock.
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Field, H4, Lbl, Li, Loading, Money, Row, Sub } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { initials, money, parseNum } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { fonts, makeStyles } from "@/src/theme";

type Line = { item_id: string | null; name: string; quantity: number; unit_price: number; unit: string };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  bar: { backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 14, paddingTop: 10 },
  total: { fontFamily: fonts.monoSemibold, fontSize: 19, letterSpacing: -0.6, color: c.onSurface },
}));

export default function NewQuote() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [pickCustomer, setPickCustomer] = useState(true);
  const [pickItem, setPickItem] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<{ item_id: string | null; name: string; unit: string; qty: string; price: string } | null>(null);
  const [days, setDays] = useState(7);
  const [termsId, setTermsId] = useState<string | null>(null);

  const customers = useQuery({ queryKey: ["customers"], queryFn: () => api("/customers") });
  const items = useQuery({ queryKey: ["items"], queryFn: () => api("/items") });
  const terms = useQuery({ queryKey: ["terms"], queryFn: () => api("/terms") });
  const settings = useQuery({ queryKey: ["invoice-settings"], queryFn: () => api("/settings/invoice") });
  const customer = customers.data?.find((c: any) => c.id === customerId);
  const vat = settings.data?.vat_on ? settings.data.vat_rate : 0;
  const sub = useMemo(() => lines.reduce((a, l) => a + l.quantity * l.unit_price, 0), [lines]);
  const total = sub * (1 + (vat ?? 0) / 100);

  const save = useMutation({
    mutationFn: () => api("/quotes", {
      method: "POST",
      json: { customer_id: customerId, lines, vat_rate: vat ?? 0, valid_until: dayjs().add(days, "day").format("YYYY-MM-DD"), terms_id: termsId },
    }),
    onSuccess: (r: any) => { qc.invalidateQueries(); toast.show(`${money(r.totals.total)} quoted`, r.number); router.replace("/quotes"); },
    onError: (e: any) => toast.show(e.message),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-quote-screen">
      <AppBar title="New quotation" close right={<Badge tone="info">No stock moves</Badge>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Card>
          {customer ? (
            <Row style={{ gap: 10 }}>
              <Av text={initials(customer.name)} tone="sq" />
              <View style={{ flex: 1 }}><H4>{customer.name}</H4><Sub>{customer.phone || customer.price_list}</Sub></View>
              <Chip label="Change" onPress={() => setPickCustomer(true)} testID="quote-change-customer" />
            </Row>
          ) : (
            <Btn label="Choose a customer" variant="ghost" small testID="quote-pick-customer" onPress={() => setPickCustomer(true)} />
          )}
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>What you are quoting</Lbl>
        <Card style={{ paddingVertical: 4 }}>
          {lines.map((l, i) => (
            <Li key={`${l.name}-${i}`} testID={`quote-line-${i}`} onPress={() => setLines((x) => x.filter((_, j) => j !== i))}>
              <View style={{ flex: 1 }}><H4>{l.name}</H4><Sub>{l.quantity} {l.unit} × {money(l.unit_price)}</Sub></View>
              <Money>{money(l.quantity * l.unit_price)}</Money>
            </Li>
          ))}
          <Li last testID="quote-add-item" onPress={() => setPickItem(true)}>
            <Av icon="add" tone="green" />
            <View style={{ flex: 1 }}><H4>Add item</H4><Sub>Services count too</Sub></View>
          </Li>
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Holds for</Lbl>
        <Row style={{ gap: 6 }}>
          {[5, 7, 14, 30].map((d) => <Chip key={d} label={`${d} days`} on={days === d} onPress={() => setDays(d)} testID={`quote-days-${d}`} />)}
        </Row>
        {(terms.data ?? []).length ? (
          <>
            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Terms attached</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {terms.data.map((t: any, i: number) => (
                <Li key={t.id} last={i === terms.data.length - 1} testID={`quote-terms-${t.id}`} onPress={() => setTermsId(termsId === t.id ? null : t.id)}>
                  <View style={{ flex: 1 }}><H4>{t.name}</H4><Sub>{t.sections} sections</Sub></View>
                  {termsId === t.id ? <Badge tone="paid">Attached</Badge> : null}
                </Li>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>

      <View style={[s.bar, { paddingBottom: pad }]}>
        <Row between>
          <View><Lbl>Quoted{vat ? ` · VAT ${vat}%` : ""}</Lbl><Text style={s.total} testID="quote-total">{money(total)}</Text></View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Btn label="Save quotation" disabled={lines.length === 0} loading={save.isPending} testID="quote-save" onPress={() => save.mutate()} />
          </View>
        </Row>
      </View>

      <Sheet visible={pickCustomer} onClose={() => setPickCustomer(false)} testID="quote-customer-sheet">
        <H4>Who is it for?</H4>
        {!customers.data ? <Loading /> : customers.data.map((c: any, i: number, arr: any[]) => (
          <Li key={c.id} last={i === arr.length - 1} testID={`quote-customer-${c.id}`} onPress={() => { setCustomerId(c.id); setPickCustomer(false); }}>
            <Av text={initials(c.name)} tone="sq" />
            <View style={{ flex: 1 }}><H4>{c.name}</H4><Sub>{c.phone || c.price_list}</Sub></View>
          </Li>
        ))}
      </Sheet>

      <Sheet visible={pickItem} onClose={() => { setPickItem(false); setDraft(null); }} testID="quote-item-sheet">
        {!draft ? (
          <>
            <H4>Add item</H4>
            {(items.data ?? []).map((it: any, i: number, arr: any[]) => (
              <Li key={it.id} last={i === arr.length - 1} testID={`quote-item-${it.id}`}
                onPress={() => setDraft({ item_id: it.id, name: it.name, unit: it.unit, qty: "1", price: String(it.selling_price || "") })}>
                <Av icon="cube-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>{it.name}</H4><Sub>{money(it.selling_price)} · {it.quantity} {it.unit}</Sub></View>
              </Li>
            ))}
            <Btn label="Type something not in stock" variant="ghost" small style={{ marginTop: 10 }} testID="quote-item-free"
              onPress={() => setDraft({ item_id: null, name: "", unit: "Piece", qty: "1", price: "" })} />
          </>
        ) : (
          <>
            <H4>{draft.name || "New line"}</H4>
            {!draft.item_id ? <Field label="Description" placeholder="Installation" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} testID="quote-draft-name" style={{ marginTop: 10 }} /> : null}
            <Row style={{ marginTop: 10, gap: 8 }}>
              <View style={{ flex: 1 }}><Field label="Quantity" placeholder="1" keyboardType="numeric" mono value={draft.qty} onChangeText={(v) => setDraft({ ...draft, qty: v })} testID="quote-draft-qty" /></View>
              <View style={{ flex: 1 }}><Field label="Rate" placeholder="0" keyboardType="numeric" mono value={draft.price} onChangeText={(v) => setDraft({ ...draft, price: v })} testID="quote-draft-price" /></View>
            </Row>
            <Btn label="Add line" style={{ marginTop: 14 }} disabled={!draft.name.trim() || parseNum(draft.qty) <= 0} testID="quote-draft-add"
              onPress={() => {
                setLines((l) => [...l, { item_id: draft.item_id, name: draft.name, quantity: parseNum(draft.qty), unit_price: parseNum(draft.price), unit: draft.unit }]);
                setDraft(null);
                setPickItem(false);
              }} />
          </>
        )}
      </Sheet>
    </View>
  );
}
