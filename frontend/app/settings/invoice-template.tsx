// 04.10b Invoice templates — logo, brand colour, logo size, item photos and the
// six document layouts. Saved once, applied to every invoice and quotation.
import { useEffect, useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { photoSource, uploadPhoto } from "@/src/uploads";
import { AppBar, Av, Btn, Card, Field, H4, Lbl, Loading, Row, Sub, Switch } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { LOGO_SIZES, SWATCHES, TEMPLATES, TemplateKey } from "@/src/invoice-templates";
import { parseNum } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  drop: { height: 116, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.radioBorder, alignItems: "center", justifyContent: "center", backgroundColor: c.faint, gap: 6 },
  swatch: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 2.5, borderColor: c.onSurface },
  size: { flex: 1, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: c.border, alignItems: "center", backgroundColor: c.surfaceSecondary },
  sizeOn: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  sizeText: { fontFamily: fonts.bold, fontSize: 12, color: c.onSurface },
  card: { width: "31.5%", borderRadius: 12, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary, padding: 6, gap: 5 },
  cardOn: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  cardName: { fontFamily: fonts.bold, fontSize: 10, color: c.onSurface, textAlign: "center" },
  thumb: { height: 92, borderRadius: 7, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, overflow: "hidden", padding: 5, gap: 3 },
  bar: { height: 4, borderRadius: 2, backgroundColor: c.switchOff },
}));

/** Tiny skeleton of each layout so the choice is visual, not a list of names. */
function Thumb({ tpl, color }: { tpl: TemplateKey; color: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const line = (w: any, h = 3, bg?: string) => <View style={[s.bar, { width: w, height: h, backgroundColor: bg ?? colors.switchOff }]} />;
  const table = (
    <View style={{ gap: 3, marginTop: 4 }}>
      {[0, 1, 2].map((i) => (
        <Row key={i} style={{ gap: 3 }}>
          {line("46%")}
          <View style={{ flex: 1 }} />
          {line("18%")}
        </Row>
      ))}
    </View>
  );
  const totals = (bg: string) => <View style={{ marginTop: 5, height: 9, borderRadius: 3, backgroundColor: bg }} />;

  if (tpl === "t2") {
    return (
      <View style={s.thumb}>
        <View style={{ height: 22, borderRadius: 5, backgroundColor: color, padding: 4, gap: 3 }}>{line("54%", 3, "rgba(255,255,255,0.85)")}{line("34%", 2, "rgba(255,255,255,0.6)")}</View>
        {table}{totals(color)}
      </View>
    );
  }
  if (tpl === "t3") {
    return (
      <View style={[s.thumb, { alignItems: "center" }]}>
        {line("40%", 6, color)}{line("26%", 2)}
        <View style={{ height: 1, backgroundColor: colors.border, alignSelf: "stretch", marginVertical: 3 }} />
        <View style={{ alignSelf: "stretch" }}>{table}{totals(color)}</View>
      </View>
    );
  }
  if (tpl === "t4") {
    return (
      <Row style={[s.thumb, { alignItems: "stretch", gap: 5 }]}>
        <View style={{ width: 5, borderRadius: 3, backgroundColor: color }} />
        <View style={{ flex: 1 }}>{line("52%", 5, color)}{line("30%", 2)}{table}{totals(color)}</View>
      </Row>
    );
  }
  if (tpl === "t5") {
    return (
      <View style={s.thumb}>
        <View style={{ height: 30, borderRadius: 6, backgroundColor: color, padding: 5, gap: 3 }}>{line("48%", 4, "rgba(255,255,255,0.9)")}{line("30%", 2, "rgba(255,255,255,0.6)")}</View>
        {table}{totals(colors.surfaceTertiary)}
      </View>
    );
  }
  if (tpl === "t7") {
    return (
      <View style={s.thumb}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ gap: 2 }}>{line(22, 5, color)}{line(16, 2)}</View>
          <View style={{ gap: 2, alignItems: "flex-end" }}>{line(24, 5, colors.onSurface)}{line(14, 2)}</View>
        </Row>
        <Row style={{ gap: 3, marginTop: 3 }}>{[0, 1, 2, 3].map((i) => <View key={i} style={{ flex: 1, gap: 2 }}>{line("80%", 2)}{line("60%", 2)}</View>)}</Row>
        <View style={{ height: 6, borderRadius: 2, backgroundColor: colors.onSurface, marginTop: 3 }} />
        {table}
        <Row style={{ gap: 3, marginTop: 3 }}>
          <View style={{ flex: 1, gap: 2 }}>{line("70%", 2)}{line("50%", 2)}</View>
          <View style={{ flex: 1, gap: 2, alignItems: "flex-end" }}>{line("60%", 2)}<View style={{ height: 6, width: "80%", borderRadius: 2, backgroundColor: color }} /></View>
        </Row>
      </View>
    );
  }
  if (tpl === "t6") {
    return (
      <View style={s.thumb}>
        <Row style={{ justifyContent: "space-between" }}>{line("40%", 3, color)}{line("22%", 2)}</Row>
        <View style={{ gap: 2, marginTop: 3 }}>
          {[0, 1, 2, 3, 4].map((i) => <Row key={i} style={{ gap: 3 }}>{line("50%", 2)}<View style={{ flex: 1 }} />{line("16%", 2)}</Row>)}
        </View>
        {totals(colors.surfaceTertiary)}
      </View>
    );
  }
  return (
    <View style={s.thumb}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ gap: 3 }}>{line(26, 7, color)}{line(20, 2)}</View>
        <View style={{ gap: 3, alignItems: "flex-end" }}>{line(18, 3)}{line(12, 2)}</View>
      </Row>
      {table}{totals(color)}
    </View>
  );
}

