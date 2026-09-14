// 01.2 Edit shortcuts — the owner picks their eight.
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Btn, Card, H4, IonName, Lbl, Li, Loading, Row, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Shortcuts() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["shortcuts"], queryFn: () => api("/shortcuts") });
  const [on, setOn] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  useEffect(() => { if (q.data) { setOn(q.data.on); setAvailable(q.data.available); } }, [q.data]);

  const save = useMutation({
    mutationFn: () => api("/shortcuts", { method: "PUT", json: { keys: on.map((x) => x.key) } }),
    onSuccess: () => { qc.invalidateQueries(); toast.show("Home updated"); if (router.canGoBack()) router.back(); else router.replace("/(tabs)"); },
    onError: (e: any) => toast.show(e.message),
  });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= on.length) return;
    const next = [...on];
    [next[i], next[j]] = [next[j], next[i]];
    setOn(next);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="shortcuts-screen">
      <AppBar title="Edit shortcuts" close rightText="Done" onRightText={() => save.mutate()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        <Sub>Up to eight appear on Home. Use the arrows to reorder.</Sub>
        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>On Home</Lbl>
        {!q.data ? <Loading /> : (
          <Card style={{ paddingVertical: 4 }}>
            {on.map((x, i) => (
              <Li key={x.key} last={i === on.length - 1} testID={`shortcut-on-${x.key}`}>
                <Av icon={x.icon as IonName} tone="mint" />
                <View style={{ flex: 1 }}><H4>{x.label}</H4></View>
                <Row style={{ gap: 14 }}>
                  <Ionicons name="chevron-up" size={18} color={colors.ink40} onPress={() => move(i, -1)} testID={`shortcut-up-${x.key}`} />
                  <Ionicons name="chevron-down" size={18} color={colors.ink40} onPress={() => move(i, 1)} testID={`shortcut-down-${x.key}`} />
                  <Ionicons name="remove-circle-outline" size={18} color={colors.coral} testID={`shortcut-remove-${x.key}`}
                    onPress={() => { setOn(on.filter((y) => y.key !== x.key)); setAvailable([...available, x]); }} />
                </Row>
              </Li>
            ))}
            {on.length === 0 ? <Li last><Sub>No shortcuts yet — add some below.</Sub></Li> : null}
          </Card>
        )}
        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Available</Lbl>
        <Card style={{ paddingVertical: 4 }}>
          {available.map((x, i) => (
            <Li key={x.key} last={i === available.length - 1} testID={`shortcut-add-${x.key}`}
              onPress={() => { if (on.length >= 8) return toast.show("Eight is the maximum"); setOn([...on, x]); setAvailable(available.filter((y) => y.key !== x.key)); }}>
              <Av icon={x.icon as IonName} tone="sq" />
              <View style={{ flex: 1 }}><H4>{x.label}</H4></View>
              <Ionicons name="add" size={18} color={colors.green700} />
            </Li>
          ))}
          {available.length === 0 ? <Li last><Sub>Everything is already on Home.</Sub></Li> : null}
        </Card>
        <Btn label="Save shortcuts" style={{ marginTop: 14 }} loading={save.isPending} testID="shortcuts-save" onPress={() => save.mutate()} />
      </ScrollView>
    </View>
  );
}
