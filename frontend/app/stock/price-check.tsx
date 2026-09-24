// Price check — scan an item to see what it sells for and what is left, without
// putting anything on a sale. The counter question, answered in two seconds.
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Empty, Field, H4, Li, Lbl, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { Photo } from "@/src/components/photo";
import { Scanner } from "@/src/components/scanner";
import { ScanResultSheet } from "@/src/components/scan-result";
import { useToast } from "@/src/components/sheet";
import { money } from "@/src/format";
import { makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  mint: { backgroundColor: c.brandTertiary, borderColor: c.mint2 },
  photo: { width: 34, height: 34, borderRadius: 9, backgroundColor: c.sqAv },
}));

export default function PriceCheck() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const q = useQuery({ queryKey: ["items"], queryFn: () => api<any[]>("/items") });
  const [scan, setScan] = useState(false);
  const [code, setCode] = useState("");
  const [item, setItem] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<any[]>([]);

  const items = q.data ?? [];
  const matches = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return [];
    return items.filter((i) => i.name.toLowerCase().includes(t) || String(i.barcode ?? "").includes(t)).slice(0, 12);
  }, [items, search]);

  const show = (hit: any | null, scanned: string) => {
    setScan(false);
    setCode(scanned);
    setItem(hit);
    if (hit) setRecent((r) => [hit, ...r.filter((x) => x.id !== hit.id)].slice(0, 8));
    else toast.show("No item carries that bar code yet");
  };

  const onScan = (scanned: string) => show(items.find((i) => String(i.barcode ?? "").trim() === scanned) ?? null, scanned);

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="price-check-screen">
      <AppBar back title="Price check" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        <Card style={[s.mint, { paddingVertical: 10 }]}>
          <Sub>Scan or search to see the price and what is left on the shelf. Nothing is added to a sale and no stock moves.</Sub>
        </Card>
        <Btn label="Scan a bar code" icon="barcode-outline" style={{ marginTop: 10 }} testID="price-check-scan" onPress={() => setScan(true)} />
        <Field label="Or search by name or code" value={search} onChangeText={setSearch} placeholder="Adeba Rice, 6009123400018"
          style={{ marginTop: 10 }} testID="price-check-search" />

        {q.isLoading ? <Loading /> : search.trim() ? (
          <Card style={{ marginTop: 9, paddingVertical: 4 }} testID="price-check-matches">
            {matches.length === 0 ? (
              <Li last><View style={{ flex: 1 }}><Sub>Nothing matches “{search.trim()}”.</Sub></View></Li>
            ) : matches.map((it, i) => (
              <Li key={it.id} last={i === matches.length - 1} testID={`price-check-pick-${it.id}`} onPress={() => show(it, it.barcode || it.name)}>
                {it.photo_url ? <Photo url={it.photo_url} style={s.photo} /> : <Av icon="cube-outline" tone="sq" />}
                <View style={{ flex: 1 }}>
                  <H4>{it.name}</H4>
                  <Sub>{it.track_stock ? `${it.quantity} ${it.unit ?? ""} left`.trim() : "Service"}{it.brand ? ` · ${it.brand}` : ""}</Sub>
                </View>
                <Money>{money(it.selling_price)}</Money>
              </Li>
            ))}
          </Card>
        ) : recent.length ? (
          <>
            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Checked just now</Lbl>
            <Card style={{ paddingVertical: 4 }} testID="price-check-recent">
              {recent.map((it, i) => (
                <Li key={it.id} last={i === recent.length - 1} testID={`price-check-recent-${it.id}`} onPress={() => show(it, it.barcode || it.name)}>
                  {it.photo_url ? <Photo url={it.photo_url} style={s.photo} /> : <Av icon="cube-outline" tone="sq" />}
                  <View style={{ flex: 1 }}>
                    <Row between><H4>{it.name}</H4><Money>{money(it.selling_price)}</Money></Row>
                    <Row between style={{ marginTop: 2 }}>
                      <Sub>{it.category}</Sub>
                      {it.track_stock && it.quantity <= 0 ? <Badge tone="over">Out of stock</Badge> : <Tag>{it.quantity} in stock</Tag>}
                    </Row>
                  </View>
                </Li>
              ))}
            </Card>
          </>
        ) : (
          <Card style={{ marginTop: 9 }}>
            <Empty icon="pricetag-outline" title="Nothing checked yet" sub="Scan a code or search above. Each check is listed here for the rest of the day." />
          </Card>
        )}
      </ScrollView>

      <Scanner visible={scan} onClose={() => setScan(false)} onScan={onScan} title="Price check"
        hint="Point at the bar code — the price comes up, nothing is added" />
      <ScanResultSheet testID="price-check-result" code={code} item={item}
        onClose={() => { setCode(""); setItem(null); }}
        onScanAgain={() => { setCode(""); setItem(null); setScan(true); }} />
    </View>
  );
}
