// 01.3 Search — grouped, not one soup of results.
import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { Av, Badge, Card, Chip, Empty, H4, Lbl, Li, Loading, Money, Row, Sub } from "@/src/components/ui";
import { initials, money } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

type Kind = "all" | "customers" | "invoices" | "items";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  input: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: c.onSurface, paddingVertical: 6 },
}));

export default function Search() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const res = useQuery({ queryKey: ["search", q, kind], queryFn: () => api(`/search?q=${encodeURIComponent(q)}&kind=${kind}`), enabled: q.trim().length >= 2 });
  const d = res.data;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="search-screen">
      <View style={s.bar}>
        <Ionicons name="arrow-back" size={20} color={colors.onSurface} onPress={() => router.back()} />
        <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search customers, invoices, items…" placeholderTextColor={colors.ink40} style={s.input} testID="search-input" />
        {q ? <Ionicons name="close-circle" size={18} color={colors.ink40} onPress={() => setQ("")} /> : null}
      </View>
      <View style={{ height: 42 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {(["all", "customers", "invoices", "items"] as Kind[]).map((k) => (
            <Chip key={k} label={k[0].toUpperCase() + k.slice(1)} on={kind === k} onPress={() => setKind(k)} testID={`search-tab-${k}`} />
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        {q.trim().length < 2 ? (
          <Card><Empty icon="search-outline" title="Type at least two letters" sub="Search spans customers, invoices, items and suppliers at once." /></Card>
        ) : res.isLoading ? <Loading /> : !d || d.total === 0 ? (
          <Card><Empty icon="search-outline" title={`Nothing matches “${q}”`} /></Card>
        ) : (
          <>
            {d.customers.length ? (
              <>
                <Lbl style={{ marginBottom: 6 }}>Customers</Lbl>
                <Card style={{ paddingVertical: 4 }}>
                  {d.customers.map((c: any, i: number) => (
                    <Li key={c.id} last={i === d.customers.length - 1} testID={`search-customer-${c.id}`} onPress={() => router.push(`/customers/${c.id}`)}>
                      <Av text={initials(c.name)} tone="sq" />
                      <View style={{ flex: 1 }}><H4>{c.name}</H4><Sub>{c.sub}</Sub></View>
                      <Money tone={c.amount > 0 ? "neg" : "mut"}>{money(c.amount)}</Money>
                    </Li>
                  ))}
                </Card>
              </>
            ) : null}
            {d.invoices.length ? (
              <>
                <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Invoices</Lbl>
                <Card style={{ paddingVertical: 4 }}>
                  {d.invoices.map((iv: any, i: number) => (
                    <Li key={iv.id} last={i === d.invoices.length - 1} testID={`search-invoice-${iv.id}`} onPress={() => router.push(`/invoices/${iv.id}`)}>
                      <Av icon="receipt-outline" tone="sq" />
                      <View style={{ flex: 1 }}><H4>{iv.number}</H4><Sub>{iv.sub}</Sub></View>
                      {iv.status === "paid" ? <Badge tone="paid">Paid</Badge> : iv.days_overdue > 0 ? <Badge tone="over">{iv.days_overdue}d late</Badge> : <Badge tone="due">Unpaid</Badge>}
                    </Li>
                  ))}
                </Card>
              </>
            ) : null}
            {d.items.length ? (
              <>
                <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Items</Lbl>
                <Card style={{ paddingVertical: 4 }}>
                  {d.items.map((it: any, i: number) => (
                    <Li key={it.id} last={i === d.items.length - 1} testID={`search-item-${it.id}`} onPress={() => router.push(`/stock/${it.id}`)}>
                      <Av icon="cube-outline" tone="sq" />
                      <View style={{ flex: 1 }}><H4>{it.name}</H4><Sub>{it.sub}</Sub></View>
                      {it.out ? <Badge tone="over">Out</Badge> : it.low ? <Badge tone="due">Low</Badge> : null}
                    </Li>
                  ))}
                </Card>
              </>
            ) : null}
            {d.suppliers.length ? (
              <>
                <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Suppliers</Lbl>
                <Card style={{ paddingVertical: 4 }}>
                  {d.suppliers.map((su: any, i: number) => (
                    <Li key={su.id} last={i === d.suppliers.length - 1} testID={`search-supplier-${su.id}`} onPress={() => router.push(`/suppliers/${su.id}`)}>
                      <Av text={initials(su.name)} tone="sq" />
                      <View style={{ flex: 1 }}><H4>{su.name}</H4><Sub>{su.sub}</Sub></View>
                    </Li>
                  ))}
                </Card>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
