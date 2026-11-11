// 03.2 Customer profile — teal top, debt hero, shortcuts, KPIs, links.
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppBar, Av, Badge, Card, Divider, H4, IconBtn, IonName, Kpi, Li, Lbl, Loading, Money, Row, Sub } from "@/src/components/ui";
import { initials, money } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

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
  const pad = useBottomPad();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["customer", id], queryFn: () => api(`/customers/${id}`) });
  const c = q.data;
  const { user } = useAuth();
  const totalsOk = user?.perms?.see_customer_totals !== false;

  const shortcuts: { label: string; icon: IonName; green?: boolean; onPress: () => void; testID: string }[] = [
    { label: "Sale", icon: "flash-outline", green: true, onPress: () => router.push("/quick-sale"), testID: "customer-shortcut-sale" },
    { label: "Invoice", icon: "receipt-outline", onPress: () => router.push({ pathname: "/invoices/new", params: { customer_id: id } }), testID: "customer-shortcut-invoice" },
    { label: "Payment in", icon: "arrow-down", onPress: () => router.push({ pathname: "/payments/new", params: { customer_id: id } }), testID: "customer-shortcut-payment-in" },
    { label: "Payment out", icon: "arrow-up", onPress: () => router.push({ pathname: "/payments/out", params: { customer_id: id } }), testID: "customer-shortcut-payment-out" },
  ];

  return (
    <View style={s.root} testID="customer-profile-screen">
      <View style={[s.teal, { height: insets.top + 132 }]} />
      <View style={{ paddingTop: insets.top }}>
        <AppBar teal back title="Customer" right={<>
          {c?.phone ? <IconBtn teal name="call-outline" testID="customer-call" onPress={() => Linking.openURL(`tel:${String(c.phone).replace(/\s/g, "")}`)} /> : null}
          <IconBtn teal name="create-outline" testID="customer-edit" onPress={() => router.push({ pathname: "/customers/new", params: { edit: id } })} />
          {totalsOk ? <IconBtn teal name="ellipsis-horizontal" testID="customer-more" onPress={() => router.push(`/customers/ledger/${id}`)} /> : null}
        </>} />
      </View>
      {!c ? <Card style={{ marginHorizontal: 14 }}><Loading /></Card> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
          <Card>
            <Row>
              <Av text={initials(c.name)} tone="green" size={40} />
              <View style={{ flex: 1 }}><H4 style={{ fontSize: 15 }} testID="customer-name">{c.name}</H4><Text style={s.phone}>{c.phone || "No phone"}</Text></View>
              {!totalsOk ? null : c.overdue_count > 0 ? <Badge tone="over">Overdue</Badge> : c.balance > 0 ? <Badge tone="due">Owing</Badge> : <Badge tone="paid">Clear</Badge>}
            </Row>
            {totalsOk ? <>
            <Divider />
            {/* The three figures the old app put on one card: what they have
                bought, what is still unpaid, and what came back as returns. */}
            <View style={{ flexDirection: "row" }} testID="customer-figures">
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Lbl numberOfLines={1}>Purchased</Lbl>
                <Money size={14} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="customer-purchased">{money(c.total_purchases)}</Money>
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Lbl numberOfLines={1}>Unpaid debt</Lbl>
                <Money tone="neg" size={14} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="customer-debt">{money(Math.max(0, c.unpaid))}</Money>
              </View>
              <View style={{ flex: 1 }}>
                <Lbl numberOfLines={1}>Returns</Lbl>
                <Money size={14} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="customer-returns">{money(c.returns_total)}</Money>
              </View>
            </View>
            <Row between style={{ marginTop: 8 }}>
              <Sub>{c.returns_count ? `${c.returns_count} return${c.returns_count === 1 ? "" : "s"} on record` : "No returns on record"}</Sub>
              <Sub>{Math.max(0, -c.balance) > 0 ? `${money(Math.max(0, -c.balance))} unused credit` : c.credit_limit ? `Limit ${money(c.credit_limit)}` : "No credit limit"}</Sub>
            </Row>
            </> : null}
            <View style={{ flexDirection: "row", marginTop: 11, gap: 6 }}>
              {shortcuts.map((sc) => (
                <Pressable key={sc.label} testID={sc.testID} onPress={sc.onPress} style={{ flex: 1, alignItems: "center" }}>
                  <Av icon={sc.icon} tone={sc.green ? "green" : "mint"} size={36} radiusOverride={12} />
                  <Text style={s.scLabel}>{sc.label}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
          {totalsOk ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 }}>
            <View style={{ width: "48.5%" }}><Kpi label="Total received" value={money(c.total_received)} tone="pos" /></View>
            <View style={{ width: "48.5%" }}><Kpi label="Total purchases" value={money(c.total_purchases)} small={`${c.invoices.length} invoices`} /></View>
            <View style={{ width: "48.5%" }}><Kpi label="Overdue invoices" value={String(c.overdue_count)} small={c.max_days_overdue ? `${c.max_days_overdue} days late` : "none"} tone={c.overdue_count ? "neg" : undefined} /></View>
            <View style={{ width: "48.5%" }}><Kpi label="Price list" value={c.price_list} small={c.credit_limit ? `Limit ${money(c.credit_limit)}` : "No limit"} onPress={() => router.push({ pathname: "/customers/new", params: { edit: id } })} testID="customer-edit-price-list" /></View>
          </View> : null}
          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            {totalsOk ? <Li testID="customer-ledger-link" onPress={() => router.push(`/customers/ledger/${id}`)}>
              <Av icon="receipt-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Ledger & statement</H4><Sub>{c.invoices.length} sales on record</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li> : null}
            {totalsOk ? <Li testID="customer-items-link" onPress={() => router.push(`/customers/items/${id}`)}>
              <Av icon="swap-horizontal-outline" tone="sq" /><View style={{ flex: 1 }}><H4>Items supplied to this customer</H4><Sub>Distribution history</Sub></View><Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li> : null}
            <Li last testID="customer-pricing-link" onPress={() => router.push(`/customers/pricing/${id}`)}>
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
