// Sales returns — the list plus a credit note that puts stock back.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Empty, Field, H4, IconBtn, Lbl, Li, Loading, Money, Row, Sub, Switch } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { money, parseNum, shortDate } from "@/src/format";
import { makeStyles } from "@/src/theme";

const REASONS = ["Damaged on delivery", "Wrong item", "Customer changed mind", "Expired", "Short supply"];

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Returns() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState(REASONS[0]);
  const [restock, setRestock] = useState(true);

  const list = useQuery({ queryKey: ["returns"], queryFn: () => api("/returns") });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => api("/invoices") });
  const invoice = invoices.data?.find((i: any) => i.id === invoiceId);

  const save = useMutation({
    mutationFn: () => api("/returns", {
      method: "POST",
      json: {
        invoice_id: invoiceId,
        customer_id: invoice?.customer_id ?? null,
        reason,
        restock,
        lines: (invoice?.lines ?? [])
          .filter((l: any) => parseNum(qty[l.name] ?? "0") > 0)
          .map((l: any) => ({ item_id: l.item_id, name: l.name, quantity: parseNum(qty[l.name]), unit_price: l.unit_price })),
      },
    }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      setOpen(false);
      setInvoiceId(null);
      setQty({});
      toast.show(`${money(r.total)} credited back`, r.number);
    },
    onError: (e: any) => toast.show(e.message),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="returns-screen">
      <AppBar title="Sales returns" back right={<IconBtn name="add" testID="returns-add" onPress={() => setOpen(true)} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        {!list.data ? <Loading /> : list.data.length === 0 ? (
          <Card><Empty icon="return-down-back-outline" title="No returns yet" sub="A return puts stock back and credits the customer." action={<Btn label="Record a return" testID="returns-empty-add" onPress={() => setOpen(true)} />} /></Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {list.data.map((r: any, i: number) => (
              <Li key={r.id} last={i === list.data.length - 1} testID={`return-${r.id}`}>
                <Av icon="return-down-back-outline" tone="coral" />
                <View style={{ flex: 1 }}>
                  <Row between><H4>{r.number}</H4><Money tone="neg">{money(r.total)}</Money></Row>
                  <Row between><Sub>{r.reason}</Sub><Sub>{shortDate(r.created_at)}</Sub></Row>
                </View>
                {r.restock ? <Badge tone="paid">Restocked</Badge> : null}
              </Li>
            ))}
          </Card>
        )}
      </ScrollView>

      <Sheet visible={open} onClose={() => setOpen(false)} testID="return-sheet">
        <H4>Record a return</H4>
        {!invoiceId ? (
          <>
            <Sub style={{ marginTop: 4 }}>Pick the invoice it came from.</Sub>
            <View style={{ marginTop: 8 }}>
              {(invoices.data ?? []).filter((i: any) => i.status !== "draft").slice(0, 12).map((i: any, idx: number, arr: any[]) => (
                <Li key={i.id} last={idx === arr.length - 1} testID={`return-pick-${i.id}`} onPress={() => setInvoiceId(i.id)}>
                  <View style={{ flex: 1 }}><H4>{i.number}</H4><Sub>{i.customer_name} · {shortDate(i.created_at)}</Sub></View>
                  <Money>{money(i.totals.total)}</Money>
                </Li>
              ))}
            </View>
          </>
        ) : (
          <>
            <Sub style={{ marginTop: 4 }}>{invoice?.number} · {invoice?.customer_name}</Sub>
            {(invoice?.lines ?? []).map((l: any) => (
              <Row key={l.name} between style={{ marginTop: 9 }}>
                <View style={{ flex: 1 }}><H4>{l.name}</H4><Sub>sold {l.quantity} · {money(l.unit_price)}</Sub></View>
                <View style={{ width: 92 }}>
                  <Field label="Return" keyboardType="numeric" mono placeholder="0" testID={`return-qty-${l.name}`}
                    value={qty[l.name] ?? ""} onChangeText={(v) => setQty({ ...qty, [l.name]: v })} />
                </View>
              </Row>
            ))}
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Reason</Lbl>
            <View style={{ gap: 6 }}>
              {REASONS.map((r) => (
                <Li key={r} last testID={`return-reason-${r}`} onPress={() => setReason(r)}>
                  <View style={{ flex: 1 }}><H4>{r}</H4></View>
                  {reason === r ? <Badge tone="paid">Chosen</Badge> : null}
                </Li>
              ))}
            </View>
            <Row between style={{ marginTop: 10 }}>
              <View style={{ flex: 1 }}><H4>Put the stock back</H4><Sub>Off for damaged goods</Sub></View>
              <Switch on={restock} onChange={setRestock} testID="return-restock" />
            </Row>
            <Btn label="Save return" style={{ marginTop: 14 }} loading={save.isPending} testID="return-save" onPress={() => save.mutate()} />
            <Btn label="Pick another invoice" variant="ghost" small style={{ marginTop: 8 }} onPress={() => setInvoiceId(null)} />
          </>
        )}
      </Sheet>
    </View>
  );
}
