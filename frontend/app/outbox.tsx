// Waiting to send — sales and invoices made with no signal, kept on this phone
// until the server can take them. They send by themselves; this screen shows
// what's left, sends now on demand, and explains anything the server refused.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { AppBar, Badge, Btn, Card, H4, Li, Money, Row, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { money } from "@/src/format";
import { discard, retry, sendWaiting, useOutbox } from "@/src/outbox";
import { makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  err: { color: c.coral, marginTop: 4 },
  confirm: { borderWidth: 1, borderColor: c.coral, borderRadius: 11, padding: 10, gap: 8, marginTop: 8 },
}));

const TOUCHED = ["invoices", "invoice", "sales", "sale", "customers", "customer-summary", "items", "low-stock", "dashboard", "accounts", "activity", "reports-summary"];

export default function Outbox() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const toast = useToast();
  const qc = useQueryClient();
  const waiting = useOutbox();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const after = (r: Awaited<ReturnType<typeof sendWaiting>>) => {
    if (r.sent.length) TOUCHED.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    if (r.sent.length) toast.show(`${r.sent.length} sent: in your books now`, "Synced.");
    else if (r.offline) toast.show("Still no signal. They'll send by themselves once you're back online.", undefined, "bad");
  };
  const sendNow = async () => { setBusy(true); try { after(await sendWaiting()); } finally { setBusy(false); } };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="outbox-screen">
      <AppBar title="Waiting to send" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        {!waiting.length ? (
          <Card testID="outbox-empty">
            <H4>Everything is sent</H4>
            <Sub>{"Sales and invoices you make with no signal are kept here, then sent by themselves when you're back online."}</Sub>
          </Card>
        ) : (
          <>
            <Sub style={{ marginBottom: 10 }}>
              {"These are saved on this phone only. They send by themselves when you have signal, and get their number then. "}
              {"Stock and customer balances update when they arrive. Don't uninstall the app or clear its data until they're sent."}
            </Sub>
            <Card style={{ paddingVertical: 4 }}>
              {waiting.map((p, i) => (
                <View key={p.ref}>
                  <Li last={i === waiting.length - 1 && removing !== p.ref} testID={`outbox-item-${i}`}>
                    <View style={{ flex: 1 }}>
                      <Row between><H4 numberOfLines={1} style={{ flex: 1 }}>{p.label}</H4><Money>{money(p.total)}</Money></Row>
                      <Row between style={{ marginTop: 3 }}>
                        <Sub>{dayjs(p.made_at).format("DD MMM, h:mm a")}</Sub>
                        {p.error ? <Badge tone="over">Not sent</Badge> : <Badge tone="due">Waiting</Badge>}
                      </Row>
                      {p.error ? <Sub style={s.err}>{p.error}</Sub> : null}
                      {p.error ? (
                        <Row style={{ gap: 8, marginTop: 8 }}>
                          <Btn small variant="ghost" label="Try again" style={{ flex: 1 }} testID={`outbox-retry-${i}`} onPress={async () => after(await retry(p.ref))} />
                          <Btn small variant="coral" label="Delete" style={{ flex: 1 }} testID={`outbox-delete-${i}`} onPress={() => setRemoving(p.ref)} />
                        </Row>
                      ) : null}
                    </View>
                  </Li>
                  {removing === p.ref ? (
                    <View style={s.confirm} testID="outbox-delete-confirm">
                      <H4>Delete this {p.kind === "sale" ? "sale" : "invoice"}?</H4>
                      <Sub>{"It was never sent, so it isn't in your books. Deleting it can't be undone."}</Sub>
                      <Row style={{ gap: 8 }}>
                        <Btn small variant="ghost" label="Keep it" style={{ flex: 1 }} onPress={() => setRemoving(null)} />
                        <Btn small variant="coral" label="Delete" style={{ flex: 1 }} testID="outbox-delete-yes"
                          onPress={async () => { await discard(p.ref); setRemoving(null); }} />
                      </Row>
                    </View>
                  ) : null}
                </View>
              ))}
            </Card>
            <Btn label="Send now" icon="cloud-upload-outline" style={{ marginTop: 14 }} loading={busy} onPress={sendNow} testID="outbox-send-now" />
          </>
        )}
      </ScrollView>
    </View>
  );
}
