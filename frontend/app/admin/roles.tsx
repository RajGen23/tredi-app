// SA.9 Roles & permission templates — the matrix is the template; tenants build
// on top of it. The amber flag reports risky grants rather than preventing them.
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import { AdminModal, AdminShell, Btn, Col, Input, Lbl, Loading, Note, Panel, Pill, Row, Table, Tabs, useWide } from "@/src/admin/ui";
import { fonts, useTheme } from "@/src/theme";

const SYSTEM = ["owner", "manager", "sales", "stock", "accountant"];
const cap = (k: string) => k[0].toUpperCase() + k.slice(1);

export default function Roles() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState("Owner");
  const [comparing, setComparing] = useState(false);
  const [a, setA] = useState("manager");
  const [b, setB] = useState("sales");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [basedOn, setBasedOn] = useState("Sales");
  const d = useQuery({ queryKey: ["admin-roles"], queryFn: () => adminApi("/roles") });
  const create = useMutation({
    mutationFn: () => adminApi("/roles/templates", { method: "POST", json: { name, based_on: basedOn } }),
    onSuccess: (res: any) => { toast.show(res.message, "Created ·"); setCreating(false); setName(""); qc.invalidateQueries({ queryKey: ["admin-roles"] }); },
    onError: (e: any) => toast.show(e.message),
  });

  const mark = (v: any) => (typeof v === "string"
    ? <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 11, color: colors.onSurface }}>{v}</Text>
    : v ? <Ionicons name="checkmark" size={15} color={colors.green700} />
      : <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.ink40 }}>—</Text>);
  const diff = (d.data?.matrix ?? []).map((m: any, i: number) => ({ ...m, id: String(i) })).filter((m: any) => m[a] !== m[b]);
  const compareCols: Col<any>[] = [
    { key: "permission", label: "Permission", flex: 2, render: (r) => <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }}>{r.permission}</Text> },
    { key: "a", label: cap(a), flex: 0.8, align: "right", render: (r) => mark(r[a]) },
    { key: "b", label: cap(b), flex: 0.8, align: "right", render: (r) => mark(r[b]) },
  ];

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
    <AdminShell title="Roles & permissions" sub="TradaBooks admin · /roles"
      actions={<Row gap={8}>
        <Btn label="Compare two roles" icon="git-compare-outline" onPress={() => setComparing(true)} testID="compare-roles" />
        <Btn label="New template" tone="primary" icon="add" onPress={() => setCreating(true)} testID="new-template" />
      </Row>}
      testID="sa9-roles">
      {!d.data ? <Loading /> : (
        <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
          <View style={{ flex: 1, gap: 12 }}>
            <Panel title="System templates" sub="Locked by default">
              <View style={{ gap: 7 }}>
                {d.data.templates.map((t: any) => {
                  const on = t.name === selected;
                  return (
                    <Btn key={t.name} label={`${t.name}   ${t.system ? t.count.toLocaleString() : `· from ${t.based_on}`}`} tone={on ? "deep" : "ghost"}
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
          <AdminModal visible={comparing} onClose={() => setComparing(false)} title="Compare two roles"
            sub="Only the rows where the two roles differ are shown" testID="compare-modal"
            footer={<Btn label="Done" tone="primary" onPress={() => setComparing(false)} testID="compare-done" />}>
            <Tabs items={SYSTEM.map((k) => ({ key: k, label: cap(k) }))} value={a} onChange={setA} />
            <View style={{ height: 8 }} />
            <Tabs items={SYSTEM.map((k) => ({ key: k, label: cap(k) }))} value={b} onChange={setB} />
            <View style={{ marginTop: 10 }}>
              <Table cols={compareCols} rows={diff} minWidth={420} empty="These two roles grant exactly the same things" />
            </View>
          </AdminModal>
          <AdminModal visible={creating} onClose={() => setCreating(false)} title="New role template"
            sub="Starts as a copy of a system template. Tenants can build on top of it." testID="template-modal"
            footer={<Row gap={8}>
              <Btn label="Cancel" onPress={() => setCreating(false)} />
              <Btn label="Create template" tone="primary" busy={create.isPending} onPress={() => create.mutate()} testID="template-save" />
            </Row>}>
            <Lbl>Name</Lbl>
            <View style={{ marginTop: 6, marginBottom: 12 }}><Input value={name} onChangeText={setName} placeholder="Store supervisor" testID="template-name" /></View>
            <Lbl>Based on</Lbl>
            <View style={{ marginTop: 6 }}>
              <Tabs items={SYSTEM.map((k) => ({ key: cap(k), label: cap(k) }))} value={basedOn} onChange={setBasedOn} />
            </View>
          </AdminModal>
        </View>
      )}
    </AdminShell>
  );
}
