// SA.1 Sign in — the rule is stated at the door: cross-tenant reads are
// attributed and visible to the tenant. There is no silent mode.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { adminApi, adminLogin } from "@/src/admin/api";
import { Btn, H1, Input, Lbl, Note, Pill, Row, Sub, useWide } from "@/src/admin/ui";
import { ago } from "@/src/admin/format";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  wrap: { flex: 1, flexDirection: "row", minHeight: 620 },
  left: { flex: 1, backgroundColor: c.deep900, padding: 34, justifyContent: "center", gap: 16 },
  mark: { width: 34, height: 34, borderRadius: 11, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  brand: { fontFamily: fonts.extrabold, fontSize: 19, color: c.onSurfaceInverse },
  kicker: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1.6, color: c.brandPrimary, textTransform: "uppercase" },
  head: { fontFamily: fonts.extrabold, fontSize: 27, lineHeight: 34, color: c.onSurfaceInverse, letterSpacing: -0.8 },
  body: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 20, color: "rgba(255,255,255,0.72)", maxWidth: 420 },
  chip: { borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { fontFamily: fonts.semibold, fontSize: 10.5, color: "rgba(255,255,255,0.8)" },
  right: { width: 420, backgroundColor: c.surfaceSecondary, padding: 30, justifyContent: "center", gap: 14 },
  card: { borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: 14, gap: 8, backgroundColor: c.faint },
}));

export default function AdminLogin() {
  const s = useStyles();
  const { colors } = useTheme();
  const { wide } = useWide();
  const router = useRouter();
  const qc = useQueryClient();
  const ctx = useQuery({ queryKey: ["admin-context"], queryFn: () => adminApi("/auth/context"), retry: false });
  const [email, setEmail] = useState("superadmin@tredi.app");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await adminLogin(email, password);
      await qc.invalidateQueries();
      router.replace("/admin/overview");
    } catch (e: any) {
      setError(e?.message ?? "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  const left = (
    <View style={s.left}>
      <Row gap={10}>
        <View style={s.mark}><Text style={{ fontFamily: fonts.extrabold, fontSize: 17, color: colors.deep }}>t</Text></View>
        <View>
          <Text style={s.brand}>tredi</Text>
          <Text style={s.kicker}>Super Admin</Text>
        </View>
      </Row>
      <Text style={s.head}>Cross-tenant access.{"\n"}Everything here is logged.</Text>
      <Text style={s.body}>
        Reads across business boundaries are recorded against your name and visible to the business owner. There is no silent mode.
      </Text>
      <Row gap={8} wrapped>
        <View style={s.chip}><Text style={s.chipText}>SOC-style audit</Text></View>
        <View style={s.chip}><Text style={s.chipText}>Session expires after {(ctx.data as any)?.session_minutes ?? 30} minutes idle</Text></View>
      </Row>
    </View>
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={{ flexGrow: 1 }} testID="admin-login">
      <View style={[s.wrap, !wide && { flexDirection: "column" }]}>
        {left}
        <View style={[s.right, !wide && { width: "100%" }]}>
          <Lbl>admin.tredi.app/login</Lbl>
          <H1>Verify it is you</H1>
          <Sub>Signed in last {ago((ctx.data as any)?.last_sign_in)} ago · {(ctx.data as any)?.last_place || "—"}</Sub>
          <View style={{ gap: 8, marginTop: 6 }}>
            <Lbl>Email</Lbl>
            <Input value={email} onChangeText={setEmail} placeholder="you@tredi.app" testID="admin-email" />
            <Lbl>Password</Lbl>
            <Input value={password} onChangeText={setPassword} placeholder="••••••••" testID="admin-password" />
          </View>
          {error ? <Note tone="bad" title="Not signed in">{error}</Note> : null}
          <Btn label="Continue" tone="primary" busy={busy} onPress={submit} testID="admin-login-submit" />
          <View style={s.card}>
            <Row gap={8}>
              <Ionicons name="shield-checkmark-outline" size={15} color={colors.deep} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.onSurface }}>Owner sees admin reads</Text>
            </Row>
            <Sub>Every screen you open inside a tenant is written to their own history with the same wording you see here.</Sub>
            <Row gap={7}><Pill label="2FA enforced on production" tone="warn" /></Row>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
