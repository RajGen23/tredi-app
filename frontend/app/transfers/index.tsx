// 05.7 Stock transfers — approval, transit and discrepancy never mixed.
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, Field, H4, IconBtn, Li, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { money, shortDate } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Tab = "pending" | "transit" | "received";
const BADGE: Record<string, { tone: "due" | "info" | "paid" | "over" | "draft"; label: string }> = {
  pending: { tone: "due", label: "Needs approval" },
  transit: { tone: "info", label: "In transit" },
  received: { tone: "paid", label: "Complete" },
  discrepancy: { tone: "over", label: "Discrepancy" },
  rejected: { tone: "draft", label: "Rejected" },
};

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Transfers() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");
  const [reject, setReject] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const q = useQuery({ queryKey: ["transfers"], queryFn: () => api("/transfers") });
  const approve = useMutation({
    mutationFn: (id: string) => api(`/transfers/${id}/approve`, { method: "POST" }),
    onSuccess: (r: any) => { qc.invalidateQueries(); toast.show("Stock left the sending shop", r.number); },
    onError: (e: any) => toast.show(e.message),
  });
  const deny = useMutation({
    mutationFn: () => api(`/transfers/${reject}/reject`, { method: "POST", json: { reason } }),
    onSuccess: () => { qc.invalidateQueries(); setReject(null); setReason(""); toast.show("Transfer rejected"); },
    onError: (e: any) => toast.show(e.message),
  });

  const rows = useMemo(() => {
    const all = q.data?.transfers ?? [];
    if (tab === "pending") return all.filter((t: any) => t.state === "pending");
    if (tab === "transit") return all.filter((t: any) => t.state === "transit");
    return all.filter((t: any) => ["received", "discrepancy", "rejected"].includes(t.state));
  }, [q.data, tab]);
  const counts = q.data?.counts ?? {};

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="transfers-screen">
      <AppBar title="Transfers" back right={<IconBtn name="add" testID="transfers-add" onPress={() => router.push("/transfers/new")} />} />
      <View style={{ height: 42 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          <Chip label={`Pending ${counts.pending ?? 0}`} on={tab === "pending"} onPress={() => setTab("pending")} testID="transfers-tab-pending" />
          <Chip label={`In transit ${counts.transit ?? 0}`} on={tab === "transit"} onPress={() => setTab("transit")} testID="transfers-tab-transit" />
          <Chip label="Received" on={tab === "received"} onPress={() => setTab("received")} testID="transfers-tab-received" />
        </ScrollView>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {!q.data ? <Loading /> : rows.length === 0 ? (
          <Card>
            <Empty icon="swap-horizontal-outline" title="Nothing here" sub="Transfers move stock between your shops without touching sales."
              action={<Btn label="New transfer" testID="transfers-empty-add" onPress={() => router.push("/transfers/new")} />} />
          </Card>
        ) : rows.map((t: any) => (
          <Card key={t.id} style={{ marginBottom: 9 }} testID={`transfer-${t.id}`}>
            <Row style={{ gap: 10 }}>
              <Av icon="swap-horizontal-outline" tone={t.state === "discrepancy" ? "coral" : "mint"} />
              <View style={{ flex: 1 }}>
                <Row between><H4>{t.number}</H4><Money>{money(t.value)}</Money></Row>
                <Row between>
                  <Sub>{t.from_shop} → {t.to_shop}</Sub>
                  <Badge tone={BADGE[t.state]?.tone ?? "draft"}>{BADGE[t.state]?.label ?? t.state}</Badge>
                </Row>
                <Tag>{t.lines.length} items · {t.units} units · {shortDate(t.created_at)}</Tag>
                {t.state === "discrepancy" ? <Sub style={{ color: colors.coral }}>Short on receipt — reason recorded</Sub> : null}
              </View>
            </Row>
            {t.state === "pending" ? (
              <Row style={{ marginTop: 10, gap: 8 }}>
                <View style={{ flex: 1 }}><Btn label="Reject" variant="ghost" small testID={`transfer-reject-${t.id}`} onPress={() => setReject(t.id)} /></View>
                <View style={{ flex: 1 }}><Btn label="Approve" small loading={approve.isPending} testID={`transfer-approve-${t.id}`} onPress={() => approve.mutate(t.id)} /></View>
              </Row>
            ) : t.state === "transit" ? (
              <Btn label="Receive transfer" small variant="deep" style={{ marginTop: 10 }} testID={`transfer-receive-${t.id}`} onPress={() => router.push(`/transfers/${t.id}`)} />
            ) : null}
          </Card>
        ))}
      </ScrollView>

      <Sheet visible={!!reject} onClose={() => setReject(null)} testID="transfer-reject-sheet">
        <H4>Why are you rejecting it?</H4>
        <Sub style={{ marginTop: 4 }}>The sending shop sees this reason.</Sub>
        <Field label="Reason" placeholder="Not needed at this branch" value={reason} onChangeText={setReason} testID="transfer-reject-reason" style={{ marginTop: 10 }} />
        <Btn label="Reject transfer" variant="coral" style={{ marginTop: 14 }} disabled={!reason.trim()} loading={deny.isPending} testID="transfer-reject-save" onPress={() => deny.mutate()} />
      </Sheet>
    </View>
  );
}
