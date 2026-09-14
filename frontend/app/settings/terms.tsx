// 04.15 Terms of payment — named sets so long clauses are written once.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Badge, Btn, Card, Empty, Field, H4, IconBtn, Lbl, Loading, Row, Sub, Switch } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { makeStyles } from "@/src/theme";

const blank = { id: "", name: "", payment_structure: "", delivery_condition: "", additional_notes: "", is_default: false };

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Terms() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<typeof blank | null>(null);
  const q = useQuery({ queryKey: ["terms"], queryFn: () => api("/terms") });

  const save = useMutation({
    mutationFn: () => {
      const body = { name: edit!.name, payment_structure: edit!.payment_structure, delivery_condition: edit!.delivery_condition, additional_notes: edit!.additional_notes, is_default: edit!.is_default };
      return edit!.id ? api(`/terms/${edit!.id}`, { method: "PUT", json: body }) : api("/terms", { method: "POST", json: body });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["terms"] }); setEdit(null); toast.show("Terms saved"); },
    onError: (e: any) => toast.show(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/terms/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["terms"] }); toast.show("Terms removed"); },
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="terms-screen">
      <AppBar title="Terms of payment" back right={<IconBtn name="add" testID="terms-add" onPress={() => setEdit({ ...blank })} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        {!q.data ? <Loading /> : q.data.length === 0 ? (
          <Card>
            <Empty icon="document-text-outline" title="No terms saved yet" sub="Payment structure, delivery condition and additional notes — written once, reused."
              action={<Btn label="Write your first set" testID="terms-empty-add" onPress={() => setEdit({ ...blank })} />} />
          </Card>
        ) : q.data.map((t: any) => (
          <Card key={t.id} style={{ marginBottom: 9 }} testID={`terms-${t.id}`}>
            <Row between>
              <View style={{ flex: 1 }}><H4>{t.name}</H4><Sub>{t.sections} section{t.sections === 1 ? "" : "s"}</Sub></View>
              {t.is_default ? <Badge tone="paid">Attached by default</Badge> : null}
            </Row>
            {t.payment_structure ? <><Lbl style={{ marginTop: 10 }}>Payment structure</Lbl><Sub>{t.payment_structure}</Sub></> : null}
            {t.delivery_condition ? <><Lbl style={{ marginTop: 8 }}>Delivery condition</Lbl><Sub>{t.delivery_condition}</Sub></> : null}
            {t.additional_notes ? <><Lbl style={{ marginTop: 8 }}>Additional notes</Lbl><Sub>{t.additional_notes}</Sub></> : null}
            <Row style={{ marginTop: 10, gap: 8 }}>
              <View style={{ flex: 1 }}><Btn label="Edit" variant="ghost" small testID={`terms-edit-${t.id}`} onPress={() => setEdit({ ...t })} /></View>
              <View style={{ flex: 1 }}><Btn label="Delete" variant="coral" small testID={`terms-delete-${t.id}`} onPress={() => remove.mutate(t.id)} /></View>
            </Row>
          </Card>
        ))}
      </ScrollView>

      <Sheet visible={!!edit} onClose={() => setEdit(null)} testID="terms-sheet">
        <H4>{edit?.id ? "Edit terms" : "New terms"}</H4>
        {edit ? (
          <>
            <Field label="Set name" placeholder="Head office terms" value={edit.name} onChangeText={(v) => setEdit({ ...edit, name: v })} testID="terms-name" style={{ marginTop: 10 }} />
            <Field label="Payment structure" multiline placeholder="100% payment on order confirmation." value={edit.payment_structure}
              onChangeText={(v) => setEdit({ ...edit, payment_structure: v })} testID="terms-payment" style={{ marginTop: 8 }} />
            <Field label="Delivery condition" multiline placeholder="Two to five days for items held in our warehouse." value={edit.delivery_condition}
              onChangeText={(v) => setEdit({ ...edit, delivery_condition: v })} testID="terms-delivery" style={{ marginTop: 8 }} />
            <Field label="Additional notes" multiline placeholder="Payment is confirmed only after it reflects in the bank." value={edit.additional_notes}
              onChangeText={(v) => setEdit({ ...edit, additional_notes: v })} testID="terms-notes" style={{ marginTop: 8 }} />
            <Row between style={{ marginTop: 12 }}>
              <View style={{ flex: 1 }}><H4>Attach by default</H4><Sub>On invoices and quotations</Sub></View>
              <Switch on={edit.is_default} onChange={(v) => setEdit({ ...edit, is_default: v })} testID="terms-default" />
            </Row>
            <Btn label="Save terms" style={{ marginTop: 14 }} disabled={!edit.name.trim()} loading={save.isPending} testID="terms-save" onPress={() => save.mutate()} />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
