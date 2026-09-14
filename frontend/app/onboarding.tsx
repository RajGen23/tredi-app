// 00.2 What TREDI does — 3 onboarding steps, then Sign in.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Btn, Card, Lbl, Money, Sub } from "@/src/components/ui";
import { fonts, makeStyles } from "@/src/theme";

const STEPS = [
  { title: "Record the sale now.\nSync when the network is back.", sub: "Sales, stock counts and new customers all save to the phone first. TREDI uploads them the moment you have signal." },
  { title: "Know who owes you,\nbefore they forget.", sub: "Every customer carries a running balance. Overdue invoices show days late and amount due on the row itself." },
  { title: "Stock, priced honestly.", sub: "Every manual change needs a reason. Low stock is flagged before the shelf runs empty." },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary, paddingHorizontal: 16 },
  hero: { backgroundColor: c.brandTertiary, borderRadius: 18, padding: 18, marginTop: 14, gap: 8 },
  title: { fontFamily: fonts.extrabold, fontSize: 24, letterSpacing: -0.7, lineHeight: 30, color: c.onSurface, marginTop: 20 },
  dot: { height: 5, borderRadius: 9, backgroundColor: c.border },
  dotOn: { width: 18, backgroundColor: c.brandPrimary },
  skip: { fontFamily: fonts.regular, fontSize: 12, color: c.ink60 },
}));

export default function Onboarding() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const next = () => (step < 2 ? setStep(step + 1) : router.replace("/sign-in"));

  return (
    <View style={[s.root, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) }]} testID="onboarding-screen">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Lbl>Step {step + 1} of 3</Lbl>
        <Pressable testID="onboarding-skip" onPress={() => router.replace("/sign-in")} hitSlop={8}><Text style={s.skip}>Skip</Text></Pressable>
      </View>
      <View style={s.hero}>
        <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View><Lbl>Today</Lbl><Money size={18}>₦ 84,200</Money></View>
          <Badge tone="paid">Synced</Badge>
        </Card>
        <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", opacity: 0.75 }}>
          <View><Lbl>Offline queue</Lbl><Money size={18}>3 sales</Money></View>
          <Badge tone="due">Waiting</Badge>
        </Card>
        <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", opacity: 0.5 }}>
          <View><Lbl>Debtors</Lbl><Money size={18}>₦ 312,000</Money></View>
          <Badge tone="over">6 late</Badge>
        </Card>
      </View>
      <Text style={s.title}>{STEPS[step].title}</Text>
      <Sub style={{ marginTop: 8, fontSize: 13, lineHeight: 19 }}>{STEPS[step].sub}</Sub>
      <View style={{ marginTop: "auto" }}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 14 }}>
          {[0, 1, 2].map((i) => <View key={i} style={[s.dot, { width: 5 }, i === step && s.dotOn]} />)}
        </View>
        <Btn testID="onboarding-continue" label={step < 2 ? "Continue" : "Get started"} onPress={next} />
      </View>
    </View>
  );
}
