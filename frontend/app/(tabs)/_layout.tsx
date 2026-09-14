// Tab bar exactly as drawn: Home · Sales · [green FAB] · Stock · More.
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Av, H4, IonName, Li, Sub } from "@/src/components/ui";
import { Sheet } from "@/src/components/sheet";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const TABS: { name: string; label: string; icon: IonName; iconOn: IonName }[] = [
  { name: "index", label: "Home", icon: "home-outline", iconOn: "home" },
  { name: "sales", label: "Sales", icon: "receipt-outline", iconOn: "receipt" },
  { name: "stock", label: "Stock", icon: "grid-outline", iconOn: "grid" },
  { name: "more", label: "More", icon: "menu-outline", iconOn: "menu" },
];

const ACTIONS: { label: string; sub: string; icon: IonName; route: string; green?: boolean; testID: string }[] = [
  { label: "New invoice", sub: "Customer → items → review", icon: "receipt-outline", route: "/invoices/new", green: true, testID: "fab-new-invoice" },
  { label: "Quick sale", sub: "Tap products, take cash, give change", icon: "flash-outline", route: "/quick-sale", testID: "fab-quick-sale" },
  { label: "Payment in", sub: "Record money received from a customer", icon: "arrow-down-outline", route: "/payments/new", testID: "fab-payment-in" },
  { label: "Expense", sub: "Rent, fuel, wages…", icon: "remove-outline", route: "/expenses/new", testID: "fab-expense" },
  { label: "Add stock", sub: "New item with pricing", icon: "cube-outline", route: "/stock/new", testID: "fab-add-stock" },
  { label: "New customer", sub: "Name and phone only", icon: "person-add-outline", route: "/customers/new", testID: "fab-new-customer" },
];

const useStyles = makeStyles((c) => ({
  bar: { backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 6 },
  tab: { alignItems: "center", justifyContent: "center", minWidth: 56, height: 49 },
  label: { fontFamily: fonts.semibold, fontSize: 10, color: c.ink40, marginTop: 2 },
  labelOn: { color: c.green700 },
  fab: { width: 46, height: 46, borderRadius: 15, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginTop: -16, boxShadow: "0 8px 18px rgba(0,201,141,0.45)", elevation: 6 },
}));

function TabBar({ state, navigation }: BottomTabBarProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const render = (t: (typeof TABS)[number]) => {
    const idx = state.routes.findIndex((r: { name: string }) => r.name === t.name);
    const on = state.index === idx;
    return (
      <Pressable key={t.name} testID={`tab-${t.label.toLowerCase()}`} onPress={() => navigation.navigate(t.name)} style={s.tab}>
        <Ionicons name={on ? t.iconOn : t.icon} size={20} color={on ? colors.green700 : colors.ink40} />
        <Text style={[s.label, on && s.labelOn]}>{t.label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[s.bar, { paddingBottom: insets.bottom, height: 49 + insets.bottom + (Platform.OS === "web" ? 8 : 0) }]} testID="tab-bar">
      {TABS.slice(0, 2).map(render)}
      <Pressable testID="tab-fab" onPress={() => setOpen(true)} style={s.fab}>
        <Ionicons name="add" size={26} color={colors.onSurfaceInverse} />
      </Pressable>
      {TABS.slice(2).map(render)}
      <Sheet visible={open} onClose={() => setOpen(false)} testID="fab-sheet">
        <H4 style={{ marginBottom: 6 }}>What are you recording?</H4>
        {ACTIONS.map((a, i) => (
          <Li key={a.route} testID={a.testID} last={i === ACTIONS.length - 1} onPress={() => { setOpen(false); setTimeout(() => router.push(a.route as any), 150); }}>
            <Av icon={a.icon} tone={a.green ? "green" : "mint"} />
            <View style={{ flex: 1 }}><H4>{a.label}</H4><Sub>{a.sub}</Sub></View>
            <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
          </Li>
        ))}
      </Sheet>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarItemStyle: { alignSelf: "center" } }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="sales" />
      <Tabs.Screen name="stock" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
