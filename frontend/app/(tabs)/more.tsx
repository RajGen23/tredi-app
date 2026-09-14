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
    { label: "Suppliers", sub: "Purchases and what you owe", icon: "business-outline", soon: true, testID: "more-suppliers" },
    { label: "Reports", sub: "Profit & loss, product performance", icon: "bar-chart-outline", soon: true, testID: "more-reports" },
  ] },
  { title: "Business", items: [
    { label: "Shops & businesses", sub: "Switch or add a branch", icon: "storefront-outline", soon: true, testID: "more-shops" },
    { label: "Users & permissions", sub: "Roles, scope, app lock", icon: "shield-checkmark-outline", soon: true, testID: "more-users" },
    { label: "Backup & sync", sub: "Offline queue, import from Excel", icon: "cloud-upload-outline", soon: true, testID: "more-backup" },
    { label: "Documents", sub: "Receipts, waybill, business card", icon: "document-text-outline", soon: true, testID: "more-documents" },
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
