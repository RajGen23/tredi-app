// Add a shop — or a warehouse, which is the same thing with sales turned off.
// `?edit=<name>` reopens the same form to correct one, or put it to sleep:
// locations are never deleted, because their sales would go with them.
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Badge, Btn, Card, Field, H4, Loading, Row, Sub, Switch } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function NewShop() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [sells, setSells] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const shops = useQuery({ queryKey: ["shops"], queryFn: () => api<any>("/shops"), enabled: !!edit });
  const mine = (shops.data?.shops ?? []).find((x: any) => x.name === edit);
  useEffect(() => {
    if (!mine || loaded) return;
    setLoaded(true);
    setForm({ name: mine.name ?? "", address: mine.address ?? "", phone: mine.phone ?? "" });
    setSells(mine.sells !== false);
  }, [mine, loaded]);

  const done = (msg: string) => { qc.invalidateQueries(); toast.show(msg, form.name); router.back(); };

  const save = useMutation({
    mutationFn: () => {
      const json = { ...form, sells, is_main: mine?.is_main ?? false };
      return edit ? api(`/shops/${encodeURIComponent(edit)}`, { method: "PUT", json }) : api("/shops", { method: "POST", json });
    },
    onSuccess: () => done(edit ? "Shop updated" : "Shop added"),
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  const sleep = useMutation({
    mutationFn: () => api<any>(`/shops/${encodeURIComponent(edit ?? "")}/dormant`, { method: "POST", json: { dormant: !mine?.dormant } }),
    onSuccess: (r) => { qc.invalidateQueries(); toast.show(r.message); router.back(); },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="new-shop-screen">
      <AppBar title={edit ? "Edit shop" : "Add a shop"} close
        right={mine?.dormant ? <Badge tone="draft">Dormant</Badge> : undefined} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        {edit && !mine ? <Card><Loading /></Card> : (
          <>
            <Card style={{ gap: 8 }}>
              <Field label="Shop name" placeholder="Surulere" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} testID="shop-name" />
              <Field label="Address" placeholder="22 Ojuelegba Rd, Lagos" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} testID="shop-address" />
              <Field label="Phone" placeholder="+234 …" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} testID="shop-phone" />
            </Card>
            <Card style={{ marginTop: 9 }}>
              <Row between>
                <View style={{ flex: 1 }}><H4>Sells to customers</H4><Sub>Turn off for a warehouse that only holds stock</Sub></View>
                <Switch on={sells} onChange={setSells} testID="shop-sells" />
              </Row>
            </Card>
            <Btn label={edit ? "Save changes" : "Save shop"} style={{ marginTop: 14 }} disabled={!form.name.trim()}
              loading={save.isPending} testID="shop-save" onPress={() => save.mutate()} />
            {edit ? (
              <>
                <Btn variant="ghost" style={{ marginTop: 9 }} loading={sleep.isPending} testID="shop-dormant"
                  label={mine?.dormant ? "Reopen this shop" : "Make this shop dormant"} onPress={() => sleep.mutate()} />
                <Sub style={{ marginTop: 9 }}>
                  {mine?.dormant
                    ? "Nothing new can be recorded here while it sleeps, but every past sale, expense and stock count is still in your books and reports."
                    : "A dormant shop disappears from the switcher and from every picker. Nothing is deleted — its sales, stock and expenses stay, and you can reopen it any day."}
                </Sub>
                {form.name !== edit ? (
                  <Sub style={{ marginTop: 6 }}>Renaming moves every record written at {edit} over to {form.name}.</Sub>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
