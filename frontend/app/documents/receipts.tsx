// 13.1 Bills & receipts — snap now, attach later. The unlinked queue is the
// point of the screen.
import { useEffect, useState } from "react";
import { Alert, Image, Linking, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";

import { api } from "@/src/api";
import { photoSource, uploadPhoto } from "@/src/uploads";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, Field, H4, IconBtn, Lbl, Li, Loading, Money, Row, Sub } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { money, parseNum, shortDate } from "@/src/format";
import { makeStyles } from "@/src/theme";

type Tab = "all" | "unlinked";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  thumb: { width: 46, height: 46, borderRadius: 11, backgroundColor: c.surfaceTertiary },
  big: { width: "100%", height: 260, borderRadius: 14, backgroundColor: c.surfaceTertiary },
}));

function Thumb({ url, style }: { url: string; style: any }) {
  const [src, setSrc] = useState<any>(null);
  useEffect(() => { photoSource(url).then(setSrc); }, [url]);
  return src ? <Image source={src} style={style} resizeMode="cover" /> : <View style={style} />;
}

export default function Receipts() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ url: string; title: string; amount: string } | null>(null);
  const [linking, setLinking] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);

  const q = useQuery({ queryKey: ["receipts", tab], queryFn: () => api(`/receipts?kind=${tab}`) });
  const attachables = useQuery({ queryKey: ["attachables"], queryFn: () => api("/receipts/attachables") });

  const create = useMutation({
    mutationFn: () => api("/receipts", { method: "POST", json: { photo_url: draft!.url, title: draft!.title || "Receipt", amount: parseNum(draft!.amount), kind: "other" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["receipts"] }); setDraft(null); toast.show("Saved — attach it whenever you like", "Receipt"); },
    onError: (e: any) => toast.show(e.message),
  });
  const link = useMutation({
    mutationFn: (target: any) => api(`/receipts/${linking.id}/link`, { method: "POST", json: { link_type: target.type, link_id: target.id } }),
    onSuccess: () => { qc.invalidateQueries(); setLinking(null); toast.show("Attached"); },
    onError: (e: any) => toast.show(e.message),
  });

  const capture = async (fromCamera: boolean) => {
    // Ask only when the owner has actually tapped snap or choose.
    const perm = fromCamera
      ? await ImagePicker.getCameraPermissionsAsync()
      : await ImagePicker.getMediaLibraryPermissionsAsync();
    let granted = perm.granted;
    if (!granted && perm.canAskAgain) {
      const asked = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      granted = asked.granted;
      if (!asked.granted && !asked.canAskAgain) {
        return Alert.alert(
          fromCamera ? "Camera is blocked" : "Photos are blocked",
          fromCamera ? "Tredi needs the camera to snap a supplier bill." : "Tredi needs your photos to attach a bill you already took.",
          [{ text: "Not now", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }],
        );
      }
    } else if (!granted) {
      return Alert.alert(
        fromCamera ? "Camera is blocked" : "Photos are blocked",
        "Allow access in Settings to attach bills.",
        [{ text: "Not now", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }],
      );
    }
    if (!granted) return;

    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ["images"] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ["images"] });
    if (res.canceled || !res.assets?.length) return;
    setBusy(true);
    try {
      const up = await uploadPhoto(res.assets[0].uri, res.assets[0].fileName ?? undefined, res.assets[0].mimeType ?? "image/jpeg");
      setDraft({ url: up.url, title: "", amount: "" });
    } catch (e: any) {
      toast.show(e.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const rows = q.data?.receipts ?? [];

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="receipts-screen">
      <AppBar title="Bills & receipts" back right={<IconBtn name="camera-outline" testID="receipts-snap" onPress={() => capture(true)} />} />
      <View style={{ height: 42 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          <Chip label={`All ${q.data?.total ?? 0}`} on={tab === "all"} onPress={() => setTab("all")} testID="receipts-tab-all" />
          <Chip label={`Not attached ${q.data?.unlinked ?? 0}`} on={tab === "unlinked"} onPress={() => setTab("unlinked")} testID="receipts-tab-unlinked" />
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        {busy ? <Loading label="Uploading the photo" /> : null}
        {!q.data ? <Loading /> : rows.length === 0 ? (
          <Card>
            <Empty icon="camera-outline" title="No bills yet" sub="Snap the paper bill now and attach it to a purchase or expense whenever you have a minute."
              action={<Btn label="Snap a bill" testID="receipts-empty-snap" onPress={() => capture(true)} />} />
            <Btn label="Choose from photos" variant="ghost" small style={{ marginTop: 8 }} testID="receipts-empty-pick" onPress={() => capture(false)} />
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {rows.map((r: any, i: number) => (
              <Li key={r.id} last={i === rows.length - 1} testID={`receipt-${r.id}`} onPress={() => setViewing(r)}>
                <Thumb url={r.photo_url} style={s.thumb} />
                <View style={{ flex: 1 }}>
                  <Row between><H4>{r.title || "Receipt"}</H4>{r.amount ? <Money>{money(r.amount)}</Money> : null}</Row>
                  <Row between>
                    <Sub>{shortDate(r.created_at)} · {r.created_by}</Sub>
                    {r.link_id ? <Badge tone="paid">Attached</Badge> : <Badge tone="due">Not attached</Badge>}
                  </Row>
                </View>
              </Li>
            ))}
          </Card>
        )}
        {rows.length ? (
          <Row style={{ marginTop: 12, gap: 8 }}>
            <View style={{ flex: 1 }}><Btn label="Choose photo" variant="ghost" small testID="receipts-pick" onPress={() => capture(false)} /></View>
            <View style={{ flex: 1 }}><Btn label="Snap a bill" small testID="receipts-snap-btn" onPress={() => capture(true)} /></View>
          </Row>
        ) : null}
        <Sub style={{ marginTop: 12 }}>A receipt can sit unattached for days — that is normal, and the queue above keeps it visible.</Sub>
      </ScrollView>

      <Sheet visible={!!draft} onClose={() => setDraft(null)} testID="receipt-draft-sheet">
        <H4>Save this bill</H4>
        {draft ? (
          <>
            <View style={{ marginTop: 10 }}><Thumb url={draft.url} style={s.big} /></View>
            <Field label="What is it" placeholder="Diesel for the generator" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} testID="receipt-title" style={{ marginTop: 10 }} />
            <Field label="Amount" placeholder="0" keyboardType="numeric" mono value={draft.amount} onChangeText={(v) => setDraft({ ...draft, amount: v })} testID="receipt-amount" style={{ marginTop: 8 }} />
            <Btn label="Save receipt" style={{ marginTop: 14 }} loading={create.isPending} testID="receipt-save" onPress={() => create.mutate()} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!viewing} onClose={() => setViewing(null)} testID="receipt-view-sheet">
        {viewing ? (
          <>
            <Row between><H4>{viewing.title || "Receipt"}</H4>{viewing.amount ? <Money>{money(viewing.amount)}</Money> : null}</Row>
            <View style={{ marginTop: 10 }}><Thumb url={viewing.photo_url} style={s.big} /></View>
            {viewing.link_id ? (
              <Badge tone="paid" style={{ marginTop: 12 }}>Attached to a {viewing.link_type}</Badge>
            ) : (
              <Btn label="Attach to a purchase or expense" style={{ marginTop: 14 }} testID="receipt-attach"
                onPress={() => { setLinking(viewing); setViewing(null); }} />
            )}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!linking} onClose={() => setLinking(null)} testID="receipt-link-sheet">
        <H4>Attach to…</H4>
        <Sub style={{ marginTop: 4 }}>Only entries without a photo are listed.</Sub>
        {!attachables.data ? <Loading /> : attachables.data.length === 0 ? (
          <Sub style={{ marginTop: 10 }}>Everything already has a receipt.</Sub>
        ) : attachables.data.map((t: any, i: number, arr: any[]) => (
          <Li key={`${t.type}-${t.id}`} last={i === arr.length - 1} testID={`receipt-link-${t.id}`} onPress={() => link.mutate(t)}>
            <Av icon={t.type === "purchase" ? "cart-outline" : "wallet-outline"} tone="sq" />
            <View style={{ flex: 1 }}><H4>{t.title}</H4><Sub>{t.type} · {shortDate(t.date)}</Sub></View>
            <Money>{money(t.amount)}</Money>
          </Li>
        ))}
      </Sheet>
    </View>
  );
}
