// A quick sale after the fact — the receipt, what was sold, and where the money
// landed. Reached from the Sales tab, the activity trail and the saved sheet.
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, H4, IconBtn, Lbl, Li, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { Photo } from "@/src/components/photo";
import { useToast } from "@/src/components/sheet";
import { longDate, money } from "@/src/format";
import { buildReceiptHtml, DEFAULT_BRAND } from "@/src/invoice-templates";
import { pdfName, printHtml, sharePdf } from "@/src/pdf";
import { photoDataUri } from "@/src/uploads";
import { useBottomPad } from "@/src/safe";
import { makeStyles, useTheme } from "@/src/theme";

const METHOD: Record<string, string> = { cash: "Cash", transfer: "Bank transfer", card: "Card", credit: "On credit" };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  bar: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border },
}));

export default function SaleDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["sale", id], queryFn: () => api(`/sales/${id}`) });
  const settings = useQuery({ queryKey: ["invoice-settings"], queryFn: () => api("/settings/invoice") });
  const sale = q.data;

  const receipt = async (print: boolean) => {
    if (!sale) return;
    try {
      const chosen: any = settings.data ?? {};
      const logo = chosen.logo_url ? await photoDataUri(chosen.logo_url) : "";
      const html = buildReceiptHtml(sale, { ...DEFAULT_BRAND, ...chosen, logo_url: logo });
      if (print) return await printHtml(html);
      const name = pdfName([sale.business?.name, sale.customer_name, sale.number]);
      const res = await sharePdf(html, name);
      if (!res.shared) toast.show(`${name} is ready — sharing is not available in this preview`);
    } catch (e: any) {
      toast.show(e.message ?? "Could not build the receipt");
    }
  };

  return (
    <View style={s.root} testID="sale-detail-screen">
      <View style={[s.teal, { height: insets.top + 120 }]} />
      <View style={{ paddingTop: insets.top }}>
        <AppBar teal back mono title={sale?.number ?? "Quick sale"}
          right={<IconBtn teal name="print-outline" testID="sale-print" onPress={() => receipt(true)} />} />
      </View>
      {!sale ? <Card style={{ marginHorizontal: 14 }}><Loading /></Card> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
          <Card testID="sale-hero">
            <Row between>
              <Badge tone={sale.method === "credit" ? "due" : "paid"}>{sale.method === "credit" ? "On credit" : `Paid · ${METHOD[sale.method] ?? sale.method}`}</Badge>
              <Tag>{longDate(sale.created_at)}</Tag>
            </Row>
            <Lbl style={{ marginTop: 9 }}>Sale total</Lbl>
            <Money size={22} testID="sale-total">{money(sale.totals.total)}</Money>
            <Row between style={{ marginTop: 10 }}>
              <View><Lbl>Into</Lbl><H4>{sale.account_name || "—"}</H4></View>
              <View style={{ alignItems: "flex-end" }}><Lbl>Customer</Lbl><H4>{sale.customer_name}</H4></View>
            </Row>
            {sale.shop ? <Tag style={{ marginTop: 8 }}>Recorded at {sale.shop}{sale.created_by ? ` · by ${sale.created_by}` : ""}</Tag> : null}
          </Card>

          {sale.method === "cash" && sale.tendered ? (
            <Card style={{ marginTop: 9, paddingVertical: 4 }} testID="sale-cash">
              <Li><Sub style={{ flex: 1 }}>Cash received</Sub><Money>{money(sale.tendered)}</Money></Li>
              <Li last><H4 style={{ flex: 1 }}>Change given</H4><Money tone="pos">{money(sale.change)}</Money></Li>
            </Card>
          ) : null}

          <Card style={{ marginTop: 9, paddingVertical: 4 }} testID="sale-lines">
            {(sale.lines ?? []).length === 0 ? <Li last><Sub>No item lines were saved with this sale.</Sub></Li> : null}
            {(sale.lines ?? []).map((l: any, i: number) => (
              <Li key={i} last={i === sale.lines.length - 1}>
                {l.photo_url ? <Photo url={l.photo_url} style={{ width: 34, height: 34, borderRadius: 10 }} /> : <Av icon="cube-outline" tone="sq" />}
                <View style={{ flex: 1 }}><H4>{l.name}</H4><Tag>{l.quantity} × {money(l.unit_price, { symbol: false })}{l.unit ? ` · ${l.unit}` : ""}</Tag></View>
                <Money>{money(l.total, { symbol: false })}</Money>
              </Li>
            ))}
          </Card>

          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            <Li testID="sale-open-accounts" onPress={() => router.push("/accounts")}>
              <Av icon="wallet-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>Where the money went</H4><Sub>{sale.account_name || "Cash till"}</Sub></View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            <Li last testID="sale-history" onPress={() => router.push(`/history/${sale.id}`)}>
              <Av icon="time-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>Activity</H4><Sub>Who recorded it, and when</Sub></View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
          </Card>
        </ScrollView>
      )}
      <View style={[s.bar, { paddingBottom: pad }]}>
        <Btn small variant="ghost" label="Print receipt" style={{ flex: 1 }} testID="sale-print-receipt" onPress={() => receipt(true)} />
        <Btn small label="Share receipt" icon="logo-whatsapp" style={{ flex: 1 }} testID="sale-share-receipt" onPress={() => receipt(false)} />
      </View>
    </View>
  );
}
