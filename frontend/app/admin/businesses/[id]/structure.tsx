// SA.5 Shops & users of a business — read side by side, because the question is
// almost always relational: who can touch which branch.
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import {
  AdminShell, Avatar, Btn, Col, Fig, Lbl, Loading, Note, Panel, Pill, Row, Sub, Table, TenantTabs, useWide,
} from "@/src/admin/ui";
import { ago, compactMoney } from "@/src/admin/format";
import { fonts, useTheme } from "@/src/theme";

export default function Structure() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { wide } = useWide();
  const router = useRouter();
  const d = useQuery({ queryKey: ["admin-structure", id], queryFn: () => adminApi(`/businesses/${id}/structure`) });
  const custom = (d.data?.staff ?? []).find((u: any) => u.custom);

  const shopCols: Col<any>[] = [
    { key: "shop", label: "Shop", flex: 1.8, render: (r) => (
      <View>
        <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.name}</Text>
        {r.head_office ? <Sub>Head office</Sub> : null}
      </View>
    ) },
    { key: "type", label: "Type", flex: 1, render: (r) => <Pill label={r.type} tone={r.type === "Retail" ? "ok" : "mut"} /> },
    { key: "staff", label: "Staff", flex: 0.6, align: "right", render: (r) => <Fig>{r.staff}</Fig> },
    { key: "sales", label: "30d sales", flex: 1, align: "right", render: (r) => <Fig>{r.sales_30d ? compactMoney(r.sales_30d) : "—"}</Fig> },
  ];

  const staffCols: Col<any>[] = [
    { key: "user", label: "User", flex: 2, render: (r) => (
      <Row gap={9}>
        <Avatar text={r.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")} />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.name}</Text>
          <Sub numberOfLines={1}>{r.title || r.role}</Sub>
        </View>
      </Row>
    ) },
    { key: "role", label: "Role", flex: 1, render: (r) => <Pill label={r.custom ? "Custom" : r.role} tone={r.custom ? "info" : "mut"} /> },
    { key: "shops", label: "Shops", flex: 1, render: (r) => <Sub numberOfLines={1}>{r.shops}</Sub> },
    { key: "seen", label: "Last seen", flex: 0.9, align: "right", render: (r) => <Sub>{ago(r.last_seen)}</Sub> },
    { key: "device", label: "Device", flex: 0.9, align: "right", render: (r) => <Sub>{r.device}</Sub> },
  ];

  return (
    <AdminShell title={d.data?.name ?? "Shops & users"} sub={`business_id ${d.data?.business_key ?? ""}`}
      actions={<Row gap={8}>
        <Btn label="Back to tenant" icon="arrow-back" onPress={() => router.push(`/admin/businesses/${id}` as any)} />
        <Btn label="Invite on behalf" tone="primary" icon="person-add-outline" onPress={() => router.push("/admin/users")} />
      </Row>}
      testID="sa5-structure">
      {!d.data ? <Loading /> : (
        <>
          <TenantTabs id={String(id)} active="structure" />
          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <Panel style={{ flex: 1 }} pad={0} title={`Shops · ${d.data.shops.length}`} sub="shop_id scoped">
              <Table cols={shopCols} rows={d.data.shops.map((s: any, i: number) => ({ ...s, id: String(i) }))} minWidth={420} />
            </Panel>
            <Panel style={{ flex: 1.4 }} pad={0} title={`Staff · ${d.data.staff.length}`} sub="Membership is per business">
              <Table cols={staffCols} rows={d.data.staff} minWidth={620} />
            </Panel>
          </View>
          {custom ? (
            <Note tone="info" title={`${custom.name.split(" ")[0]} holds a custom role built by the owner`}
              action={<Btn label="Inspect permissions" onPress={() => router.push("/admin/roles")} testID="inspect-permissions" />}>
              {`“${custom.role}” — ${custom.custom_note || "a non-standard permission set, flagged so support can see it at a glance."}`}
            </Note>
          ) : null}
          <Row gap={10} wrapped>
            <Lbl>Shops are a second key inside a business, never a separate tenant</Lbl>
          </Row>
        </>
      )}
    </AdminShell>
  );
}
