// Add several items: a list built one item at a time on the normal New item
// screen ("+ Add item"), then saved together. Any stock they bring becomes one
// purchase order, so it shows in Purchases.
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView } from "react-native-gesture-handler";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Btn, Card, Empty, H4, Lbl, Li, Money, Row, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { bulkDraft, useBulkDraft } from "@/src/bulk-draft";
import { money } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  footer: { paddingTop: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surfaceSecondary, gap: 8 },
}));

export default function BulkItems() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const rows = useBulkDraft();
  const total = rows.reduce((a, r) => a + (r.quantity || 0) * (r.cost_price || 0), 0);

  useEffect(() => () => bulkDraft.clear(), []);   // leaving the screen drops the list

  const save = useMutation({
    mutationFn: () => api<any>("/items/bulk", { method: "POST", json: {
      supplier: rows.find((r) => r.supplier)?.supplier ?? "", category: "General", unit: "Piece",
      items: rows.map(({ key, ...r }) => r),
    } }),
    onSuccess: (r) => {
      ["items", "items-stats", "low-stock", "dashboard", "purchases", "suppliers", "lookup"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.show(`${r.count} item${r.count > 1 ? "s" : ""} added to stock`, "Saved.");
      bulkDraft.clear();
      router.back();
    },
    onError: (e: any) => toast.show(e.message, "Not saved", "bad"),
  });

  const add = () => router.push("/stock/new?collect=1");

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="bulk-items-screen">
      <AppBar title="Add several items" close />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 16 }}>
        <Row between style={{ marginTop: 6, marginBottom: 6 }}>
          <Lbl>Items · {rows.length}</Lbl>
          {rows.length ? <Money testID="bulk-total">{money(total)}</Money> : null}
        </Row>
        {rows.length ? (
          <Card style={{ paddingVertical: 0 }}>
            {rows.map((r, i) => (
              <Li key={r.key} last={i === rows.length - 1} testID={`bulk-row-${i}`} onPress={() => router.push(`/stock/new?collect=1&row=${r.key}`)}>
                <Av icon="cube-outline" tone="sq" />
                <View style={{ flex: 1 }}>
                  <H4 numberOfLines={1}>{r.name}</H4>
                  <Sub>{r.quantity || 0} {r.unit} × {money(r.cost_price || 0)} · sells {money(r.selling_price || 0)}</Sub>
                </View>
                <Money>{money((r.quantity || 0) * (r.cost_price || 0))}</Money>
                <Pressable hitSlop={10} onPress={() => bulkDraft.remove(r.key)} testID={`bulk-remove-${i}`}>
                  <Ionicons name="close-circle" size={22} color={colors.ink40} />
                </Pressable>
              </Li>
            ))}
          </Card>
        ) : (
          <Card><Empty icon="layers-outline" title="No items yet" sub="Tap + Add item. Each one opens the usual New item form; when you finish it, it lands in this list." /></Card>
        )}
        <Sub style={{ textAlign: "center", marginTop: 10 }}>Tap an item to change it. Stock you add here is saved as one purchase order, so it shows in Purchases.</Sub>
      </ScrollView>
      <View style={[s.footer, { paddingBottom: pad }]}>
        <Btn label="Add item" icon="add" variant="ghost" onPress={add} testID="bulk-add-item" />
        <Btn label={rows.length ? `Save ${rows.length} item${rows.length > 1 ? "s" : ""}` : "Add at least one item"} disabled={!rows.length}
          loading={save.isPending} onPress={() => save.mutate()} testID="bulk-save" />
      </View>
    </View>
  );
}
