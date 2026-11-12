// Forgot password — email a 6-digit code, then choose a new password and sign straight in.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { Btn, Field, Sub } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  title: { fontFamily: fonts.extrabold, fontSize: 22, letterSpacing: -0.7, color: c.onSurface, marginTop: 14 },
  link: { fontFamily: fonts.bold, color: c.green700 },
  err: { fontFamily: fonts.medium, fontSize: 12, color: c.coral, marginTop: 10 },
  ok: { fontFamily: fonts.medium, fontSize: 12, color: c.green700, marginTop: 10 },
}));

export default function ForgotPassword() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn } = useAuth();
  const p = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(p.email ?? "");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setErr(""); setMsg("");
    if (!email.trim().includes("@")) return setErr("Enter the email you sign in with.");
    setBusy(true);
    try {
      const r = await api<any>("/auth/forgot", { method: "POST", json: { email: email.trim() } });
      setSent(true); setMsg(r.message);
    } catch (e: any) {
      setErr(e.message || "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setErr(""); setMsg("");
    if (code.trim().length !== 6) return setErr("Enter the 6-digit code from the email.");
    if (password.length < 6) return setErr("Use at least 6 characters for the new password.");
    setBusy(true);
    try {
      await api("/auth/reset", { method: "POST", json: { email: email.trim(), code: code.trim(), password } });
      await signIn(email.trim(), password);
      router.replace("/");
    } catch (e: any) {
      setErr(e.message || "Could not reset the password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root} testID="forgot-screen">
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24 }} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Pressable testID="forgot-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))} hitSlop={10} style={{ width: 24 }}>
          <Ionicons name="arrow-back" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>Reset your password</Text>
        <Sub style={{ marginTop: 6 }}>
          {sent ? "Enter the code we emailed you and choose a new password." : "We'll email you a 6-digit code to choose a new password."}
        </Sub>
        <View style={{ gap: 10, marginTop: 18 }}>
          <Field testID="forgot-email" label="Email" value={email} onChangeText={(v) => { setEmail(v); setSent(false); setCode(""); }}
            placeholder="you@shop.ng" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          {sent ? (
            <>
              <Field testID="forgot-code" label="Code from the email" value={code} onChangeText={setCode} placeholder="6-digit code"
                keyboardType="number-pad" maxLength={6} mono />
              <Field testID="forgot-password" label="New password" value={password} onChangeText={setPassword} placeholder="At least 6 characters"
                secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} onSubmitEditing={reset} returnKeyType="go"
                right={
                  <Pressable testID="forgot-password-toggle" hitSlop={10} onPress={() => setShow((v) => !v)}>
                    <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={19} color={colors.ink60} />
                  </Pressable>
                } />
            </>
          ) : null}
        </View>
        {err ? <Text style={s.err} testID="forgot-error">{err}</Text> : null}
        {msg && !err ? <Text style={s.ok} testID="forgot-message">{msg}</Text> : null}
        {sent ? <Text style={[s.link, { marginTop: 12 }]} onPress={sendCode} testID="forgot-resend">Didn&apos;t get it? Send again</Text> : null}
        <Btn testID="forgot-submit" label={sent ? "Save password and sign in" : "Email me a code"} onPress={sent ? reset : sendCode} loading={busy} style={{ marginTop: 16 }} />
      </KeyboardAwareScrollView>
    </View>
  );
}
