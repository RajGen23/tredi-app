// Stock summary & valuation.
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Card, Empty, H4, Kpi, Lbl, Li, Loading, Money, Row, Sub } from "@/src/components/ui";
import { money } from "@/src/format";
import { makeStyles } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function StockReport() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["reports-stock"], queryFn: () => api("/reports/stock-valuation") });
  const d = q.data;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="stock-report-screen">
      <AppBar title="Stock summary" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        {!d ? <Loading /> : (
          <>
            <Row style={{ gap: 8 }}>
              <View style={{ flex: 1 }}><Kpi label="At cost" value={money(d.total)} small={`${d.count} items`} /></View>
              <View style={{ flex: 1 }}><Kpi label="At retail" value={money(d.retail)} small={`${d.low} low · ${d.out} out`} tone="pos" /></View>
            </Row>
            <Lbl style={{ marginTop: 12, marginBottom: 6 }}>Valuation</Lbl>
            {d.rows.length === 0 ? <Card><Empty icon="cube-outline" title="No tracked stock" /></Card> : (
              <Card style={{ paddingVertical: 4 }}>
                {d.rows.map((r: any, i: number) => (
                  <Li key={r.id} last={i === d.rows.length - 1} testID={`valuation-${r.id}`} onPress={() => router.push(`/stock/${r.id}`)}>
                    <View style={{ flex: 1 }}><H4>{r.name}</H4><Sub>{r.qty} {r.unit} · {money(r.cost)} each</Sub></View>
                    <Money>{money(r.value)}</Money>
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
