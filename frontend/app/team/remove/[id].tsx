// 12.6 When a rep leaves — responsibility moves, history does not change.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, H4, Lbl, Li, Loading, Row, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { initials } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function RemoveMember() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [to, setTo] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["handover", id], queryFn: () => api(`/team/${id}/handover`) });
  const d = q.data;

  const act = useMutation({
    mutationFn: (deactivateOnly: boolean) => api(`/team/${id}/handover`, { method: "POST", json: { to_user_id: to, deactivate_only: deactivateOnly } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.show(r.moved ? `${r.moved} records handed over` : "Account deactivated", d?.name);
      router.replace("/team");
    },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="remove-member-screen">
      <AppBar title={d ? `Remove ${d.name.split(" ")[0]}` : "Remove"} back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        {!d ? <Loading /> : (
          <>
            <Card style={{ backgroundColor: colors.warning, borderColor: colors.warning }} testID="remove-warning">
              <H4 style={{ color: colors.amber }}>{d.name.split(" ")[0]} has {d.open_records} open records</H4>
              <Sub style={{ color: colors.amber, marginTop: 4 }}>
                If nobody takes them over, no one else scoped to their own records will be able to see them.
              </Sub>
            </Card>
            <Card style={{ marginTop: 9, paddingVertical: 4 }}>
              {d.rows.map((r: any, i: number) => (
                <Li key={r.title} last={i === d.rows.length - 1}>
                  <View style={{ flex: 1 }}><H4>{r.title}</H4>{r.sub ? <Sub>{r.sub}</Sub> : null}</View>
                  <Badge tone={r.count ? "due" : "draft"}>{r.count}</Badge>
                </Li>
              ))}
            </Card>

            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Hand them to</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {d.candidates.map((c: any, i: number) => (
                <Li key={c.id} last={i === d.candidates.length - 1} testID={`handover-to-${c.id}`} onPress={() => setTo(c.id)}>
                  <Av text={initials(c.name)} tone="sq" />
                  <View style={{ flex: 1 }}><H4>{c.name}</H4><Sub>{c.role_label}{c.shops.length ? ` · ${c.shops.join(", ")}` : " · all shops"}</Sub></View>
                  {to === c.id ? <Badge tone="paid">Chosen</Badge> : null}
                </Li>
              ))}
              {d.candidates.length === 0 ? <Li last><Sub>No one else to hand over to yet.</Sub></Li> : null}
            </Card>
            <Sub style={{ marginTop: 12 }}>
              History does not change. The records will still say {d.name.split(" ")[0]} raised them — only responsibility moves, and the handover is written to the audit trail.
            </Sub>
            <Row style={{ marginTop: 14, gap: 8 }}>
              <View style={{ flex: 1 }}><Btn label="Just deactivate" variant="ghost" small loading={act.isPending} testID="handover-deactivate" onPress={() => act.mutate(true)} /></View>
              <View style={{ flex: 1 }}><Btn label="Hand over & remove" variant="coral" small disabled={!to} loading={act.isPending} testID="handover-move" onPress={() => act.mutate(false)} /></View>
            </Row>
          </>
        )}
      </ScrollView>
    </View>
  );
}
