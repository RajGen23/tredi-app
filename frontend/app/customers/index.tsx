// 03.1 Customers — segmented filter, owed card, balance-first rows.
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Empty, H4, IconBtn, Li, Lbl, Loading, Money, Row, Seg, Sub } from "@/src/components/ui";
import { initials, money } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  deepCard: { backgroundColor: c.deep, borderColor: c.deep, paddingVertical: 9 },
  search: { marginTop: 8, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
            paddingHorizontal: 12, fontFamily: fonts.medium, fontSize: 14, color: c.onSurface },
}));

export default function Customers() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const [seg, setSeg] = useState<"all" | "active" | "unpaid">("all");
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState("");
  const q = useQuery({ queryKey: ["customers"], queryFn: () => api<any[]>("/customers") });
  const all = useMemo(() => q.data ?? [], [q.data]);
  const owed = all.reduce((a, c) => a + Math.max(0, c.balance), 0);
  const credit = all.reduce((a, c) => a + Math.max(0, -c.balance), 0);
  const list = useMemo(() => {
    const t = term.trim().toLowerCase();
    const digits = t.replace(/\D/g, "");
    return all.filter((c) => (seg === "all" || (seg === "unpaid" ? c.balance > 0 : c.open_invoices > 0 || c.balance !== 0))
      && (!t || (c.name || "").toLowerCase().includes(t) || (c.email || "").toLowerCase().includes(t)
          || (digits.length > 1 && (c.phone || "").replace(/\D/g, "").replace(/^234/, "0").includes(digits.replace(/^234/, "0")))));
  }, [all, seg, term]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="customers-screen">
      <AppBar title="Customers" back right={<><IconBtn name={searching ? "close" : "search-outline"} testID="customers-search" onPress={() => { setSearching(!searching); setTerm(""); }} /><IconBtn name="add" testID="customers-add" onPress={() => router.push("/customers/new")} /></>} />
      <View style={{ paddingHorizontal: 14 }}>
        {searching ? (
          <TextInput autoFocus value={term} onChangeText={setTerm} placeholder="Search name, phone or email" placeholderTextColor={colors.ink40}
            style={s.search} returnKeyType="search" clearButtonMode="while-editing" testID="customers-search-input" />
        ) : null}
        <Seg testID="customers-seg" value={seg} onChange={setSeg} options={[{ key: "all", label: `All ${all.length}` }, { key: "active", label: `Active ${all.filter((c) => c.open_invoices > 0 || c.balance !== 0).length}` }, { key: "unpaid", label: `Unpaid ${all.filter((c) => c.balance > 0).length}` }]} />
      </View>
      <FlatList
        data={q.isLoading ? [] : list}
        keyExtractor={(c) => c.id}
        initialNumToRender={20}
        windowSize={10}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 9, paddingBottom: pad }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
        ListHeaderComponent={
          <Card style={[s.deepCard, { marginBottom: 9 }]} testID="customers-owed-card">
            <Row between>
              <View><Lbl style={{ color: colors.onDeepMuted }}>You are owed</Lbl><Money tone="white" size={17}>{money(owed)}</Money></View>
              <View style={{ alignItems: "flex-end" }}><Lbl style={{ color: colors.onDeepMuted }}>You owe (credit)</Lbl><Money tone="green">{money(credit)}</Money></View>
            </Row>
          </Card>
        }
        ListEmptyComponent={q.isLoading ? <Loading /> : q.isError ? (
          <Card><Empty icon="cloud-offline-outline" title="Couldn't load customers" sub="Check your connection and try again."
            action={<Btn label="Try again" testID="customers-retry" onPress={() => q.refetch()} />} /></Card>
        ) : term ? (
          <Card><Empty icon="search-outline" title="No match" sub={`No customer matches "${term}".`} /></Card>
        ) : (
          <Card><Empty icon="people-outline" title="No customers yet" sub="Add a name and phone — that is all it takes." action={<Btn label="Add customer" testID="customers-empty-add" onPress={() => router.push("/customers/new")} />} /></Card>
        )}
        renderItem={({ item: c, index: i }) => {
          const over = c.days_overdue > 0;
          const tone = c.balance > 0 ? "neg" : c.balance < 0 ? "pos" : undefined;
          return (
            <Li testID={`customer-row-${c.id}`} last={i === list.length - 1} onPress={() => router.push(`/customers/${c.id}`)}>
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
        }}
      />
    </View>
  );
}
