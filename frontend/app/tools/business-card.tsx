// 13.4 Business card — reuses the app's own palette.
import { useEffect, useState } from "react";
import { Platform, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Print from "expo-print";

import { api } from "@/src/api";
import { AppBar, Badge, Btn, Card, Chip, Field, H4, Lbl, Li, Loading, Row, Sub, Switch } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { pdfName, printHtml, sharePdf } from "@/src/pdf";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  card: { borderRadius: 18, padding: 18, overflow: "hidden" },
  name: { fontFamily: fonts.extrabold, fontSize: 21, letterSpacing: -0.4 },
  tagline: { fontFamily: fonts.regular, fontSize: 12, marginTop: 3 },
  line: { fontFamily: fonts.mono, fontSize: 11.5, marginTop: 3 },
  mark: { fontFamily: fonts.extrabold, fontSize: 30, opacity: 0.25, position: "absolute", right: 16, top: 12 },
}));

export default function BusinessCard() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["card"], queryFn: () => api("/business/card") });
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (q.data && !f) setF(q.data); }, [q.data]);

  const save = useMutation({
    mutationFn: () => api("/business/card", {
      method: "PUT",
      json: { tagline: f.tagline, hours: f.hours, show_tin: f.show_tin, include_bank: f.include_bank, bank_account_id: f.bank_account_id ?? null, style: f.style },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["card"] }); toast.show("Card saved"); },
    onError: (e: any) => toast.show(e.message),
  });

  if (!f) return <View style={[s.root, { paddingTop: insets.top }]}><AppBar title="Business card" back /><Loading /></View>;

  const bg = f.style === "deep" ? colors.deep : f.style === "mint" ? colors.brandTertiary : colors.brandPrimary;
  const fg = f.style === "mint" ? colors.deep : f.style === "deep" ? "#FFFFFF" : colors.onBrandPrimary;

  const shareCard = async () => {
    const lines = [f.name, f.tagline, f.phone, f.address, f.hours, f.show_tin && f.tin ? `TIN ${f.tin}` : "", f.include_bank && f.bank ? `${f.bank.name} ${f.bank.detail}` : ""]
      .filter(Boolean).join("\n");
    if (Platform.OS === "web") {
      await Print.printAsync({ html: `<body style="font-family:Helvetica;padding:40px"><pre style="font-size:16px">${lines}</pre></body>` });
    } else {
      await Share.share({ message: lines });
    }
  };

  const saveImage = async () => {
    const html = `<body style="margin:0"><div style="font-family:Helvetica;background:${bg};color:${fg};padding:40px;width:640px">
      <div style="font-size:34px;font-weight:800">${f.name}</div>
      <div style="font-size:15px;margin-top:6px">${f.tagline ?? ""}</div>
      <div style="font-family:monospace;font-size:15px;margin-top:18px">${f.phone ?? ""}</div>
      <div style="font-family:monospace;font-size:15px">${f.address ?? ""}</div>
      <div style="font-family:monospace;font-size:15px">${f.hours ?? ""}</div>
      ${f.show_tin && f.tin ? `<div style="font-family:monospace;font-size:14px;margin-top:10px">TIN ${f.tin}</div>` : ""}
      ${f.include_bank && f.bank ? `<div style="font-family:monospace;font-size:14px">${f.bank.name} · ${f.bank.detail}</div>` : ""}
      <div style="margin-top:22px;font-size:12px;opacity:.7">made with TradaBooks</div></div></body>`;
    if (Platform.OS === "web") return printHtml(html);
    try {
      await sharePdf(html, pdfName([f.name, "Business-card"]));
    } catch (e: any) {
      toast.show(e.message ?? "Could not create the card", undefined, "bad");
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="business-card-screen">
      <AppBar title="Business card" back rightText="Save" onRightText={() => save.mutate()} rightTextTestID="card-save" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        <View style={[s.card, { backgroundColor: bg }]} testID="card-preview">
          <Text style={[s.mark, { color: fg }]}>t</Text>
          <Text style={[s.name, { color: fg }]}>{f.name}</Text>
          {f.tagline ? <Text style={[s.tagline, { color: fg }]}>{f.tagline}</Text> : null}
          <View style={{ marginTop: 14 }}>
            {f.phone ? <Text style={[s.line, { color: fg }]}>☏ {f.phone}</Text> : null}
            {f.address ? <Text style={[s.line, { color: fg }]}>⌂ {f.address}</Text> : null}
            {f.hours ? <Text style={[s.line, { color: fg }]}>◷ {f.hours}</Text> : null}
            {f.show_tin && f.tin ? <Text style={[s.line, { color: fg }]}>TIN {f.tin}</Text> : null}
            {f.include_bank && f.bank ? <Text style={[s.line, { color: fg }]}>▤ {f.bank.name} · {f.bank.detail}</Text> : null}
          </View>
        </View>

        <Card style={{ marginTop: 12, gap: 8 }}>
          <Field label="Tagline" placeholder="Rice, oil & provisions — wholesale" value={f.tagline} onChangeText={(v) => setF({ ...f, tagline: v })} testID="card-tagline" />
          <Field label="Opening hours" placeholder="Mon–Sat, 8:00 – 18:30" value={f.hours} onChangeText={(v) => setF({ ...f, hours: v })} testID="card-hours" />
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Style</Lbl>
        <Row style={{ gap: 6 }}>
          {(["green", "deep", "mint"] as const).map((st) => <Chip key={st} label={st === "green" ? "Green" : st === "deep" ? "Deep teal" : "Mint"} on={f.style === st} onPress={() => setF({ ...f, style: st })} testID={`card-style-${st}`} />)}
        </Row>

        <Card style={{ marginTop: 12 }}>
          <Row between>
            <View style={{ flex: 1 }}><H4>Show TIN on the card</H4></View>
            <Switch on={f.show_tin} onChange={(v) => setF({ ...f, show_tin: v })} testID="card-show-tin" />
          </Row>
          <Row between style={{ marginTop: 12 }}>
            <View style={{ flex: 1 }}><H4>Include bank details</H4><Sub>{f.bank ? `${f.bank.name}` : "Pick an account below"}</Sub></View>
            <Switch on={f.include_bank} onChange={(v) => setF({ ...f, include_bank: v })} testID="card-include-bank" />
          </Row>
          {f.include_bank ? (
            <View style={{ marginTop: 8 }}>
              {(f.bank_accounts ?? []).map((a: any, i: number, arr: any[]) => (
                <Li key={a.id} last={i === arr.length - 1} testID={`card-account-${a.id}`} onPress={() => setF({ ...f, bank_account_id: a.id, bank: { name: a.name, detail: a.detail } })}>
                  <View style={{ flex: 1 }}><H4>{a.name}</H4><Sub>{a.detail}</Sub></View>
                  {f.bank_account_id === a.id ? <Badge tone="paid">On the card</Badge> : null}
                </Li>
              ))}
              {(f.bank_accounts ?? []).length === 0 ? <Sub>No bank account saved yet.</Sub> : null}
            </View>
          ) : null}
        </Card>

        <Row style={{ marginTop: 14, gap: 8 }}>
          <View style={{ flex: 1 }}><Btn label="Save image" variant="ghost" small testID="card-save-image" onPress={saveImage} /></View>
          <View style={{ flex: 1 }}><Btn label="Share" small testID="card-share" onPress={shareCard} /></View>
        </Row>
      </ScrollView>
    </View>
  );
}
