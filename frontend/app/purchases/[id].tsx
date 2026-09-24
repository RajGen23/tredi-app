// 06.4 Purchase order — opened up: what came in, at what cost, which account
// paid for it, and what is still owed on it.
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Divider, H4, Li, Lbl, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { Photo } from "@/src/components/photo";
import { longDate, money, shortDate } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  num: { fontFamily: fonts.monoSemibold, fontSize: 13 },
  photo: { width: 34, height: 34, borderRadius: 9 },
}));

export default function PurchaseDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["purchase", id], queryFn: () => api(`/purchases/${id}`) });
  const p = q.data;

  return (
    <View style={s.root} testID="purchase-detail-screen">
      <View style={[s.teal, { height: insets.top + 118 }]} />
      <View style={{ paddingTop: insets.top }}><AppBar teal back mono title={p?.number ?? "Purchase"} /></View>
      {!p ? <Card style={{ marginHorizontal: 14 }}><Loading /></Card> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24 }}>
          <Card>
            <Row between>
              <Badge tone={p.due > 0 ? "due" : "paid"}>{p.due > 0 ? `${money(p.due)} still owed` : "Paid in full"}</Badge>
              <Tag>{longDate(p.created_at)}</Tag>
            </Row>
            <Row between style={{ marginTop: 9, alignItems: "flex-end" }}>
              <View><Lbl>Bill total</Lbl><Money size={21} testID="purchase-total">{money(p.total)}</Money></View>
              <View style={{ alignItems: "flex-end" }}>
                <Lbl>Paid</Lbl><Money tone="pos">{money(p.paid)}</Money>
                <Tag>{p.account_name}</Tag>
              </View>
            </Row>
            <Divider />
            <Li testID="purchase-open-supplier" last onPress={() => p.supplier && router.push(`/suppliers/${p.supplier.id}`)}>
              <Av icon="business-outline" tone="mint" />
              <View style={{ flex: 1 }}>
                <H4>{p.supplier?.name ?? p.supplier_name}</H4>
                <Sub>{p.supplier?.phone || "Tap to open the supplier"}</Sub>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            <Row between style={{ marginTop: 4, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View><Lbl>Received into</Lbl><Sub>{p.shop || "Main branch"}</Sub></View>
              <View style={{ alignItems: "flex-end" }}><Lbl>Recorded by</Lbl><Sub>{p.created_by || "—"}</Sub></View>
            </Row>
          </Card>

          <Lbl style={{ marginTop: 14, marginBottom: 6 }}>What was procured</Lbl>
          <Card style={{ paddingVertical: 4 }} testID="purchase-lines">
            {(p.lines ?? []).map((l: any, i: number) => (
              <Li key={`${l.name}-${i}`} last={i === p.lines.length - 1} testID={`purchase-line-${i}`}
                onPress={() => l.item_id && router.push(`/stock/${l.item_id}`)}>
                {l.photo_url ? <Photo url={l.photo_url} style={s.photo} /> : <Av icon="cube-outline" tone="sq" />}
                <View style={{ flex: 1 }}>
                  <Row between><H4>{l.name}</H4><Money>{money(l.total)}</Money></Row>
                  <Row between>
                    <Sub>{l.quantity} {l.unit || "unit"} × {money(l.unit_cost)}</Sub>
                    {l.on_hand !== undefined ? <Tag>{l.on_hand} on hand now</Tag> : null}
                  </Row>
                </View>
              </Li>
            ))}
          </Card>
          {p.note ? <Sub style={{ marginTop: 9 }}>{p.note}</Sub> : null}

          {p.payments?.length ? (
            <>
              <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Payments to this supplier</Lbl>
              <Card style={{ paddingVertical: 4 }} testID="purchase-payments">
                {p.payments.map((sp: any, i: number) => (
                  <Li key={sp.id} last={i === p.payments.length - 1}>
                    <Av icon="arrow-up-outline" tone="mint" />
                    <View style={{ flex: 1 }}>
                      <Row between><H4 style={s.num}>{money(sp.amount)}</H4><Tag>{shortDate(sp.date)}</Tag></Row>
                      <Sub>Paid from {sp.account_name}{sp.note ? ` · ${sp.note}` : ""}</Sub>
                    </View>
                  </Li>
                ))}
              </Card>
            </>
          ) : null}

          {p.due > 0 ? (
            <Btn label={`Pay ${money(p.due)} to ${p.supplier?.name ?? "supplier"}`} style={{ marginTop: 14 }} testID="purchase-pay"
              onPress={() => p.supplier && router.push(`/suppliers/${p.supplier.id}`)} />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
