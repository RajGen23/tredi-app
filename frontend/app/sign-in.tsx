// 00.3 Sign in — email + password (matches the old user records), with create account.
// Where the server can send SMS, a confirmed Nigerian number + code also signs in.
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { Av, Btn, Card, Chip, Field, H4, Row, Sub } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  title: { fontFamily: fonts.extrabold, fontSize: 22, letterSpacing: -0.7, color: c.onSurface, marginTop: 14 },
  link: { fontFamily: fonts.bold, color: c.green700 },
  err: { fontFamily: fonts.medium, fontSize: 12, color: c.coral, marginTop: 10 },
  restore: { backgroundColor: c.brandTertiary, borderColor: c.mint2, marginTop: 18 },
}));

export default function SignIn() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, signUp, signInWithPhone } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  // Phone sign-in: offered only when the server says it can text codes.
  const [phoneOk, setPhoneOk] = useState(false);
  const [via, setVia] = useState<"email" | "phone">("email");
  const [phone, setPhone] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [smsCode, setSmsCode] = useState("");
  useEffect(() => { api<{ enabled: boolean }>("/auth/phone/config").then((c) => setPhoneOk(!!c?.enabled)).catch(() => {}); }, []);
  const byPhone = mode === "in" && via === "phone" && phoneOk;

  const sendSms = async () => {
    setErr("");
    if (phone.replace(/\D/g, "").length < 10) return setErr("Enter your Nigerian mobile number, like 0803 123 4567.");
    setBusy(true);
    try {
      await api("/auth/phone/start", { method: "POST", json: { phone } });
      setSmsSent(true);
    } catch (e: any) {
      setErr(e.message || "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  const submitPhone = async () => {
    if (!smsSent) return sendSms();
    setErr("");
    if (smsCode.trim().length < 4) return setErr("Enter the code from the text message.");
    setBusy(true);
    try {
      await signInWithPhone(phone, smsCode.trim());
      router.replace("/");
    } catch (e: any) {
      setErr(e.message || "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    setErr("");
    if (!email || !password || !name) return setErr("Fill in every field to continue.");
    setBusy(true);
    try {
      await api("/auth/signup-code", { method: "POST", json: { email: email.trim() } });
      setCodeSent(true);
    } catch (e: any) {
      setErr(e.message || "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (byPhone) return submitPhone();
    setErr("");
    if (!email || !password || (mode === "up" && !name)) return setErr("Fill in every field to continue.");
    if (mode === "up" && !codeSent) return sendCode();
    if (mode === "up" && code.trim().length !== 6) return setErr("Enter the 6-digit code we emailed you.");
    setBusy(true);
    try {
      if (mode === "in") await signIn(email, password);
      else await signUp(name, email, password, code.trim());
      router.replace("/");
    } catch (e: any) {
      setErr(e.message || "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root} testID="sign-in-screen">
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24 }} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Pressable testID="sign-in-back" onPress={() => router.replace("/onboarding")} hitSlop={10} style={{ width: 24 }}>
          <Ionicons name="arrow-back" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>{mode === "in" ? "Sign in to your book" : "Create your account"}</Text>
        <Sub style={{ marginTop: 6 }}>
          {byPhone ? "We text a code to the number you confirmed under More → Phone sign-in. " : mode === "in" ? "Use the email and password from your TradaBooks account. " : "It takes a minute. "}
          <Text style={s.link} onPress={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); }} testID="sign-in-toggle-mode">
            {mode === "in" ? "New here? Create account" : "Already have one? Sign in"}
          </Text>
        </Sub>
        {mode === "in" && phoneOk ? (
          <Row style={{ gap: 6, marginTop: 14 }}>
            <Chip label="Email" on={via === "email"} onPress={() => { setVia("email"); setErr(""); }} testID="sign-in-via-email" />
            <Chip label="Phone number" on={via === "phone"} onPress={() => { setVia("phone"); setErr(""); }} testID="sign-in-via-phone" />
          </Row>
        ) : null}
        {byPhone ? (
          <View style={{ gap: 10, marginTop: 18 }}>
            <Field testID="sign-in-phone" label="Phone number (Nigeria +234)" value={phone} onChangeText={(v) => { setPhone(v); setSmsSent(false); setSmsCode(""); }}
              placeholder="0803 123 4567" keyboardType="phone-pad" nogroup onSubmitEditing={submit} returnKeyType="go" />
            {smsSent ? (
              <View style={{ gap: 6 }}>
                <Field testID="sign-in-sms-code" label="Code from the text message" value={smsCode} onChangeText={setSmsCode} placeholder="6-digit code"
                  keyboardType="number-pad" maxLength={8} mono onSubmitEditing={submit} returnKeyType="go" />
                <Text style={s.link} onPress={sendSms} testID="sign-in-sms-resend">Didn&apos;t get it? Send again</Text>
              </View>
            ) : null}
          </View>
        ) : (
        <View style={{ gap: 10, marginTop: 18 }}>
          {mode === "up" ? <Field testID="sign-up-name" label="Your name" value={name} onChangeText={setName} placeholder="Adaeze Okafor" autoCapitalize="words" /> : null}
          <Field testID="sign-in-email" label="Email" value={email} onChangeText={(v) => { setEmail(v); setCodeSent(false); setCode(""); }} placeholder="you@shop.ng" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <Field testID="sign-in-password" label="Password" value={password} onChangeText={setPassword} placeholder="••••••••"
            secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} onSubmitEditing={submit} returnKeyType="go"
            right={
              <Pressable testID="sign-in-password-toggle" hitSlop={10} onPress={() => setShowPassword((v) => !v)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={19} color={colors.ink60} />
              </Pressable>
            } />
        </View>
        )}
        {err ? <Text style={s.err} testID="sign-in-error">{err}</Text> : null}
        {mode === "in" && !byPhone ? (
          <Pressable hitSlop={12} style={{ alignSelf: "flex-start", paddingVertical: 12 }} testID="sign-in-forgot"
            onPress={() => router.push({ pathname: "/forgot-password", params: { email: email.trim() } })}>
            <Text style={s.link}>Forgot password?</Text>
          </Pressable>
        ) : null}
        <Card style={s.restore}>
          <View style={{ flexDirection: "row", gap: 9, alignItems: "flex-start" }}>
            <Av icon="refresh" tone="green" size={26} />
            <View style={{ flex: 1 }}>
              <H4>Restoring a phone?</H4>
              <Sub>Sign in with the same account and TradaBooks will pull your last cloud backup automatically.</Sub>
            </View>
          </View>
        </Card>
        {mode === "up" && codeSent ? (
          <View style={{ marginTop: 12, gap: 6 }}>
            <Field testID="sign-up-code" label={`Code sent to ${email.trim()}`} value={code} onChangeText={setCode} placeholder="6-digit code"
              keyboardType="number-pad" maxLength={6} mono />
            <Text style={s.link} onPress={sendCode} testID="sign-up-resend">Didn&apos;t get it? Send again</Text>
          </View>
        ) : null}
        <Btn testID="sign-in-submit" label={byPhone ? (smsSent ? "Sign in and continue" : "Text me a code") : mode === "in" ? "Sign in and continue" : codeSent ? "Create account" : "Email me a code"} onPress={submit} loading={busy} style={{ marginTop: 16 }} />
      </KeyboardAwareScrollView>
    </View>
  );
}
