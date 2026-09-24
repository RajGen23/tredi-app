// 12.2 Permissions — two blocks: what they can do, then whose records they see.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Check, H4, Lbl, Li, Loading, Row, Sub, Switch } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { initials } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

type Scope = "own" | "shop" | "all";
const SCOPE_HINT: Record<string, Record<Scope, string>> = {
  sales: { own: "Only what they create", shop: "Everything in their shops", all: "Every invoice in the business" },
  stock: { own: "Only what they adjust", shop: "Their shops only", all: "All shops" },
  customers: { own: "Only customers they added", shop: "Anyone in their shops", all: "Every customer" },
  reports: { own: "Their figures only", shop: "Shop figures", all: "Company figures" },
};

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  seg: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: 9, padding: 3, gap: 2 },
  segItem: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7 },
  segOn: { backgroundColor: c.surfaceSecondary },
  segText: { fontFamily: fonts.bold, fontSize: 11, color: c.ink60 },
  segTextOn: { color: c.deep },
}));

export default function Permissions() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [state, setState] = useState<any>(null);
  const [pickRole, setPickRole] = useState(false);

  const q = useQuery({ queryKey: ["team", id], queryFn: () => api(`/team/${id}`) });
  useEffect(() => { if (q.data && !state) setState(q.data); }, [q.data]);

  const save = useMutation({
    mutationFn: () => api(`/team/${id}`, { method: "PUT", json: { role: state.role, shops: state.shops, can: state.can, scopes: state.scopes } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.show("Access updated", state.name); router.back(); },
    onError: (e: any) => toast.show(e.message),
  });

  if (!state) return <View style={[s.root, { paddingTop: insets.top }]}><AppBar title="Permissions" back /><Loading /></View>;
  const first = state.name.split(" ")[0];

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="permissions-screen">
      <AppBar title={state.name} back rightText="Save" onRightText={() => save.mutate()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        <Card>
          <Row style={{ gap: 10 }}>
            <Av text={initials(state.name)} tone="sq" size={40} />
            <View style={{ flex: 1 }}><H4>{state.role_label}</H4><Sub>Role · tap to change</Sub></View>
            <Btn label="Change" variant="ghost" small testID="permissions-change-role" onPress={() => setPickRole(true)} />
          </Row>
        </Card>

        <Row between style={{ marginTop: 14, marginBottom: 6 }}>
          <Lbl>Shops this user covers</Lbl>
          <Sub>{state.shops.length || state.all_shops.length} of {state.all_shops.length}</Sub>
        </Row>
        <Row style={{ gap: 6, flexWrap: "wrap" }}>
          {state.all_shops.map((sh: string) => {
            const on = state.shops.includes(sh);
            return (
              <Pressable key={sh} testID={`permissions-shop-${sh}`}
                onPress={() => setState({ ...state, shops: on ? state.shops.filter((x: string) => x !== sh) : [...state.shops, sh] })}
                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.deep : colors.border, backgroundColor: on ? colors.deep : colors.surfaceSecondary }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: on ? "#FFFFFF" : colors.ink60 }}>{sh}</Text>
              </Pressable>
            );
          })}
        </Row>
        <Sub style={{ marginTop: 8 }}>No shop selected means every shop. What they see follows the shop chosen at the top of Home.</Sub>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>{first} can…</Lbl>
        <Card>
          {state.abilities.map((a: any, i: number) => (
            <Row between key={a.key} style={{ paddingVertical: 8, borderBottomWidth: i === state.abilities.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
              <Sub style={{ flex: 1, color: colors.onSurface }}>{a.label}</Sub>
              <Switch on={!!state.can[a.key]} testID={`permissions-can-${a.key}`}
                onChange={(v) => setState({ ...state, can: { ...state.can, [a.key]: v } })} />
            </Row>
          ))}
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>…and whose records {first} sees</Lbl>
        <Card>
          {state.scope_keys.map((k: any, i: number) => (
            <View key={k.key} style={{ paddingVertical: 9, borderBottomWidth: i === state.scope_keys.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
              <Row between>
                <View style={{ flex: 1 }}><H4>{k.label}</H4><Sub>{SCOPE_HINT[k.key]?.[state.scopes[k.key] as Scope] ?? ""}</Sub></View>
                <View style={s.seg}>
                  {(["own", "shop", "all"] as Scope[]).map((sc) => (
                    <Pressable key={sc} testID={`permissions-scope-${k.key}-${sc}`} onPress={() => setState({ ...state, scopes: { ...state.scopes, [k.key]: sc } })}
                      style={[s.segItem, state.scopes[k.key] === sc && s.segOn]}>
                      <Text style={[s.segText, state.scopes[k.key] === sc && s.segTextOn]}>{sc === "own" ? "Own" : sc === "shop" ? "Shop" : "All"}</Text>
                    </Pressable>
                  ))}
                </View>
              </Row>
            </View>
          ))}
        </Card>

        <Btn label={`See what ${first} sees`} variant="deep" style={{ marginTop: 14 }} testID="permissions-preview" onPress={() => router.push(`/team/preview/${id}`)} />
        {!state.is_you ? (
          <Btn label={`Remove ${first}`} variant="coral" style={{ marginTop: 8 }} testID="permissions-remove" onPress={() => router.push(`/team/remove/${id}`)} />
        ) : null}
        <Btn label="Save changes" style={{ marginTop: 8 }} loading={save.isPending} testID="permissions-save" onPress={() => save.mutate()} />
      </ScrollView>

      <Sheet visible={pickRole} onClose={() => setPickRole(false)} testID="permissions-role-sheet">
        <H4>Change role</H4>
        <Sub style={{ marginTop: 4 }}>Switching a role resets what they can do to that role’s defaults.</Sub>
        {state.roles.map((r: any, i: number) => (
          <Li key={r.key} last={i === state.roles.length - 1} testID={`permissions-role-${r.key}`}
            onPress={() => { setState({ ...state, role: r.key, role_label: r.label }); setPickRole(false); toast.show(r.note, r.label); }}>
            <View style={{ flex: 1 }}><H4>{r.label}</H4><Sub>{r.note}</Sub></View>
            {state.role === r.key ? <Badge tone="paid">Current</Badge> : null}
          </Li>
        ))}
      </Sheet>
    </View>
  );
}
