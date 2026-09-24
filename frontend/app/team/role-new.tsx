// 12.4 Build a role — nobody should build a permission set from an empty list.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Check, Field, H4, Lbl, Li, Loading, Row, Sub, Switch } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { initials } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

type Scope = "own" | "shop" | "all";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  seg: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: 9, padding: 3, gap: 2 },
  segItem: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7 },
  segOn: { backgroundColor: c.surfaceSecondary },
  segText: { fontFamily: fonts.bold, fontSize: 11, color: c.ink60 },
  segTextOn: { color: c.deep },
}));

export default function NewRole() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [startFrom, setStartFrom] = useState("sales");
  const [pickBase, setPickBase] = useState(false);
  const [can, setCan] = useState<Record<string, boolean>>({});
  const [scopes, setScopes] = useState<Record<string, Scope>>({ sales: "own", stock: "shop", customers: "shop", reports: "own" });
  const [assign, setAssign] = useState<string[]>([]);

  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api("/roles") });
  const team = useQuery({ queryKey: ["team"], queryFn: () => api("/team") });
  const abilities = roles.data?.abilities ?? [];
  const scopeKeys = roles.data?.scope_keys ?? [];
  const base = roles.data?.roles?.find((r: any) => r.key === startFrom);

  useEffect(() => {
    if (abilities.length && Object.keys(can).length === 0) {
      setCan(Object.fromEntries(abilities.map((a: any) => [a.key, ["invoices", "sell_credit"].includes(a.key)])));
    }
  }, [abilities]);

  const save = useMutation({
    mutationFn: () => api("/roles", { method: "POST", json: { label, start_from: startFrom, can, scopes, assign_to: assign } }),
    onSuccess: (r: any) => { qc.invalidateQueries(); toast.show(`${r.assigned} user${r.assigned === 1 ? "" : "s"} updated`, label); router.back(); },
    onError: (e: any) => toast.show(e.message),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-role-screen">
      <AppBar title="New role" close rightText="Save" onRightText={() => save.mutate()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 8 }}>
          <Field label="Role name" placeholder="Senior sales" value={label} onChangeText={setLabel} testID="role-name" />
          <Row between>
            <View style={{ flex: 1 }}><Lbl>Start from</Lbl><H4>{base?.label ?? "Sales"}</H4></View>
            <Btn label="Change" variant="ghost" small testID="role-change-base" onPress={() => setPickBase(true)} />
          </Row>
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Anyone with this role can…</Lbl>
        <Card>
          {!roles.data ? <Loading /> : abilities.map((a: any, i: number) => (
            <Row between key={a.key} style={{ paddingVertical: 8, borderBottomWidth: i === abilities.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
              <Sub style={{ flex: 1, color: colors.onSurface }}>{a.label}</Sub>
              <Switch on={!!can[a.key]} testID={`role-can-${a.key}`} onChange={(v) => setCan({ ...can, [a.key]: v })} />
            </Row>
          ))}
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Record visibility</Lbl>
        <Card>
          {scopeKeys.map((k: any, i: number) => (
            <Row between key={k.key} style={{ paddingVertical: 9, borderBottomWidth: i === scopeKeys.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}><H4>{k.label}</H4></View>
              <View style={s.seg}>
                {(["own", "shop", "all"] as Scope[]).map((sc) => (
                  <Pressable key={sc} testID={`role-scope-${k.key}-${sc}`} onPress={() => setScopes({ ...scopes, [k.key]: sc })} style={[s.segItem, scopes[k.key] === sc && s.segOn]}>
                    <Text style={[s.segText, scopes[k.key] === sc && s.segTextOn]}>{sc === "own" ? "Own" : sc === "shop" ? "Shop" : "All"}</Text>
                  </Pressable>
                ))}
              </View>
            </Row>
          ))}
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Give this role to</Lbl>
        <Card style={{ paddingVertical: 4 }}>
          {(team.data?.users ?? []).filter((u: any) => u.role !== "owner").map((u: any, i: number, arr: any[]) => (
            <Li key={u.id} last={i === arr.length - 1} testID={`role-assign-${u.id}`}
              onPress={() => setAssign(assign.includes(u.id) ? assign.filter((x) => x !== u.id) : [...assign, u.id])}>
              <Check on={assign.includes(u.id)} />
              <Av text={initials(u.name)} tone="sq" />
              <View style={{ flex: 1 }}><H4>{u.name}</H4><Sub>Currently {u.role_label}</Sub></View>
            </Li>
          ))}
          {(team.data?.users ?? []).filter((u: any) => u.role !== "owner").length === 0 ? <Li last><Sub>Invite someone first, then assign this role.</Sub></Li> : null}
        </Card>
        <Sub style={{ marginTop: 10 }}>Changing a role updates everyone who has it.</Sub>
        <Btn label="Save role" style={{ marginTop: 14 }} disabled={!label.trim()} loading={save.isPending} testID="role-save" onPress={() => save.mutate()} />
      </ScrollView>

      <Sheet visible={pickBase} onClose={() => setPickBase(false)} testID="role-base-sheet">
        <H4>Start from an existing role</H4>
        {(roles.data?.roles ?? []).map((r: any, i: number, arr: any[]) => (
          <Li key={r.key} last={i === arr.length - 1} testID={`role-base-${r.key}`} onPress={() => { setStartFrom(r.key); setPickBase(false); }}>
            <View style={{ flex: 1 }}><H4>{r.label}</H4><Sub>{r.note}</Sub></View>
            {startFrom === r.key ? <Badge tone="paid">Chosen</Badge> : null}
          </Li>
        ))}
      </Sheet>
    </View>
  );
}
