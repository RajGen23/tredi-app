// 01.6 Record history — cannot be edited or cleared; it lives with the record.
import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Card, Empty, H4, IonName, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const ICON: Record<string, IonName> = {
  invoice: "receipt-outline", payment: "arrow-down-outline", discount: "pricetag-outline", reminder: "chatbubble-ellipses-outline",
  stock: "cube-outline", transfer: "swap-horizontal-outline", sale: "flash-outline",
};

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function History() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["history", id], queryFn: () => api(`/history/${id}`) });
  const d = q.data;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="history-screen">
      <AppBar title="History" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        {!d ? <Loading /> : (
          <>
            <Card>
              <Row between>
                <View style={{ flex: 1 }}><H4>Record {d.title}</H4><Sub>{d.sub}</Sub></View>
                <Badge tone="draft">{d.count} events</Badge>
              </Row>
            </Card>
            {d.rows.length === 0 ? (
              <Card style={{ marginTop: 9 }}><Empty icon="time-outline" title="No events yet" /></Card>
            ) : (
              <Card style={{ marginTop: 9, paddingVertical: 4 }}>
                {d.rows.map((r: any, i: number) => (
                  <Row key={`${r.id}-${i}`} style={{ gap: 10, paddingVertical: 10, borderBottomWidth: i === d.rows.length - 1 ? 0 : 1, borderBottomColor: colors.border, alignItems: "flex-start" }} testID={`history-${i}`}>
                    <Av icon={ICON[r.kind] ?? "ellipse-outline"} tone="sq" />
                    <View style={{ flex: 1 }}>
                      <Row between><H4 style={{ flex: 1 }}>{r.title}</H4>{r.amount ? <Money tone={r.amount < 0 ? "neg" : undefined}>{money(r.amount)}</Money> : null}</Row>
                      <Sub>{r.by || "—"}{r.shop ? ` · ${r.shop}` : ""}</Sub>
                      <Tag>{dayjs(r.created_at).format("DD MMM, HH:mm")}{r.reason ? ` · ${r.reason}` : ""}</Tag>
                    </View>
                  </Row>
                ))}
              </Card>
            )}
            <Sub style={{ marginTop: 12 }}>History cannot be edited or cleared, and it survives a device change.</Sub>
          </>
        )}
      </ScrollView>
    </View>
  );
}
