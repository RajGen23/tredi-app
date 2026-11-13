// Phone sign-in — confirm a Nigerian mobile number once, then sign in with it
// and an SMS code. Email and password keep working alongside.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Badge, Btn, Card, Field, H4, Loading, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { fonts, makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  link: { fontFamily: fonts.bold, color: c.green700, marginTop: 8 },
  num: { fontFamily: fonts.monoSemibold, fontSize: 16, color: c.onSurface, marginTop: 6 },
}));

type Mine = { enabled: boolean; phone: string; suggested: string };

export default function PhoneLogin() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["phone-login"], queryFn: () => api<Mine>("/auth/phone/mine") });
  const [typed, setPhone] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [changing, setChanging] = useState(false);
  // Starts from the number already on the team record, until something is typed.
  const phone = typed ?? q.data?.suggested ?? "";

  const done = (msg: string) => { qc.invalidateQueries({ queryKey: ["phone-login"] }); setSent(false); setCode(""); setChanging(false); toast.show(msg, "Saved."); };
  const start = useMutation({
    mutationFn: () => api("/auth/phone/link/start", { method: "POST", json: { phone } }),
    onSuccess: (r: any) => { setSent(true); toast.show(r.message); },
    onError: (e: any) => toast.show(e.message),
  });
  const confirm = useMutation({
    mutationFn: () => api("/auth/phone/link/verify", { method: "POST", json: { phone, code: code.trim() } }),
    onSuccess: (r: any) => done(r.message),
    onError: (e: any) => toast.show(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api("/auth/phone/link", { method: "DELETE" }),
    onSuccess: () => done("Phone sign-in removed — use your email and password"),
    onError: (e: any) => toast.show(e.message),
  });

  const d = q.data;
  const linked = !!d?.phone && !changing;
  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="phone-login-screen">
      <AppBar title="Phone sign-in" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        {!d ? <Loading /> : !d.enabled ? (
          <Card testID="phone-login-off">
            <H4>Not switched on yet</H4>
            <Sub>Signing in by text message isn&apos;t available on this server yet. Keep using your email and password.</Sub>
          </Card>
        ) : linked ? (
          <>
            <Card testID="phone-login-linked">
              <Badge tone="paid">Confirmed</Badge>
              <Text style={s.num}>{d.phone}</Text>
              <Sub style={{ marginTop: 6 }}>On the sign-in screen choose &ldquo;Phone number&rdquo; and we text a code to this number. Your email and password still work.</Sub>
            </Card>
            <Btn label="Use a different number" variant="ghost" style={{ marginTop: 14 }} testID="phone-login-change" onPress={() => { setChanging(true); setPhone(""); }} />
            <Btn label="Remove phone sign-in" variant="coral" style={{ marginTop: 8 }} loading={remove.isPending} testID="phone-login-remove" onPress={() => remove.mutate()} />
          </>
        ) : (
          <>
            <Card>
              <H4>Confirm your number</H4>
              <Sub>Nigerian mobile numbers only. We text a code to prove the number is yours — after that you can sign in with it.</Sub>
              <Field label="Phone number (Nigeria +234)" value={phone} onChangeText={(v) => { setPhone(v); setSent(false); setCode(""); }} placeholder="0803 123 4567"
                keyboardType="phone-pad" nogroup style={{ marginTop: 12 }} testID="phone-login-number" />
              {sent ? (
                <>
                  <Field label="Code from the text message" value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="number-pad" maxLength={8} mono
                    style={{ marginTop: 10 }} testID="phone-login-code" />
                  <Text style={s.link} onPress={() => start.mutate()} testID="phone-login-resend">Didn&apos;t get it? Send again</Text>
                </>
              ) : null}
            </Card>
            <Btn label={sent ? "Confirm number" : "Text me a code"} style={{ marginTop: 14 }} loading={start.isPending || confirm.isPending} testID="phone-login-submit"
              onPress={() => (sent ? confirm.mutate() : start.mutate())} />
            {changing ? <Btn label="Cancel" variant="ghost" style={{ marginTop: 8 }} testID="phone-login-cancel" onPress={() => { setChanging(false); setSent(false); }} /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