export default function InvoiceTemplates() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["invoice-settings"], queryFn: () => api("/settings/invoice") });
  const [f, setF] = useState<any>(null);
  const [logo, setLogo] = useState("");
  const [busy, setBusy] = useState(false);
  // Only seed from the server once: a refetch after Save must not wipe what the
  // owner is in the middle of picking.
  useEffect(() => { setF((cur: any) => cur ?? q.data ?? null); }, [q.data]);
  useEffect(() => {
    if (!f?.logo_url) return setLogo("");
    photoSource(f.logo_url).then((src) => setLogo(src.uri));
  }, [f?.logo_url]);

  const save = useMutation({
    mutationFn: () => api("/settings/invoice", {
      method: "PUT",
      json: {
        ...q.data,
        prefix: f.prefix, next_number: parseNum(String(f.next_number)), vat_rate: parseNum(String(f.vat_rate)),
        template: f.template, brand_color: f.brand_color, header_color: f.header_color ?? "", logo_url: f.logo_url, export_format: f.export_format ?? "professional",
        logo_size: Math.min(240, Math.max(30, parseNum(String(f.logo_size)) || 90)), show_photos: f.show_photos,
      },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoice-settings"] }); toast.show("Every invoice will use this look", "Saved"); },
    onError: (e: any) => toast.show(e.message),
  });

  const pickLogo = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let granted = perm.granted;
    if (!granted && perm.canAskAgain) {
      const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
      granted = asked.granted;
      if (!asked.granted && !asked.canAskAgain) {
        return Alert.alert("Photos are blocked", "Tredi needs your photos to put your logo on invoices.",
          [{ text: "Not now", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]);
      }
    } else if (!granted) {
      return Alert.alert("Photos are blocked", "Allow access in Settings to upload your logo.",
        [{ text: "Not now", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]);
    }
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.9, mediaTypes: ["images"] });
    if (res.canceled || !res.assets?.length) return;
    setBusy(true);
    try {
      const up = await uploadPhoto(res.assets[0].uri, res.assets[0].fileName ?? "logo.png", res.assets[0].mimeType ?? "image/png");
      setF({ ...f, logo_url: up.url });
      toast.show("Logo uploaded — tap Save to apply it");
    } catch (e: any) {
      toast.show(e.message ?? "Upload failed", undefined, "bad");
    } finally {
      setBusy(false);
    }
  };

  if (!f) return <View style={[s.root, { paddingTop: insets.top }]}><AppBar title="Invoice templates" back /><Loading /></View>;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="invoice-templates-screen">
      <AppBar title="Invoice templates" back rightText="Save" onRightText={() => save.mutate()} rightTextTestID="templates-save-top" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        <Lbl style={{ marginBottom: 6 }}>Your logo</Lbl>
        <Card>
          <Pressable onPress={pickLogo} testID="templates-logo-upload">
            <View style={s.drop}>
              {logo ? (
                <Image source={{ uri: logo }} style={{ width: "70%", height: 80 }} resizeMode="contain" testID="templates-logo-preview" />
              ) : (
                <>
                  <Av icon="image-outline" tone="mint" size={38} />
                  <H4>Tap to upload</H4>
                  <Sub>PNG or JPG · shown at the top of every invoice</Sub>
                </>
              )}
            </View>
          </Pressable>
          {busy ? <Sub style={{ marginTop: 8 }}>Uploading…</Sub> : null}
          {f.logo_url ? (
            <Row style={{ marginTop: 8, gap: 8 }}>
              <Btn small variant="ghost" label="Replace" style={{ flex: 1 }} onPress={pickLogo} testID="templates-logo-replace" />
              <Btn small variant="ghost" label="Remove" style={{ flex: 1 }} onPress={() => setF({ ...f, logo_url: "" })} testID="templates-logo-remove" />
            </Row>
          ) : null}
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Brand colour</Lbl>
        <Card>
          <Row style={{ gap: 8, flexWrap: "wrap" }}>
            {SWATCHES.map((hex) => (
              <Pressable key={hex} testID={`templates-color-${hex.replace("#", "")}`} onPress={() => setF({ ...f, brand_color: hex })}
                style={[s.swatch, { backgroundColor: hex }, f.brand_color?.toUpperCase() === hex && s.swatchOn]}>
                {f.brand_color?.toUpperCase() === hex ? <Ionicons name="checkmark" size={15} color={hex === "#FFFFFF" ? colors.onSurface : "#FFFFFF"} /> : null}
              </Pressable>
            ))}
          </Row>
          <Field label="Enter hex code" value={f.brand_color} onChangeText={(v) => setF({ ...f, brand_color: v.toUpperCase() })}
            placeholder="#014747" mono autoCapitalize="characters" testID="templates-hex" style={{ marginTop: 10 }}
            right={<View style={[s.swatch, { backgroundColor: /^#[0-9A-F]{6}$/i.test(f.brand_color ?? "") ? f.brand_color : colors.surfaceTertiary, width: 26, height: 26 }]} />} />
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Header background</Lbl>
        <Card>
          <Sub>Used behind the header block on Templates 2, 5 and Professional. Leave it on “Match brand” to follow the colour above.</Sub>
          <Row style={{ gap: 8, flexWrap: "wrap", marginTop: 9 }}>
            <Pressable testID="templates-header-match" onPress={() => setF({ ...f, header_color: "" })}
              style={[s.size, { flexGrow: 0, paddingHorizontal: 12 }, !f.header_color && s.sizeOn]}>
              <Text style={s.sizeText}>Match brand</Text>
            </Pressable>
            {["#0B0B0B", "#06241F", "#FFFFFF", "#2C6ECB", "#7A4BD0"].map((hex) => (
              <Pressable key={hex} testID={`templates-header-${hex.replace("#", "")}`} onPress={() => setF({ ...f, header_color: hex })}
                style={[s.swatch, { backgroundColor: hex }, f.header_color?.toUpperCase() === hex && s.swatchOn]}>
                {f.header_color?.toUpperCase() === hex ? <Ionicons name="checkmark" size={15} color={hex === "#FFFFFF" ? colors.onSurface : "#FFFFFF"} /> : null}
              </Pressable>
            ))}
          </Row>
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Logo size</Lbl>
        <Card>
          <Row style={{ gap: 8 }}>
            {LOGO_SIZES.map((o) => (
              <Pressable key={o.key} testID={`templates-size-${o.key}`} onPress={() => setF({ ...f, logo_size: o.key })}
                style={[s.size, Number(f.logo_size) === o.key && s.sizeOn]}>
                <Text style={s.sizeText}>{o.label}</Text>
                <Sub style={{ fontSize: 10 }}>{o.note}</Sub>
              </Pressable>
            ))}
          </Row>
          <Field label="Custom size (px)" keyboardType="numeric" mono value={String(f.logo_size ?? 90)}
            onChangeText={(v) => setF({ ...f, logo_size: v })} testID="templates-custom-size" style={{ marginTop: 10 }} />
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Row between>
            <View style={{ flex: 1 }}>
              <H4>Show product image on invoice</H4>
              <Sub>{f.photos_allowed === false ? `Photos stay saved on your items, but ${f.plan_name ?? "your plan"} does not print them — upgrade in Plan & billing` : "Item photos print beside each line"}</Sub>
            </View>
            <Switch on={!!f.show_photos && f.photos_allowed !== false} onChange={f.photos_allowed === false ? undefined : (v) => setF({ ...f, show_photos: v })} testID="templates-show-photos" />
          </Row>
        </Card>

        <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Default export format</Lbl>
        <Card>
          <Row style={{ gap: 8 }}>
            {[{ k: "simple", t: "Simple", n: "Counter receipt · 80mm" }, { k: "professional", t: "Professional", n: "Full A4 invoice" }].map((o) => (
              <Pressable key={o.k} testID={`templates-format-${o.k}`} onPress={() => setF({ ...f, export_format: o.k })}
                style={[s.size, (f.export_format ?? "professional") === o.k && s.sizeOn]}>
                <Text style={s.sizeText}>{o.t}</Text>
                <Sub style={{ fontSize: 10 }}>{o.n}</Sub>
              </Pressable>
            ))}
          </Row>
          <Sub style={{ marginTop: 8 }}>
            Simple prints like the slip you get in a store — narrow paper, item lines, total, thank-you. Professional is the
            full invoice with your letterhead, item images and bank details. You can still switch on any invoice before sharing.
          </Sub>
        </Card>

        <Row between style={{ marginTop: 14, marginBottom: 6 }}>
          <Lbl>Choose template</Lbl>
          <Sub style={{ fontSize: 10.5 }} testID="templates-current">
            Now using {TEMPLATES.find((t) => t.key === f.template)?.name ?? "Template 1"}
          </Sub>
        </Row>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
          {TEMPLATES.map((t) => (
            <Pressable key={t.key} testID={`templates-pick-${t.key}`} onPress={() => setF({ ...f, template: t.key })}
              style={[s.card, f.template === t.key && s.cardOn]}>
              <Thumb tpl={t.key} color={/^#[0-9A-F]{6}$/i.test(f.brand_color ?? "") ? f.brand_color : "#014747"} />
              <Row style={{ gap: 3, justifyContent: "center" }}>
                {f.template === t.key ? <Ionicons name="checkmark-circle" size={12} color={colors.brandPrimary} /> : null}
                <Text style={s.cardName}>{t.name}</Text>
              </Row>
            </Pressable>
          ))}
        </View>
        <Sub style={{ marginTop: 8 }}>
          {TEMPLATES.find((t) => t.key === f.template)?.note} · This look is used by the Professional export and by quotations.
          The Simple export is always the counter receipt.
        </Sub>

        <Btn label="Save template" style={{ marginTop: 16 }} loading={save.isPending} testID="templates-save" onPress={() => save.mutate()} />
        <Sub style={{ marginTop: 8, textAlign: "center" }}>Open any invoice and tap View PDF to see it applied.</Sub>
      </ScrollView>
    </View>
  );
}
