// 13.3 Calculators — the one that touches money daily is open on arrival.
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { AppBar, Av, Card, Divider, Field, H4, IonName, Lbl, Li, Money, Row, Seg, Sub } from "@/src/components/ui";
import { money, parseNum } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Tool = "margin" | "discount" | "vat" | "instalments";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  result: { fontFamily: fonts.monoSemibold, fontSize: 18, letterSpacing: -0.5, color: c.onSurface },
}));

const OTHERS: { key: Tool; label: string; sub: string; icon: IonName }[] = [
  { key: "discount", label: "Discount", sub: "Price after one or two discounts", icon: "pricetag-outline" },
  { key: "vat", label: "VAT", sub: "Add or strip 7.5%", icon: "cash-outline" },
  { key: "instalments", label: "Interest & instalments", sub: "What a customer pays monthly", icon: "time-outline" },
];

export default function Tools() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tool, setTool] = useState<Tool>("margin");

  const [cost, setCost] = useState("");
  const [sell, setSell] = useState("");
  const [price, setPrice] = useState("");
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  const [gross, setGross] = useState("");
  const [vatMode, setVatMode] = useState<"add" | "strip">("add");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("2");
  const [months, setMonths] = useState("6");

  const margin = useMemo(() => {
    const c = parseNum(cost);
    const sl = parseNum(sell);
    const profit = sl - c;
    return { profit, margin: sl ? (profit / sl) * 100 : 0, markup: c ? (profit / c) * 100 : 0 };
  }, [cost, sell]);

  const discount = useMemo(() => {
    const p = parseNum(price);
    const after1 = p * (1 - parseNum(d1) / 100);
    const after2 = after1 * (1 - parseNum(d2) / 100);
    return { after1, after2, saved: p - after2 };
  }, [price, d1, d2]);

  const vat = useMemo(() => {
    const g = parseNum(gross);
    return vatMode === "add" ? { net: g, tax: g * 0.075, total: g * 1.075 } : { net: g / 1.075, tax: g - g / 1.075, total: g };
  }, [gross, vatMode]);

  const inst = useMemo(() => {
    const p = parseNum(principal);
    const m = Math.max(1, parseNum(months));
    const r = parseNum(rate) / 100;
    const total = p * (1 + r * m);
    return { total, monthly: total / m, interest: total - p };
  }, [principal, rate, months]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="tools-screen">
      <AppBar title="Tools" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {tool === "margin" ? (
          <Card testID="tool-margin">
            <Row between><H4>Margin calculator</H4><Sub>Open</Sub></Row>
            <Row style={{ gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}><Field label="Cost" placeholder="0" keyboardType="numeric" mono value={cost} onChangeText={setCost} testID="margin-cost" /></View>
              <View style={{ flex: 1 }}><Field label="Selling" placeholder="0" keyboardType="numeric" mono value={sell} onChangeText={setSell} testID="margin-sell" /></View>
            </Row>
            <Divider />
            <Row between><Sub>Profit</Sub><Money tone={margin.profit >= 0 ? "pos" : "neg"} testID="margin-profit">{money(margin.profit)}</Money></Row>
            <Row between style={{ marginTop: 6 }}>
              <Sub>Margin / markup</Sub>
              <Text style={s.result} testID="margin-pct">{margin.margin.toFixed(1)}% / {margin.markup.toFixed(1)}%</Text>
            </Row>
          </Card>
        ) : null}

        {tool === "discount" ? (
          <Card testID="tool-discount">
            <H4>Discount</H4>
            <Field label="Price" placeholder="0" keyboardType="numeric" mono value={price} onChangeText={setPrice} testID="discount-price" style={{ marginTop: 10 }} />
            <Row style={{ gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Field label="First %" placeholder="0" keyboardType="numeric" mono value={d1} onChangeText={setD1} testID="discount-1" /></View>
              <View style={{ flex: 1 }}><Field label="Then %" placeholder="0" keyboardType="numeric" mono value={d2} onChangeText={setD2} testID="discount-2" /></View>
            </Row>
            <Divider />
            <Row between><Sub>After first</Sub><Money>{money(discount.after1)}</Money></Row>
            <Row between style={{ marginTop: 6 }}><Sub>Final price</Sub><Money size={15} testID="discount-final">{money(discount.after2)}</Money></Row>
            <Row between style={{ marginTop: 6 }}><Sub>Customer saves</Sub><Money tone="pos">{money(discount.saved)}</Money></Row>
          </Card>
        ) : null}

        {tool === "vat" ? (
          <Card testID="tool-vat">
            <H4>VAT 7.5%</H4>
            <View style={{ marginTop: 10 }}>
              <Seg testID="vat-mode" value={vatMode} onChange={setVatMode} options={[{ key: "add", label: "Add VAT" }, { key: "strip", label: "Strip VAT" }]} />
            </View>
            <Field label={vatMode === "add" ? "Amount before VAT" : "Amount including VAT"} placeholder="0" keyboardType="numeric" mono
              value={gross} onChangeText={setGross} testID="vat-amount" style={{ marginTop: 10 }} />
            <Divider />
            <Row between><Sub>Net</Sub><Money>{money(vat.net)}</Money></Row>
            <Row between style={{ marginTop: 6 }}><Sub>VAT</Sub><Money>{money(vat.tax)}</Money></Row>
            <Row between style={{ marginTop: 6 }}><Sub>Total</Sub><Money size={15} testID="vat-total">{money(vat.total)}</Money></Row>
          </Card>
        ) : null}

        {tool === "instalments" ? (
          <Card testID="tool-instalments">
            <H4>Interest & instalments</H4>
            <Field label="Amount owed" placeholder="0" keyboardType="numeric" mono value={principal} onChangeText={setPrincipal} testID="inst-principal" style={{ marginTop: 10 }} />
            <Row style={{ gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Field label="Monthly %" placeholder="2" keyboardType="numeric" mono value={rate} onChangeText={setRate} testID="inst-rate" /></View>
              <View style={{ flex: 1 }}><Field label="Months" placeholder="6" keyboardType="numeric" mono value={months} onChangeText={setMonths} testID="inst-months" /></View>
            </Row>
            <Divider />
            <Row between><Sub>Interest</Sub><Money tone="neg">{money(inst.interest)}</Money></Row>
            <Row between style={{ marginTop: 6 }}><Sub>Total repayable</Sub><Money>{money(inst.total)}</Money></Row>
            <Row between style={{ marginTop: 6 }}><Sub>Each month</Sub><Money size={15} testID="inst-monthly">{money(inst.monthly)}</Money></Row>
          </Card>
        ) : null}

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Other tools</Lbl>
        <Card style={{ paddingVertical: 4 }}>
          {[{ key: "margin" as Tool, label: "Margin", sub: "Cost, price, profit", icon: "trending-up-outline" as IonName }, ...OTHERS]
            .filter((t) => t.key !== tool)
            .map((t, i, arr) => (
              <Li key={t.key} last={i === arr.length - 1} testID={`tool-${t.key}`} onPress={() => setTool(t.key)}>
                <Av icon={t.icon} tone="sq" />
                <View style={{ flex: 1 }}><H4>{t.label}</H4><Sub>{t.sub}</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
            ))}
          <Li last testID="tool-card" onPress={() => router.push("/tools/business-card")}>
            <Av icon="id-card-outline" tone="sq" />
            <View style={{ flex: 1 }}><H4>Business card</H4><Sub>Share your shop details</Sub></View>
            <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
          </Li>
        </Card>
      </ScrollView>
    </View>
  );
}
