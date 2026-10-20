// 05.9 Add photos in bulk — tap a tile, pick the picture, it uploads on the
// spot and the next item is right there. Photos print on invoices, so the
// screen leads with what is still missing.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Btn, Card, Empty, H4, Lbl, Li, Loading, Prog, Row, Seg, Sub } from "@/src/components/ui";
import { Photo } from "@/src/components/photo";
import { Sheet, useToast } from "@/src/components/sheet";
import { pickAndUploadPhoto } from "@/src/uploads";
import { useBottomPad } from "@/src/safe";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Filter = "missing" | "all";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  tile: { width: "31.5%", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 14, overflow: "hidden" },
  img: { width: "100%", height: 74, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: fonts.bold, fontSize: 11, color: c.onSurface },
  sub: { fontFamily: fonts.medium, fontSize: 10, color: c.ink60 },
  busy: { ...{ position: "absolute", left: 0, right: 0, top: 0, height: 74 }, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFFB8" },
  done: { position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));

export default function StockPhotos() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const qc = useQueryClient();
  const toast = useToast();
  const itemsQ = useQuery({ queryKey: ["items"], queryFn: () => api<any[]>("/items") });
  const [filter, setFilter] = useState<Filter>("missing");
  const [busyId, setBusyId] = useState("");
  const [picking, setPicking] = useState<any | null>(null);

  const items = itemsQ.data ?? [];
  const withPhoto = items.filter((i) => i.photo_url).length;
  const list = useMemo(() => (filter === "missing" ? items.filter((i) => !i.photo_url) : items), [items, filter]);

  const save = async (item: any, camera: boolean) => {
    setPicking(null);
    setBusyId(item.id);
    try {
      const url = await pickAndUploadPhoto({ camera, crop: true });
      if (!url) return;
      await api(`/items/${item.id}/photo`, { method: "PATCH", json: { photo_url: url } });
      await qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["item", item.id] });
      toast.show(`${item.name} now has a photo`);
    } catch (e: any) {
      toast.show(e.message ?? "Upload failed", undefined, "bad");
    } finally {
      setBusyId("");
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="stock-photos-screen">
      <AppBar title="Add photos" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        <Card testID="stock-photos-progress">
          <Row between>
            <View style={{ flex: 1 }}>
              <H4>{withPhoto} of {items.length} items have a photo</H4>
              <Sub>Tap a tile, pick the picture — it saves straight away and prints on invoices.</Sub>
            </View>
          </Row>
          <View style={{ marginTop: 10 }}><Prog pct={items.length ? Math.round((withPhoto / items.length) * 100) : 0} /></View>
        </Card>

        <View style={{ marginTop: 12 }}>
          <Seg testID="stock-photos-filter" value={filter} onChange={setFilter}
            options={[{ key: "missing", label: `Missing (${items.length - withPhoto})` }, { key: "all", label: `All (${items.length})` }]} />
        </View>

        {itemsQ.isLoading ? <Loading label="Loading your stock" /> : !list.length ? (
          <Card style={{ marginTop: 12 }}>
            <Empty icon="images-outline" title="Every item has a photo" sub="Switch to All to change any picture." action={<Btn small label="Show all items" onPress={() => setFilter("all")} testID="stock-photos-show-all" />} />
          </Card>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {list.map((it) => (
              <Pressable key={it.id} testID={`stock-photo-tile-${it.id}`} onPress={() => setPicking(it)} style={({ pressed }) => [s.tile, pressed && { opacity: 0.85 }]}>
                {it.photo_url
                  ? <Photo url={it.photo_url} style={s.img} testID={`stock-photo-img-${it.id}`} />
                  : <View style={s.img}><Ionicons name="camera-outline" size={20} color={colors.ink40} /></View>}
                <View style={{ padding: 7 }}>
                  <Text style={s.name} numberOfLines={1}>{it.name}</Text>
                  <Text style={s.sub} numberOfLines={1}>{it.category}</Text>
                </View>
                {it.photo_url ? <View style={s.done}><Ionicons name="checkmark" size={13} color={colors.onSurfaceInverse} /></View> : null}
                {busyId === it.id ? <View style={s.busy}><ActivityIndicator color={colors.brandPrimary} /></View> : null}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Sheet visible={!!picking} onClose={() => setPicking(null)} testID="stock-photo-source-sheet">
        {picking ? (
          <>
            <H4>{picking.name}</H4>
            <Sub style={{ marginTop: 3 }}>Where is the picture coming from?</Sub>
            <Card style={{ marginTop: 12, paddingVertical: 4 }}>
              <Li onPress={() => save(picking, true)} testID="stock-photo-camera">
                <Av icon="camera-outline" tone="mint" />
                <View style={{ flex: 1 }}><H4>Take a photo</H4><Sub>Point at the product on the shelf</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
              <Li last onPress={() => save(picking, false)} testID="stock-photo-gallery">
                <Av icon="images-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>Choose from gallery</H4><Sub>A picture you already have</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
            </Card>
            <Lbl style={{ marginTop: 12 }}>Photos are stored with your book and used on invoices</Lbl>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
