// 01.4 Notifications — every trigger in one inbox, each with the one action
// that resolves it.
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Empty, H4, IconBtn, IonName, Lbl, Li, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { money } from "@/src/format";
import { makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const TONE = { warn: "coral", info: "blue", good: "green", mut: "sq" } as const;

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Notifications() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications") });
  const d = q.data;

  const rows = (list: any[]) => (
    <Card style={{ paddingVertical: 4 }}>
      {list.map((n: any, i: number) => (
        <Li key={`${n.id}-${i}`} last={i === list.length - 1} testID={`notification-${n.id}`} onPress={n.route ? () => router.push(n.route) : undefined}>
          <Av icon={n.icon as IonName} tone={TONE[n.tone as keyof typeof TONE] ?? "sq"} />
          <View style={{ flex: 1 }}>
            <Row between><H4>{n.title}</H4>{n.amount ? <Money tone="pos">{money(n.amount)}</Money> : <Tag>{n.when}</Tag>}</Row>
            <Sub>{n.sub}</Sub>
          </View>
          {n.action ? <Badge tone="info">{n.action}</Badge> : null}
        </Li>
      ))}
    </Card>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="notifications-screen">
      <AppBar title="Notifications" back right={<IconBtn name="settings-outline" testID="notifications-settings" onPress={() => router.push("/settings/backup")} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        {!d ? <Loading /> : (
          <>
            {d.today.length === 0 && d.earlier.length === 0 ? (
              <Card><Empty icon="notifications-outline" title="Nothing needs you" sub="Overdue invoices, low stock and waiting transfers land here." /></Card>
            ) : null}
            {d.today.length ? <><Lbl style={{ marginBottom: 6 }}>Today</Lbl>{rows(d.today)}</> : null}
            {d.earlier.length ? <><Lbl style={{ marginTop: 14, marginBottom: 6 }}>Earlier</Lbl>{rows(d.earlier)}</> : null}
            <Btn label="Open the activity trail" variant="ghost" style={{ marginTop: 14 }} testID="notifications-activity" onPress={() => router.push("/activity")} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
