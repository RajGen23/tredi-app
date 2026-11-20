// 04.8 Send reminder — pre-written in the owner's voice, editable, then automatic.
import { useEffect, useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Field, H4, Lbl, Li, Loading, Row, Sub, Switch } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { money, shortDate } from "@/src/format";
import { makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Reminder() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [auto, setAuto] = useState(false);

  const q = useQuery({ queryKey: ["reminder", id], queryFn: () => api(`/invoices/${id}/reminder`) });
  const d = q.data;
  useEffect(() => { if (d?.message && !message) { setMessage(d.message); setAuto(!!d.auto); } }, [d]);

  const send = useMutation({
    mutationFn: () => api(`/invoices/${id}/reminder`, { method: "POST", json: { channel, message, repeat_days: auto ? 3 : 0 } }),
    onSuccess: async () => {
      qc.invalidateQueries();
      const phone = (d?.phone ?? "").replace(/[^0-9]/g, "");
      const url = channel === "whatsapp" ? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}` : `sms:${phone}?body=${encodeURIComponent(message)}`;
      const can = await Linking.canOpenURL(url).catch(() => false);
      if (can) await Linking.openURL(url);
      else toast.show("Reminder logged against the invoice", "Saved");
      router.back();
    },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="reminder-screen">
      <AppBar title={d?.number ?? "Reminder"} back mono />
      {!d ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
          <Card>
            <H4>Send a payment reminder</H4>
            <Row between style={{ marginTop: 8 }}>
              <Sub>To {d.customer} · {d.days_overdue > 0 ? `${d.days_overdue} days overdue` : "not yet overdue"}</Sub>
              <Badge tone={d.days_overdue > 0 ? "over" : "due"}>{money(d.due)}</Badge>
            </Row>
          </Card>
          <Field label="Message" multiline value={message} onChangeText={setMessage} testID="reminder-message" style={{ marginTop: 9 }} />
          <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Send by</Lbl>
          <Card style={{ paddingVertical: 4 }}>
            <Li testID="reminder-whatsapp" onPress={() => setChannel("whatsapp")}>
              <Av icon="logo-whatsapp" tone="green" />
              <View style={{ flex: 1 }}><H4>WhatsApp</H4><Sub>Free</Sub></View>
              {channel === "whatsapp" ? <Badge tone="paid">Chosen</Badge> : null}
            </Li>
            <Li last testID="reminder-sms" onPress={() => setChannel("sms")}>
              <Av icon="mail-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>SMS</H4><Sub>1 credit</Sub></View>
              {channel === "sms" ? <Badge tone="paid">Chosen</Badge> : null}
            </Li>
          </Card>
          <Row between style={{ marginTop: 12 }}>
            <View style={{ flex: 1 }}><H4>Keep reminding automatically</H4><Sub>Every 3 days until it is paid</Sub></View>
            <Switch on={auto} onChange={setAuto} testID="reminder-auto" />
          </Row>
          {d.history.length ? (
            <>
              <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Already sent</Lbl>
              <Card style={{ paddingVertical: 4 }}>
                {d.history.map((h: any, i: number) => (
                  <Li key={h.id} last={i === d.history.length - 1}>
                    <View style={{ flex: 1 }}><H4>{h.channel === "whatsapp" ? "WhatsApp" : "SMS"}</H4><Sub>{shortDate(h.created_at)} · {h.created_by}</Sub></View>
                  </Li>
                ))}
              </Card>
            </>
          ) : null}
          <Btn label="Send reminder" style={{ marginTop: 16 }} disabled={!message.trim()} loading={send.isPending} testID="reminder-send" onPress={() => send.mutate()} />
        </ScrollView>
      )}
    </View>
  );
}
