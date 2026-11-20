// Merge duplicate customers. Suggested groups (same phone or same name) on top;
// or search and tick any customers by hand. Everything moves to the one you keep.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Badge, Btn, Card, Empty, H4, Lbl, Li, Loading, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { useBottomPad } from "@/src/safe";
import { fonts, useTheme } from "@/src/theme";

type C = { id: string; name: string; phone?: string; email?: string };

export default function MergeCustomers() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const qc = useQueryClient();
  const toast = useToast();
  const dupes = useQuery({ queryKey: ["customer-duplicates"], queryFn: () => api<{ reason: string; customers: C[] }[]>("/customers-duplicates") });
  const all = useQuery({ queryKey: ["customers"], queryFn: () => api<C[]>("/customers") });
  const [picked, setPicked] = useState<string[]>([]);
  const [keep, setKeep] = useState<string | null>(null);
  const [term, setTerm] = useState("");

  const byId = useMemo(() => Object.fromEntries((all.data ?? []).map((c) => [c.id, c])), [all.data]);
  const toggle = (id: string) => setPicked((p) => {
    const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
    if (!next.includes(keep ?? "")) setKeep(next[0] ?? null);
    return next;
  });
  const found = term.trim().length > 1 ? (all.data ?? []).filter((c) => (c.name || "").toLowerCase().includes(term.toLowerCase()) || (c.phone || "").includes(term)).slice(0, 30) : [];

  const merge = useMutation({
    mutationFn: () => api<any>("/customers/merge", { method: "POST", json: { keep_id: keep, merge_ids: picked.filter((x) => x !== keep) } }),
    onSuccess: (r) => {
      ["customers", "customer-duplicates", "customer", "customer-summary", "invoices"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.show(`${r.merged} duplicate${r.merged > 1 ? "s" : ""} merged into ${byId[keep!]?.name ?? "one record"}`, "Merged.");
      setPicked([]); setKeep(null);
    },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  const row = (c: C, last: boolean) => {
    const on = picked.includes(c.id);
    return (
      <Li key={c.id} last={last} onPress={() => toggle(c.id)} testID={`merge-pick-${c.id}`}>
        <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.green700 : colors.ink40} />
        <View style={{ flex: 1 }}><H4 numberOfLines={1}>{c.name}</H4><Sub>{[c.phone, c.email].filter(Boolean).join(" · ") || "No phone or email"}</Sub></View>
        {on ? (
          <Pressable onPress={() => setKeep(c.id)} hitSlop={8} testID={`merge-keep-${c.id}`}>
            {keep === c.id ? <Badge tone="paid">Keep</Badge> : <Badge tone="due">Set as keep</Badge>}
          </Pressable>
        ) : null}
      </Li>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, paddingTop: insets.top }} testID="merge-screen">
      <AppBar title="Merge duplicates" back />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: pad + 80 }} keyboardShouldPersistTaps="handled">
        <Sub>Tick the records that are the same person and choose which one to keep. Their invoices, payments and balances all move to it.</Sub>
        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Find any customer</Lbl>
        <TextInput value={term} onChangeText={setTerm} placeholder="Search name or phone" placeholderTextColor={colors.ink40} testID="merge-search"
          style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, fontFamily: fonts.medium, color: colors.onSurface }} />
        {found.length ? <Card style={{ marginTop: 8, paddingVertical: 0 }}>{found.map((c, i) => row(c, i === found.length - 1))}</Card> : null}
        <Lbl style={{ marginTop: 16, marginBottom: 6 }}>Suggested · {dupes.data?.length ?? 0}</Lbl>
        {dupes.isLoading ? <Loading /> : !dupes.data?.length ? (
          <Card><Empty icon="people-outline" title="No obvious duplicates" sub="Use search above to merge any records by hand." /></Card>
        ) : dupes.data.map((g, gi) => (
          <Card key={gi} style={{ marginBottom: 8, paddingVertical: 0 }} testID={`merge-group-${gi}`}>
            <Sub style={{ paddingTop: 8 }}>{g.reason}</Sub>
            {g.customers.map((c, i) => row(c, i === g.customers.length - 1))}
          </Card>
        ))}
      </ScrollView>
      <View style={{ position: "absolute", left: 14, right: 14, bottom: pad }}>
        <Btn label={picked.length > 1 ? `Merge ${picked.length} into "${byId[keep!]?.name ?? "selected"}"` : "Tick at least two records"}
          disabled={picked.length < 2 || !keep} loading={merge.isPending} onPress={() => merge.mutate()} testID="merge-confirm" />
      </View>
    </View>
  );
}
