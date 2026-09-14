// 03.2 Customer profile — teal top, debt hero, shortcuts, KPIs, links.
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Card, Divider, H4, IconBtn, IonName, Kpi, Li, Lbl, Loading, Money, Row, Sub } from "@/src/components/ui";
import { initials, money } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  scLabel: { fontFamily: fonts.semibold, fontSize: 9.5, color: c.onSurface, marginTop: 4, textAlign: "center" },
  phone: { fontFamily: fonts.mono, fontSize: 12, color: c.ink60 },
}));

export default function CustomerProfile() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["customer", id], queryFn: () => api(`/customers/${id}`) });
  const c = q.data;

  const shortcuts: { label: string; icon: IonName; green?: boolean; onPress: () => void; testID: string }[] = [
    { label: "Sale", icon: "flash-outline", green: true, onPress: () => router.push("/quick-sale"), testID: "customer-shortcut-sale" },
    { label: "Invoice", icon: "receipt-outline", onPress: () => router.push({ pathname: "/invoices/new", params: { customer_id: id } }), testID: "customer-shortcut-invoice" },
    { label: "Payment in", icon: "arrow-down", onPress: () => router.push({ pathname: "/payments/new", params: { customer_id: id } }), testID: "customer-shortcut-payment-in" },
    { label: "Payment out", icon: "arrow-up", onPress: () => {}, testID: "customer-shortcut-payment-out" },
  ];

  return (
    <View style={s.root} testID="customer-profile-screen">
      <View style={[s.teal, { height: insets.top + 132 }]} />
      <View style={{ paddingTop: insets.top }}>
        <AppBar teal back title="Customer" right={<><IconBtn teal name="create-outline" testID="customer-edit" /><IconBtn teal name="ellipsis-horizontal" testID="customer-more" /></>} />
      </View>
      {!c ? <Card style={{ marginHorizontal: 14 }}><Loading /></Card> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
          <Card>
            <Row>
              <Av text={initials(c.name)} tone="green" size={40} />
              <View style={{ flex: 1 }}><H4 style={{ fontSize: 15 }} testID="customer-name">{c.name}</H4><Text style={s.phone}>{c.phone || "No phone"}</Text></View>
              {c.overdue_count > 0 ? <Badge tone="over">Overdue</Badge> : c.balance > 0 ? <Badge tone="due">Owing</Badge> : <Badge tone="paid">Clear</Badge>}
            </Row>
            <Divider />
            <Row between style={{ alignItems: "flex-start" }}>
              <View><Lbl>Outstanding debt</Lbl><Money tone="neg" size={20} testID="customer-debt">{money(Math.max(0, c.balance))}</Money></View>
              <View style={{ alignItems: "flex-end" }}><Lbl>Unused credit</Lbl><Money tone="pos">{money(Math.max(0, -c.balance))}</Money></View>
            </Row>
            <View style={{ flexDirection: "row", marginTop: 11, gap: 6 }}>
              {shortcuts.map((sc) => (
                <Pressable key={sc.label} testID={sc.testID} onPress={sc.onPress} style={{ flex: 1, alignItems: "center" }}>
                  <Av icon={sc.icon} tone={sc.green ? "green" : "mint"} size={36} radiusOverride={12} />
                  <Text style={s.scLabel}>{sc.label}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 }}>
            <View style={{ width: "48.5%" }}><Kpi label="Total received" value={money(c.total_received)} tone="pos" /></View>
            <View style={{ width: "48.5%" }}><Kpi label="Total purchases" value={money(c.total_purchases)} small={`${c.invoices.length} invoices`} /></View>
            <View style={{ width: "48.5%" }}><Kpi label="Overdue invoices" value={String(c.overdue_count)} small={c.max_days_overdue ? `${c.max_days_overdue} days late` : "none"} tone={c.overdue_count ? "neg" : undefined} /></View>
            <View style={{ width: "48.5%" }}><Kpi label="Price list" value={c.price_list} small={c.credit_limit ? `Limit ${money(c.credit_limit)}` : "No limit"} /></View>
          </View>
          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            <Li testID="customer-ledger-link" onPress={() => router.push(`/customers/ledger/${id}`)}>
              <Av icon="receipt-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Ledger & statement</H4><Sub>{c.invoices.length} sales on record</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            <Li testID="customer-items-link">
              <Av icon="swap-horizontal-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Items supplied to this customer</H4><Sub>Distribution history</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            <Li last testID="customer-pricing-link">
              <Av icon="pricetag-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Special pricing</H4><Sub>Prices below retail for this customer</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
          </Card>
          {c.invoices.length ? (
            <>
              <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Invoices</Lbl>
              <Card style={{ paddingVertical: 4 }}>
                {c.invoices.map((inv: any, i: number) => (
                  <Li key={inv.id} testID={`customer-invoice-${inv.number}`} last={i === c.invoices.length - 1} onPress={() => router.push(`/invoices/${inv.id}`)}>
                    <View style={{ flex: 1 }}><H4 style={{ fontFamily: fonts.monoSemibold, fontSize: 12.5 }}>{inv.number}</H4><Sub>{inv.lines.length} items</Sub></View>
                    <View style={{ alignItems: "flex-end" }}><Money tone={inv.status === "overdue" ? "neg" : undefined}>{money(inv.totals.total)}</Money><Badge tone={inv.status === "paid" ? "paid" : inv.status === "overdue" ? "over" : "due"} style={{ marginTop: 3 }}>{inv.status === "paid" ? "Paid" : inv.status === "overdue" ? `${inv.days_overdue}d overdue` : `Due ${money(inv.due)}`}</Badge></View>
                  </Li>
                ))}
              </Card>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
