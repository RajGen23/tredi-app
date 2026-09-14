// 03.3 Customer ledger — running balance, mono, statement share.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppBar, Btn, Card, Chip, H4, IconBtn, Li, Lbl, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { longDate, money, shortDate } from "@/src/format";
import { fonts, makeStyles } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Ledger() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { business } = useAuth();
  const toast = useToast();
  const [chip, setChip] = useState<"all" | "sale" | "payment">("all");
  const q = useQuery({ queryKey: ["ledger", id], queryFn: () => api(`/customers/${id}/ledger`) });
  const d = q.data;
  const entries = (d?.entries ?? []).filter((e: any) => chip === "all" || e.kind === chip);

  const share = async () => {
    if (!d) return;
    const rows = [...d.entries].reverse().map((e: any) => `<tr><td>${shortDate(e.date)}</td><td>${e.title}</td><td style="text-align:right">${e.amount < 0 ? `(${money(-e.amount, { symbol: false })})` : money(e.amount, { symbol: false })}</td><td style="text-align:right">${money(e.balance, { symbol: false })}</td></tr>`).join("");
    const html = `<html><body style="font-family:-apple-system,Helvetica;padding:24px;color:#06241F"><h2 style="margin:0;color:#014747">${business?.name ?? ""}</h2><div style="font-size:12px;color:#93A9A4">TIN ${business?.tin ?? "—"}</div><hr style="border:0;border-top:1px solid #E5EEEB"/><div style="font-size:11px;color:#93A9A4">STATEMENT FOR</div><b>${d.customer.name}</b><div style="font-size:11px;color:#93A9A4;margin-top:4px">As at ${longDate(new Date().toISOString())}</div><table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:12px"><tr style="color:#93A9A4;text-align:left"><th>DATE</th><th>DETAILS</th><th style="text-align:right">AMOUNT</th><th style="text-align:right">BALANCE</th></tr><tr><td>—</td><td>Opening</td><td></td><td style="text-align:right">${money(d.opening, { symbol: false })}</td></tr>${rows}</table><div style="margin-top:14px;background:#E9FBF4;padding:10px;border-radius:8px;display:flex;justify-content:space-between"><b>Balance due</b><b>${money(d.closing)}</b></div><p style="font-size:10px;color:#93A9A4;margin-top:20px">Made with tredi</p></body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      else await Print.printAsync({ html });
    } catch (e: any) {
      toast.show(e.message ?? "Could not create statement");
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="ledger-screen">
      <AppBar title="Ledger" back right={<><IconBtn name="document-text-outline" testID="ledger-statement" onPress={share} /><IconBtn name="share-outline" testID="ledger-share" onPress={share} /></>} />
      {!d ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24 }}>
          <Card style={{ paddingVertical: 10 }}>
            <Row between>
              <View><Lbl>Opening balance</Lbl><Money>{money(d.opening)}</Money></View>
              <View style={{ alignItems: "flex-end" }}><Lbl>Closing</Lbl><Money tone={d.closing > 0 ? "neg" : "pos"} size={15} testID="ledger-closing">{money(d.closing)}</Money></View>
            </Row>
          </Card>
          <View style={{ height: 44, marginTop: 5 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
              <Chip label="All" on={chip === "all"} onPress={() => setChip("all")} testID="ledger-chip-all" />
              <Chip label="Sales" on={chip === "sale"} onPress={() => setChip("sale")} testID="ledger-chip-sales" />
              <Chip label="Payments" on={chip === "payment"} onPress={() => setChip("payment")} testID="ledger-chip-payments" />
              <Chip label="Returns" /><Chip label="Credit" />
            </ScrollView>
          </View>
          <Card style={{ paddingVertical: 4 }}>
            {entries.map((e: any, i: number) => (
              <Li key={e.ref_id + i} testID={`ledger-entry-${i}`}>
                <View style={{ width: 40 }}><Tag>{shortDate(e.date)}</Tag></View>
                <View style={{ flex: 1 }}><H4 style={e.kind === "sale" ? { fontFamily: fonts.monoSemibold, fontSize: 12.5 } : undefined}>{e.title}</H4><Sub>{e.sub}</Sub></View>
                <View style={{ alignItems: "flex-end" }}><Money tone={e.amount > 0 ? "neg" : "pos"}>{e.amount > 0 ? "+ " : "− "}{money(Math.abs(e.amount), { symbol: false })}</Money><Tag>bal {money(e.balance, { symbol: false })}</Tag></View>
              </Li>
            ))}
            <Li last>
              <View style={{ width: 40 }}><Tag>—</Tag></View>
              <View style={{ flex: 1 }}><H4>Opening balance</H4><Sub>Carried forward</Sub></View>
              <Money>{money(d.opening, { symbol: false })}</Money>
            </Li>
          </Card>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <Btn small variant="ghost" label="Download" style={{ flex: 1 }} onPress={share} testID="ledger-download" />
            <Btn small variant="deep" label="Share statement" style={{ flex: 1 }} onPress={share} testID="ledger-share-statement" />
          </View>
        </ScrollView>
      )}
    </View>
  );
}
