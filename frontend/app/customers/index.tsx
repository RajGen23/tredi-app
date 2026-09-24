// 03.1 Customers — segmented filter, owed card, balance-first rows.
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Empty, H4, IconBtn, Li, Lbl, Loading, Money, Row, Seg, Sub } from "@/src/components/ui";
import { initials, money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  deepCard: { backgroundColor: c.deep, borderColor: c.deep, paddingVertical: 9 },
}));

export default function Customers() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const [seg, setSeg] = useState<"all" | "active" | "unpaid">("all");
  const q = useQuery({ queryKey: ["customers"], queryFn: () => api<any[]>("/customers") });
  const all = q.data ?? [];
  const owed = all.reduce((a, c) => a + Math.max(0, c.balance), 0);
  const credit = all.reduce((a, c) => a + Math.max(0, -c.balance), 0);
  const list = useMemo(() => all.filter((c) => seg === "all" || (seg === "unpaid" ? c.balance > 0 : c.open_invoices > 0 || c.balance !== 0)), [all, seg]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="customers-screen">
      <AppBar title="Customers" back right={<><IconBtn name="search-outline" testID="customers-search" /><IconBtn name="add" testID="customers-add" onPress={() => router.push("/customers/new")} /></>} />
      <View style={{ paddingHorizontal: 14 }}>
        <Seg testID="customers-seg" value={seg} onChange={setSeg} options={[{ key: "all", label: `All ${all.length}` }, { key: "active", label: `Active ${all.filter((c) => c.open_invoices > 0 || c.balance !== 0).length}` }, { key: "unpaid", label: `Unpaid ${all.filter((c) => c.balance > 0).length}` }]} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 9, paddingBottom: pad }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        <Card style={s.deepCard} testID="customers-owed-card">
          <Row between>
            <View><Lbl style={{ color: colors.onDeepMuted }}>You are owed</Lbl><Money tone="white" size={17}>{money(owed)}</Money></View>
            <View style={{ alignItems: "flex-end" }}><Lbl style={{ color: colors.onDeepMuted }}>You owe (credit)</Lbl><Money tone="green">{money(credit)}</Money></View>
          </Row>
        </Card>
        {q.isLoading ? <Loading /> : list.length === 0 ? (
          <Card style={{ marginTop: 9 }}><Empty icon="people-outline" title="No customers yet" sub="Add a name and phone — that is all it takes." action={<Btn label="Add customer" testID="customers-empty-add" onPress={() => router.push("/customers/new")} />} /></Card>
        ) : (
          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            {list.map((c, i) => {
              const over = c.days_overdue > 0;
              const tone = c.balance > 0 ? "neg" : c.balance < 0 ? "pos" : undefined;
              return (
                <Li key={c.id} testID={`customer-row-${c.id}`} last={i === list.length - 1} onPress={() => router.push(`/customers/${c.id}`)}>
                  <Av text={initials(c.name)} />
                  <View style={{ flex: 1 }}>
                    <Row between><H4>{c.name}</H4><Money tone={tone}>{money(c.balance)}</Money></Row>
                    <Row between>
                      <Sub>{c.balance < 0 ? "Unused credit on account" : c.open_invoices ? `${c.open_invoices} invoice${c.open_invoices > 1 ? "s" : ""}${over ? ` · ${c.days_overdue} days late` : ""}` : `${c.price_list} · settled`}</Sub>
                      {c.balance < 0 ? <Badge tone="paid">Credit</Badge> : over ? <Badge tone="over">Overdue</Badge> : c.balance > 0 ? <Badge tone="due">Due</Badge> : <Badge tone="paid">Clear</Badge>}
                    </Row>
                  </View>
                </Li>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
