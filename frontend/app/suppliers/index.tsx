// 06.1 Suppliers — payables are coral, receivables are green.
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, Field, H4, IconBtn, Kpi, Li, Loading, Money, Row, Sub } from "@/src/components/ui";
import { initials, money, shortDate } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

type Tab = "all" | "owing" | "settled";
type Sort = "recent" | "owed" | "name";

const SORTS: { key: Sort; label: string }[] = [
  { key: "recent", label: "Recent PO" },
  { key: "owed", label: "Most owed" },
  { key: "name", label: "Name A–Z" },
];

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Suppliers() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["suppliers"], queryFn: () => api("/suppliers") });
  const d = q.data;

  const rows = useMemo(() => {
    let all = [...(d?.suppliers ?? [])];
    if (tab === "owing") all = all.filter((x: any) => x.owed > 0);
    if (tab === "settled") all = all.filter((x: any) => x.owed <= 0);
    const needle = search.trim().toLowerCase();
    if (needle) all = all.filter((x: any) => `${x.name} ${x.phone ?? ""} ${x.category ?? ""}`.toLowerCase().includes(needle));
    if (sort === "owed") all.sort((a: any, b: any) => b.owed - a.owed);
    if (sort === "name") all.sort((a: any, b: any) => a.name.localeCompare(b.name));
    // "recent" is the order the server already sends: newest purchase first.
    return all;
  }, [d, tab, sort, search]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="suppliers-screen">
      <AppBar title="Suppliers" back right={<IconBtn name="add" testID="suppliers-add" onPress={() => router.push("/suppliers/new")} />} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {!d ? <Loading /> : (
          <>
            <Row style={{ gap: 8 }}>
              <View style={{ flex: 1 }}><Kpi label="You owe suppliers" value={money(d.owed)} small={`${d.count} suppliers · see payables`} tone="neg"
                testID="suppliers-kpi-owed" onPress={() => router.push("/reports/receivables")} /></View>
              <View style={{ flex: 1 }}><Kpi label="Suppliers owing" value={String(d.suppliers.filter((x: any) => x.owed > 0).length)} small="tap to list them"
                testID="suppliers-kpi-owing" onPress={() => setTab("owing")} /></View>
            </Row>
            <Row style={{ marginTop: 12, gap: 6 }}>
              <Chip label={`All ${d.count}`} on={tab === "all"} onPress={() => setTab("all")} testID="suppliers-tab-all" />
              <Chip label={`Owing ${d.suppliers.filter((x: any) => x.owed > 0).length}`} on={tab === "owing"} onPress={() => setTab("owing")} testID="suppliers-tab-owing" />
              <Chip label="Settled" on={tab === "settled"} onPress={() => setTab("settled")} testID="suppliers-tab-settled" />
            </Row>
            <Field placeholder="Search a supplier" value={search} onChangeText={setSearch}
              testID="suppliers-search" style={{ marginTop: 10 }} />
            <Row style={{ marginTop: 8, gap: 6 }}>
              {SORTS.map((o) => (
                <Chip key={o.key} label={o.label} on={sort === o.key} onPress={() => setSort(o.key)} testID={`suppliers-sort-${o.key}`} />
              ))}
            </Row>
            {rows.length === 0 ? (
              <Card style={{ marginTop: 10 }}>
                <Empty icon="business-outline" title="No suppliers yet" sub="Add who you buy from, then record purchases against them."
                  action={<Btn label="Add a supplier" testID="suppliers-empty-add" onPress={() => router.push("/suppliers/new")} />} />
              </Card>
            ) : (
              <Card style={{ marginTop: 10, paddingVertical: 4 }}>
                {rows.map((x: any, i: number) => (
                  <Li key={x.id} last={i === rows.length - 1} testID={`supplier-${x.id}`} onPress={() => router.push(`/suppliers/${x.id}`)}>
                    <Av text={initials(x.name)} tone="sq" />
                    <View style={{ flex: 1 }}>
                      <Row between><H4>{x.name}</H4><Money tone={x.owed > 0 ? "neg" : "mut"}>{money(x.owed)}</Money></Row>
                      <Row between>
                        <Sub>{x.category} · {x.purchases} order{x.purchases === 1 ? "" : "s"}</Sub>
                        {x.owed > 0 ? <Badge tone="due">Owing</Badge> : <Badge tone="paid">Settled</Badge>}
                      </Row>
                      {x.last_purchase ? (
                        <Sub style={{ fontSize: 10.5 }}>Last {x.last_po || "purchase"} · {shortDate(x.last_purchase)}</Sub>
                      ) : <Sub style={{ fontSize: 10.5 }}>No purchase recorded yet</Sub>}
                    </View>
                  </Li>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
