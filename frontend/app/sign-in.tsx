// 00.3 Sign in — email + password (matches the old user records), with create account.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useAuth } from "@/src/auth";
import { Av, Btn, Card, Field, H4, Sub } from "@/src/components/ui";
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
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    if (!email || !password || (mode === "up" && !name)) return setErr("Fill in every field to continue.");
    setBusy(true);
    try {
      if (mode === "in") await signIn(email, password);
      else await signUp(name, email, password);
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
          {mode === "in" ? "Use the email and password from your TREDI account. " : "It takes a minute. "}
          <Text style={s.link} onPress={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); }} testID="sign-in-toggle-mode">
            {mode === "in" ? "New here? Create account" : "Already have one? Sign in"}
          </Text>
        </Sub>
        <View style={{ gap: 10, marginTop: 18 }}>
          {mode === "up" ? <Field testID="sign-up-name" label="Your name" value={name} onChangeText={setName} placeholder="Adaeze Okafor" autoCapitalize="words" /> : null}
          <Field testID="sign-in-email" label="Email" value={email} onChangeText={setEmail} placeholder="you@shop.ng" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <Field testID="sign-in-password" label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry onSubmitEditing={submit} returnKeyType="go" />
        </View>
        {err ? <Text style={s.err} testID="sign-in-error">{err}</Text> : null}
        <Card style={s.restore}>
          <View style={{ flexDirection: "row", gap: 9, alignItems: "flex-start" }}>
            <Av icon="refresh" tone="green" size={26} />
            <View style={{ flex: 1 }}>
              <H4>Restoring a phone?</H4>
              <Sub>Sign in with the same account and TREDI will pull your last cloud backup automatically.</Sub>
            </View>
          </View>
        </Card>
        <Btn testID="sign-in-submit" label={mode === "in" ? "Sign in and continue" : "Create account"} onPress={submit} loading={busy} style={{ marginTop: 16 }} />
      </KeyboardAwareScrollView>
    </View>
  );
}
