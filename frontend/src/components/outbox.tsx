// Sends sales and invoices made offline as soon as there is signal, and shows
// what is still waiting. OutboxSync lives once at the top of the app; the
// banner sits on Home, Sales and the invoice list.
import { useEffect } from "react";
import { AppState, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/sheet";
import { H4, Sub } from "@/src/components/ui";
import { money } from "@/src/format";
import { sendWaiting, setOutboxOwner, useOutbox } from "@/src/outbox";
import { makeStyles, useTheme } from "@/src/theme";

// what changes on the server once something arrives
const TOUCHED = ["invoices", "invoice", "sales", "sale", "customers", "customer-summary", "items", "low-stock", "dashboard", "accounts", "activity", "reports-summary"];
const EVERY_MS = 20_000;

export function OutboxSync() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const waiting = useOutbox();
  const uid = user?.id ?? null;
  const count = waiting.filter((p) => !p.error).length;

  useEffect(() => { setOutboxOwner(uid); }, [uid]);

  useEffect(() => {
    if (!uid || !count) return;
    let live = true;
    const run = async () => {
      const r = await sendWaiting();
      if (!live) return;
      if (r.sent.length) {
        TOUCHED.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        const n = r.sent.length;
        toast.show(n === 1 ? `${r.sent[0].label} sent: it's in your books now` : `${n} offline sales and invoices sent: they're in your books now`, "Synced.");
      }
      if (r.refused.length) toast.show(`${r.refused.length} couldn't be sent. Open "Waiting to send" to see why.`, undefined, "bad");
    };
    run();
    const t = setInterval(run, EVERY_MS);
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") run(); });
    return () => { live = false; clearInterval(t); sub.remove(); };
  }, [uid, count, qc, toast]);

  return null;
}

const useStyles = makeStyles((c) => ({
  bar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.warning, borderColor: "#F3E2BE", borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 9 },
  bad: { backgroundColor: "#FDECEC", borderColor: "#F6C9CB" },
}));

/** "3 sales saved on this phone · waiting for signal". Hidden when nothing waits. */
export function OutboxBanner({ style }: { style?: object }) {
  const s = useStyles();
  const { colors } = useTheme();
  const waiting = useOutbox();
  if (!waiting.length) return null;
  const refused = waiting.filter((p) => p.error).length;
  const total = waiting.reduce((a, p) => a + (p.total || 0), 0);
  const n = waiting.length;
  return (
    <Pressable onPress={() => router.push("/outbox")} style={[s.bar, refused ? s.bad : null, style]} testID="outbox-banner">
      <Ionicons name={refused ? "alert-circle" : "cloud-upload-outline"} size={20} color={refused ? colors.coral : colors.amber} />
      <View style={{ flex: 1 }}>
        <H4>{n === 1 ? "1 sale saved on this phone" : `${n} sales saved on this phone`}</H4>
        <Sub>{refused ? `${refused} couldn't be sent: tap to see why` : `${money(total)} · sends by itself when you have signal`}</Sub>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink40} />
    </Pressable>
  );
}
