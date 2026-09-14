// 12.5 See what they see — permission screens are abstract; this makes them concrete.
import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Card, H4, Lbl, Li, Loading, Row, Sub } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function PreviewMember() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["team-preview", id], queryFn: () => api(`/team/${id}/preview`) });
  const d = q.data;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="team-preview-screen">
      <AppBar title={d ? `Preview · ${d.name.split(" ")[0]}` : "Preview"} back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        {!d ? <Loading /> : (
          <>
            <Card style={{ alignItems: "center" }}>
              <Av icon="eye-outline" tone="mint" size={48} />
              <Sub style={{ marginTop: 10, textAlign: "center" }}>
                This is {d.name.split(" ")[0]}’s view with their current settings. Nothing you tap here changes their data.
              </Sub>
              <Badge tone="info" style={{ marginTop: 8 }}>{d.role_label}{d.shops.length ? ` · ${d.shops.join(", ")}` : " · all shops"}</Badge>
            </Card>

            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>They will see</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {d.sees.map((r: any, i: number) => (
                <Li key={i} last={i === d.sees.length - 1} testID={`preview-see-${i}`}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
                  <View style={{ flex: 1 }}><H4>{r.title}</H4><Sub>{r.sub}</Sub></View>
                  <Badge tone="draft">{r.scope === "own" ? "Own" : r.scope === "shop" ? "Shop" : "All"}</Badge>
                </Li>
              ))}
            </Card>

            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>They will not see</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {d.hidden.length === 0 ? <Li last><Sub>Nothing is hidden from this user.</Sub></Li> : d.hidden.map((r: any, i: number) => (
                <Li key={i} last={i === d.hidden.length - 1} testID={`preview-hidden-${i}`}>
                  <Ionicons name="close-circle" size={18} color={colors.coral} />
                  <View style={{ flex: 1 }}><H4>{r.title}</H4>{r.sub ? <Sub>{r.sub}</Sub> : null}</View>
                </Li>
              ))}
            </Card>
            <Sub style={{ marginTop: 12 }}>Stating the value of what is hidden is what makes delegating feel safe.</Sub>
          </>
        )}
      </ScrollView>
    </View>
  );
}
