// 05.8 Receive transfer — a checklist, not a form. A shortfall demands a reason.
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Field, H4, Lbl, Loading, Money, Row, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { money, shortDate } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  route: { fontFamily: fonts.monoSemibold, fontSize: 14, color: c.deep },
  step: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  qty: { fontFamily: fonts.monoSemibold, fontSize: 15, color: c.onSurface, minWidth: 38, textAlign: "center" },
  bar: { backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 14, paddingTop: 10 },
}));

export default function ReceiveTransfer() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [got, setGot] = useState<Record<string, number>>({});
  const [why, setWhy] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const q = useQuery({ queryKey: ["transfer", id], queryFn: () => api(`/transfers/${id}`) });
  const t = q.data;
  const lines = t?.lines ?? [];
  const shortWithoutReason = lines.some((l: any) => {
    const r = got[l.item_id] ?? l.quantity;
    return r < l.quantity && !(why[l.item_id] ?? "").trim();
  });

  const confirm = useMutation({
    mutationFn: () => api(`/transfers/${id}/receive`, {
      method: "POST",
      json: { lines: lines.map((l: any) => ({ item_id: l.item_id, received: got[l.item_id] ?? l.quantity, reason: why[l.item_id] ?? "" })) },
    }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.show(r.state === "discrepancy" ? "Received with a shortfall" : `${t.to_shop} stock updated`, r.number);
      router.replace("/transfers");
    },
    onError: (e: any) => toast.show(e.message),
  });

  const bump = (l: any, delta: number) => {
    const cur = got[l.item_id] ?? l.quantity;
    setGot({ ...got, [l.item_id]: Math.max(0, cur + delta) });
    setChecked({ ...checked, [l.item_id]: true });
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="receive-transfer-screen">
      <AppBar title={t?.number ?? "Transfer"} back mono />
      {!t ? <Loading /> : (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Card>
              <Row between>
                <View>
                  <Text style={s.route}>{t.from_shop} → {t.to_shop}</Text>
                  <Sub>Sent by {t.sent_by || "—"} · {shortDate(t.created_at)}</Sub>
                </View>
                <Money>{money(t.value)}</Money>
              </Row>
              <Sub style={{ marginTop: 8 }}>Check each line, then confirm what actually arrived.</Sub>
            </Card>

            {lines.map((l: any) => {
              const received = got[l.item_id] ?? l.quantity;
              const short = received < l.quantity;
              return (
                <Card key={l.item_id} style={{ marginTop: 9 }} testID={`receive-line-${l.item_id}`}>
                  <Row between>
                    <View style={{ flex: 1 }}>
                      <H4>{l.name}</H4>
                      <Sub>Sent {l.quantity} {l.unit}</Sub>
                    </View>
                    {short ? <Badge tone="over">Short</Badge> : checked[l.item_id] ? <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} /> : null}
                  </Row>
                  <Row between style={{ marginTop: 10 }}>
                    <Lbl>Received</Lbl>
                    <Row style={{ gap: 10 }}>
                      <Pressable style={s.step} hitSlop={6} testID={`receive-minus-${l.item_id}`} onPress={() => bump(l, -1)}>
                        <Ionicons name="remove" size={16} color={colors.deep} />
                      </Pressable>
                      <Text style={s.qty} testID={`receive-qty-${l.item_id}`}>{received}</Text>
                      <Pressable style={s.step} hitSlop={6} testID={`receive-plus-${l.item_id}`} onPress={() => bump(l, 1)}>
                        <Ionicons name="add" size={16} color={colors.deep} />
                      </Pressable>
                    </Row>
                  </Row>
                  {short ? (
                    <Field label={`Short by ${l.quantity - received} — reason`} placeholder="Two packs burst in transit"
                      value={why[l.item_id] ?? ""} onChangeText={(v) => setWhy({ ...why, [l.item_id]: v })}
                      testID={`receive-reason-${l.item_id}`} style={{ marginTop: 10 }} />
                  ) : null}
                </Card>
              );
            })}
          </ScrollView>
          <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Sub style={{ marginBottom: 8 }}>
              {Object.keys(checked).length} of {lines.length} lines checked · {t.to_shop} stock updates on confirm
            </Sub>
            <Btn label="Confirm receipt" disabled={shortWithoutReason} loading={confirm.isPending} testID="receive-confirm" onPress={() => confirm.mutate()} />
          </View>
        </>
      )}
    </View>
  );
}
