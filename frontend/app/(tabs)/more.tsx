// More — settings hub linking to the remaining rails.
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useAuth } from "@/src/auth";
import { AppBar, Av, Badge, Btn, Card, H4, IonName, Li, Lbl, Sub, Tag } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const GROUPS: { title: string; items: { label: string; sub: string; icon: IonName; route?: string; soon?: boolean; testID: string }[] }[] = [
  { title: "Money", items: [
    { label: "Customers", sub: "Debtors, ledgers and statements", icon: "people-outline", route: "/customers", testID: "more-customers" },
    { label: "Expenses", sub: "By period and category", icon: "wallet-outline", route: "/expenses", testID: "more-expenses" },
    { label: "Accounts & payments", sub: "Cash, bank, mobile money", icon: "card-outline", route: "/accounts", testID: "more-accounts" },
    { label: "Suppliers", sub: "Purchases and what you owe", icon: "business-outline", route: "/suppliers", testID: "more-suppliers" },
    { label: "Reports", sub: "Profit & loss, product performance", icon: "bar-chart-outline", route: "/reports", testID: "more-reports" },
  ] },
  { title: "Stock & shops", items: [
    { label: "Stock transfers", sub: "Move goods between branches", icon: "swap-horizontal-outline", route: "/transfers", testID: "more-transfers" },
    { label: "Shops", sub: "Switch branch or add a warehouse", icon: "storefront-outline", route: "/shops", testID: "more-shops" },
    { label: "All shops", sub: "Compare branches side by side", icon: "stats-chart-outline", route: "/shops/overview", testID: "more-all-shops" },
    { label: "Businesses", sub: "Each keeps its own books", icon: "briefcase-outline", route: "/businesses", testID: "more-businesses" },
  ] },
  { title: "Business", items: [
    { label: "Users & permissions", sub: "Roles, scope, app lock", icon: "shield-checkmark-outline", route: "/team", testID: "more-users" },
    { label: "Business profile", sub: "Name, TIN, country, phones and emails", icon: "briefcase-outline", route: "/settings/business", testID: "more-business-profile" },
    { label: "Plan & billing", sub: "What your plan covers and what you are using", icon: "card-outline", route: "/settings/plan", testID: "more-plan" },
    { label: "Invoice settings", sub: "Numbering, VAT, conditions of sale", icon: "options-outline", route: "/settings/invoice", testID: "more-invoice-settings" },
    { label: "Invoice templates", sub: "Logo, brand colour, six layouts", icon: "color-palette-outline", route: "/settings/invoice-template", testID: "more-invoice-templates" },
    { label: "Terms of payment", sub: "Named sets reused on documents", icon: "reader-outline", route: "/settings/terms", testID: "more-terms" },
    { label: "Addresses & numbers", sub: "What prints on your documents", icon: "location-outline", route: "/settings/addresses", testID: "more-addresses" },
    { label: "Backup & sync", sub: "Offline queue and cloud copy", icon: "cloud-upload-outline", route: "/settings/backup", testID: "more-backup" },
    { label: "Import from Excel", sub: "Customers or stock from a CSV", icon: "download-outline", route: "/settings/import", testID: "more-import" },
  ] },
  { title: "Documents & tools", items: [
    { label: "Activity", sub: "Who did what, in which shop", icon: "pulse-outline", route: "/activity", testID: "more-activity" },
    { label: "Bills & receipts", sub: "Snap now, attach later", icon: "camera-outline", route: "/documents/receipts", testID: "more-receipts" },
    { label: "Waybill", sub: "Rides along with the invoice", icon: "car-outline", route: "/documents/waybill/new", testID: "more-waybill" },
    { label: "Calculators", sub: "Margin, discount, VAT, instalments", icon: "calculator-outline", route: "/tools", testID: "more-tools" },
    { label: "Business card", sub: "Share your shop details", icon: "id-card-outline", route: "/tools/business-card", testID: "more-card" },
  ] },
  { title: "Help & legal", items: [
    { label: "Help & support", sub: "Common questions, or write to us", icon: "help-buoy-outline", route: "/help", testID: "more-help" },
    { label: "Terms & conditions", sub: "What we promise, what we ask of you", icon: "document-text-outline", route: "/legal/terms", testID: "more-legal-terms" },
    { label: "Privacy policy", sub: "What we hold and the control you have", icon: "lock-closed-outline", route: "/legal/privacy", testID: "more-legal-privacy" },
  ] },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  name: { fontFamily: fonts.bold, fontSize: 15, color: c.onSurface },
}));

export default function More() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, business, signOut } = useAuth();

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="more-screen">
      <AppBar title="More" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }} testID="more-profile-card">
          <Av text={(user?.name ?? "T").slice(0, 2).toUpperCase()} tone="green" size={40} />
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{business?.name ?? "Your business"}</Text>
            <Sub>{user?.name} · {user?.email}</Sub>
            {business?.tin ? <Tag>TIN {business.tin}</Tag> : null}
          </View>
          <Badge tone="paid">Owner</Badge>
        </Card>
        {GROUPS.map((g) => (
          <View key={g.title}>
            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>{g.title}</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {g.items.map((it, i) => (
                <Li key={it.label} testID={it.testID} last={i === g.items.length - 1} onPress={it.route ? () => router.push(it.route as any) : undefined}>
                  <Av icon={it.icon} tone="sq" />
                  <View style={{ flex: 1 }}><H4>{it.label}</H4><Sub>{it.sub}</Sub></View>
                  {it.soon ? <Badge tone="draft">Next pass</Badge> : <Ionicons name="chevron-forward" size={16} color={colors.ink40} />}
                </Li>
              ))}
            </Card>
          </View>
        ))}
        <Btn label="Sign out" variant="ghost" testID="more-sign-out" style={{ marginTop: 16 }} onPress={async () => { await signOut(); router.replace("/sign-in"); }} />
        <Sub style={{ textAlign: "center", marginTop: 12 }}>TREDI · rev 05 · Made with tredi</Sub>
      </ScrollView>
    </View>
  );
}
