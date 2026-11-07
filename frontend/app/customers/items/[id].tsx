// Items supplied to one customer — everything they have been sold, item by item.
import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { AppBar, Av, Card, Empty, H4, Li, Loading, Money, Sub } from "@/src/components/ui";
import { money } from "@/src/format";
import { useBottomPad } from "@/src/safe";
import { useTheme } from "@/src/theme";

export default function CustomerItems() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const q = useQuery({ queryKey: ["customer-items", id], queryFn: () => api<any[]>(`/customers/${id}/items`) });
  const rows = q.data ?? [];
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, paddingTop: insets.top }} testID="customer-items-screen">
      <AppBar title="Items supplied" back />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: pad }}>
        {q.isLoading ? <Loading /> : rows.length === 0 ? (
          <Card><Empty icon="cube-outline" title="Nothing supplied yet" sub="Items on this customer's confirmed invoices show here." /></Card>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {rows.map((r, i) => (
              <Li key={`${r.item_id}-${r.name}`} last={i === rows.length - 1} testID={`customer-item-${i}`}>
                <Av icon="cube-outline" tone="sq" />
                <View style={{ flex: 1 }}>
                  <H4 numberOfLines={1}>{r.name}</H4>
                  <Sub>{r.quantity} {r.unit} · {r.times} sale{r.times > 1 ? "s" : ""} · last {dayjs(r.last_date).format("D MMM YYYY")} at {money(r.last_price)}</Sub>
                </View>
                <Money>{money(r.total)}</Money>
              </Li>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
