// 12.1 Users — each row states the one restriction that matters.
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, H4, IconBtn, Lbl, Li, Loading, Row, Sub } from "@/src/components/ui";
import { initials } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Team() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["team"], queryFn: () => api("/team") });
  const d = q.data;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="team-screen">
      <AppBar title="Users" back right={<IconBtn name="add" testID="team-invite" onPress={() => router.push("/team/invite")} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        {!d ? <Loading /> : (
          <>
            <Card style={{ paddingVertical: 4 }}>
              {d.users.map((u: any, i: number) => (
                <Li key={u.id} last={i === d.users.length - 1} testID={`team-user-${u.id}`} onPress={() => router.push(`/team/${u.id}`)}>
                  <Av text={initials(u.name)} tone={u.role === "owner" ? "green" : "sq"} />
                  <View style={{ flex: 1 }}>
                    <Row between>
                      <H4>{u.name}</H4>
                      <Badge tone={u.active ? (u.role === "owner" ? "paid" : "info") : "draft"}>{u.active ? u.role_label : "Removed"}</Badge>
                    </Row>
                    <Sub>{u.restriction}</Sub>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
                </Li>
              ))}
              <Li last testID="team-add" onPress={() => router.push("/team/invite")}>
                <Av icon="person-add-outline" tone="green" />
                <View style={{ flex: 1 }}><H4>Invite someone</H4><Sub>They sign in with an email and password</Sub></View>
              </Li>
            </Card>

            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Roles</Lbl>
            <Card style={{ paddingVertical: 4 }}>
              {d.roles.map((r: any, i: number) => (
                <Li key={r.key} last={i === d.roles.length - 1} testID={`team-role-${r.key}`}>
                  <View style={{ flex: 1 }}><H4>{r.label}</H4><Sub>{r.note}</Sub></View>
                  <Sub>{r.count}</Sub>
                </Li>
              ))}
            </Card>
            <Btn label="Build a role" variant="ghost" style={{ marginTop: 12 }} testID="team-build-role" onPress={() => router.push("/team/role-new")} />
            <Li last style={{ marginTop: 12 }} testID="team-lock" onPress={() => router.push("/settings/lock")}>
              <Av icon="lock-closed-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>App lock</H4><Sub>PIN and idle timeout on this phone</Sub></View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            <Sub style={{ marginTop: 12 }}>An owner can audit access from this one screen without opening five others.</Sub>
          </>
        )}
      </ScrollView>
    </View>
  );
}
