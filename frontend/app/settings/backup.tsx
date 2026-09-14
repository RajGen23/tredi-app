// 11.2 Backup & sync — size stated in megabytes, because that is the real
// reason people switch these settings off.
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

import { api } from "@/src/api";
import { AppBar, Av, Btn, Card, H4, Lbl, Li, Loading, Row, Sub, Switch } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { makeStyles, useTheme } from "@/src/theme";

dayjs.extend(relativeTime);

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Backup() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sync-status"], queryFn: () => api("/sync/status") });
  const d = q.data;

  const now = useMutation({
    mutationFn: () => api("/sync/backup", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sync-status"] }); toast.show("Everything is on the cloud", "Backed up"); },
    onError: (e: any) => toast.show(e.message),
  });
  const settings = useMutation({
    mutationFn: (patch: any) => api("/sync/settings", { method: "PUT", json: { auto: d.auto, mobile_data: d.mobile_data, include_photos: d.include_photos, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sync-status"] }),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="backup-screen">
      <AppBar title="Backup & sync" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        {!d ? <Loading /> : (
          <>
            <Card style={{ alignItems: "center" }} testID="backup-status">
              <Av icon="cloud-done-outline" tone="mint" size={52} />
              <H4 style={{ marginTop: 10 }}>Last backup {d.last_sync ? dayjs(d.last_sync).fromNow() : "not yet"}</H4>
              <Sub style={{ marginTop: 2 }}>{d.last_count ? `${d.last_count} queued entries uploaded` : "Nothing waiting to upload"}</Sub>
              <Btn label="Back up now" style={{ marginTop: 12, alignSelf: "stretch" }} loading={now.isPending} testID="backup-now" onPress={() => now.mutate()} />
            </Card>

            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Settings</Lbl>
            <Card>
              <Row between>
                <View style={{ flex: 1 }}><H4>Automatic cloud backup</H4><Sub>Every 15 minutes on Wi-Fi or data</Sub></View>
                <Switch on={d.auto} onChange={(v) => settings.mutate({ auto: v })} testID="backup-auto" />
              </Row>
              <Row between style={{ marginTop: 12 }}>
                <View style={{ flex: 1 }}><H4>Back up on mobile data</H4><Sub>Uses about 3 MB a day</Sub></View>
                <Switch on={d.mobile_data} onChange={(v) => settings.mutate({ mobile_data: v })} testID="backup-mobile" />
              </Row>
              <Row between style={{ marginTop: 12 }}>
                <View style={{ flex: 1 }}><H4>Include receipt photos</H4><Sub>Adds roughly 40 MB a month</Sub></View>
                <Switch on={d.include_photos} onChange={(v) => settings.mutate({ include_photos: v })} testID="backup-photos" />
              </Row>
            </Card>

            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>What is backed up</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {Object.entries(d.counts).map(([k, v], i, arr) => (
                <Li key={k} last={i === arr.length - 1}>
                  <View style={{ flex: 1 }}><H4>{k[0].toUpperCase() + k.slice(1)}</H4></View>
                  <Sub>{String(v)} records</Sub>
                </Li>
              ))}
            </Card>
            <Sub style={{ marginTop: 10 }}>Latest backup is about {d.size_mb} MB. Restoring replaces what is on this phone — take a manual backup first.</Sub>
            <Card style={{ marginTop: 12, paddingVertical: 4 }}>
              <Li testID="backup-restore" onPress={() => toast.show("Restore runs from the cloud copy", "Soon")}>
                <Av icon="refresh-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>Restore from cloud</H4><Sub>{d.last_sync ? dayjs(d.last_sync).format("DD MMM, h:mm A") : "no copy yet"} · {d.size_mb} MB</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
              <Li last testID="backup-import" onPress={() => toast.show("Open Import from Excel under More", "Import")}>
                <Av icon="document-attach-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>Import from a file</H4><Sub>Customers or stock from Excel</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
