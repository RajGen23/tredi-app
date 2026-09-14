// SA.9 Roles & permission templates — the matrix is the template; tenants build
// on top of it. The amber flag reports risky grants rather than preventing them.
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { adminApi } from "@/src/admin/api";
import { AdminShell, Btn, Col, Lbl, Loading, Note, Panel, Pill, Row, Table, useWide } from "@/src/admin/ui";
import { fonts, useTheme } from "@/src/theme";

export default function Roles() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const router = useRouter();
  const [selected, setSelected] = useState("Owner");
  const d = useQuery({ queryKey: ["admin-roles"], queryFn: () => adminApi("/roles") });

  const keys = ["owner", "manager", "sales", "stock", "accountant"];
  const cols: Col<any>[] = [
    { key: "permission", label: "Permission", flex: 2.4, render: (r) => (
      <Text style={{ fontFamily: r.bold ? fonts.bold : fonts.semibold, fontSize: 12, color: colors.onSurface }}>{r.permission}</Text>
    ) },
    ...keys.map((k) => ({
      key: k, label: k[0].toUpperCase() + k.slice(1), flex: 0.85, align: "right" as const,
      render: (r: any) => (typeof r[k] === "string"
        ? <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 11, color: colors.onSurface }}>{r[k]}</Text>
        : r[k] ? <Ionicons name="checkmark" size={15} color={colors.green700} />
          : <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.ink40 }}>—</Text>),
    })),
  ];
  const rows = d.data
    ? [...d.data.matrix.map((m: any, i: number) => ({ ...m, id: String(i) })),
      { id: "vis", permission: "Record visibility · Own / Shop / All", bold: true, ...d.data.visibility }]
    : [];

  return (
    <AdminShell title="Roles & permissions" sub="admin.tredi.app/roles"
      actions={<Row gap={8}><Btn label="Compare two roles" icon="git-compare-outline" /><Btn label="New template" tone="primary" icon="add" /></Row>}
      testID="sa9-roles">
      {!d.data ? <Loading /> : (
        <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
          <View style={{ flex: 1, gap: 12 }}>
            <Panel title="System templates" sub="Locked by default">
              <View style={{ gap: 7 }}>
                {d.data.templates.map((t: any) => {
                  const on = t.name === selected;
                  return (
                    <Btn key={t.name} label={`${t.name}   ${t.count.toLocaleString()}`} tone={on ? "deep" : "ghost"}
                      onPress={() => setSelected(t.name)} testID={`role-${t.name}`} />
                  );
                })}
              </View>
            </Panel>
            <Panel title={`Tenant-built · ${d.data.tenant_built.length}`} sub="Built by owners on top of a template">
              <Row gap={7} wrapped>
                {d.data.tenant_built.map((t: any) => <Pill key={t.name} label={`${t.name} ${t.count}`} tone="info" />)}
              </Row>
            </Panel>
          </View>
          <View style={{ flex: 2.4, gap: 12 }}>
            <Panel pad={0} title={`${selected} — system template`}
              sub={`Applied to ${(d.data.templates.find((t: any) => t.name === selected)?.count ?? 0).toLocaleString()} businesses. Editing this changes behaviour for everyone.`}>
              <Table cols={cols} rows={rows} minWidth={860} />
            </Panel>
            <Note tone="warn" title={d.data.flagged.note}
              action={<Btn label={`Review the ${d.data.flagged.count}`} onPress={() => router.push("/admin/users")} testID="review-flagged" />}>
              Not blocked — owners are allowed to decide this — but flagged here so it can be raised during a support call.
            </Note>
            <Lbl>Own / Shop / All is resolved server-side on every read, including report aggregates</Lbl>
          </View>
        </View>
      )}
    </AdminShell>
  );
}
