// 12.3 App lock — the keypad is oversized on purpose, and the fingerprint or
// Face ID sensor is offered first when the phone has one.
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { bioState, bioUnlock, type BioState } from "@/src/biometrics";
import { Av, H4, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "del"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  title: { fontFamily: fonts.extrabold, fontSize: 20, letterSpacing: -0.3, color: c.onSurface, marginTop: 14 },
  dots: { flexDirection: "row", gap: 12, marginTop: 22 },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5, borderColor: c.radioBorder },
  dotOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  pad: { flexDirection: "row", flexWrap: "wrap", marginTop: 30, width: 268, justifyContent: "center" },
  key: { width: 84, height: 68, alignItems: "center", justifyContent: "center" },
  keyText: { fontFamily: fonts.monoSemibold, fontSize: 27, color: c.onSurface },
  hint: { marginTop: 26, textAlign: "center" },
}));

export default function Lock() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, business } = useAuth();
  const [pin, setPin] = useState("");
  const [bio, setBio] = useState<BioState>({ available: false, enrolled: false, label: "Fingerprint" });
  const tried = useRef(false);
  const settings = useQuery({ queryKey: ["lock"], queryFn: () => api("/settings/lock") });

  useEffect(() => { bioState().then(setBio); }, []);

  const unlockWithBio = useCallback(async () => {
    const res = await bioUnlock(`Unlock ${business?.name ?? "TradaBooks"}`);
    if (res.ok) return router.replace("/(tabs)");
    if (res.message) toast.show(res.message);
  }, [business?.name, router, toast]);

  // Offered the moment the screen opens, the way a banking app does — the PIN
  // pad is still there underneath if the sensor says no.
  useEffect(() => {
    if (tried.current || !settings.data?.biometrics || !bio.available || !bio.enrolled) return;
    tried.current = true;
    unlockWithBio();
  }, [settings.data?.biometrics, bio, unlockWithBio]);

  const verify = useMutation({
    mutationFn: (value: string) => api("/settings/lock/verify", { method: "POST", json: { pin: value } }),
    onSuccess: () => router.replace("/(tabs)"),
    onError: () => { setPin(""); toast.show("Wrong PIN — try again", undefined, "bad"); },
  });

  const press = (k: string) => {
    if (k === "del") return setPin(pin.slice(0, -1));
    if (k === "bio") return unlockWithBio();
    if (pin.length >= 6) return;
    const next = pin + k;
    setPin(next);
    if (next.length >= 4 && settings.data?.has_pin) verify.mutate(next);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="lock-screen">
      <Av icon="lock-closed" tone="mint" size={58} />
      <Text style={s.title}>Enter your PIN</Text>
      <Sub style={{ marginTop: 4 }}>{user?.name ?? "You"} · {business?.name ?? "TradaBooks"}</Sub>
      <View style={s.dots}>
        {[0, 1, 2, 3, 4, 5].slice(0, Math.max(4, pin.length)).map((i) => <View key={i} style={[s.dot, i < pin.length && s.dotOn]} />)}
      </View>
      <View style={s.pad}>
        {KEYS.map((k) => (
          <Pressable key={k} testID={`lock-key-${k}`} onPress={() => press(k)} style={({ pressed }) => [s.key, pressed && { opacity: 0.5 }]}>
            {k === "del" ? <Ionicons name="backspace-outline" size={24} color={colors.ink60} />
              : k === "bio" ? <Ionicons name={bio.label === "Face ID" ? "scan-outline" : "finger-print-outline"} size={24} color={bio.available && bio.enrolled ? colors.green700 : colors.ink60} />
              : <Text style={s.keyText}>{k}</Text>}
          </Pressable>
        ))}
      </View>
      <Sub style={s.hint}>
        {settings.data?.has_pin
          ? `Locks after ${settings.data.idle_minutes} minutes idle${settings.data.biometrics && bio.available && bio.enrolled ? ` · ${bio.label} enabled` : ""}`
          : "No PIN set yet — set one under Users & permissions."}
      </Sub>
      {!settings.data?.has_pin ? (
        <Pressable testID="lock-skip" onPress={() => router.replace("/(tabs)")} style={{ marginTop: 18 }}>
          <H4 style={{ color: colors.green700 }}>Continue without a PIN</H4>
        </Pressable>
      ) : null}
    </View>
  );
}
