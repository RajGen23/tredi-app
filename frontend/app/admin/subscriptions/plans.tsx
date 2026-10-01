// SA.7 Plans & pricing — changes apply on next renewal, never mid-cycle.
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { adminApi } from "@/src/admin/api";
import { AdminShell, Btn, Col, Fig, H2, Lbl, Loading, Note, Panel, Pill, Row, Sub, Table, useWide } from "@/src/admin/ui";
import { fonts, useTheme } from "@/src/theme";

export default function Plans() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const d = useQuery({ queryKey: ["admin-plans"], queryFn: () => adminApi("/plans") });

  const cols: Col<any>[] = [
    { key: "feature", label: "Feature", flex: 2.4, render: (r) => <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }}>{r.feature}</Text> },
    ...["trial", "starter", "premium", "pro", "enterprise"].map((k) => ({
      key: k, label: k[0].toUpperCase() + k.slice(1), flex: 0.8, align: "right" as const,
      render: (r: any) => r[k]
        ? <Ionicons name="checkmark" size={15} color={colors.green700} />
        : <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.ink40 }}>—</Text>,
    })),
  ];

  return (
    <AdminShell title="Plans & pricing" sub="Changes apply on next renewal, never mid-cycle"
      actions={<Btn label="New plan" icon="add" tone="primary" />} testID="sa7-plans">
      {!d.data ? <Loading /> : (
        <>
          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            {d.data.plans.map((p: any) => (
              <Panel key={p.key} style={{ flex: 1, borderColor: p.note ? colors.brandPrimary : colors.border }} testID={`plan-${p.key}`}>
                <Row style={{ justifyContent: "space-between" }}>
                  <H2>{p.name}</H2>
                  <Pill label={p.note || p.cadence} tone={p.note ? "ok" : "mut"} />
                </Row>
                <Fig size={24} style={{ marginTop: 8 }}>{p.price_label}</Fig>
                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 11 }} />
                {[["Locations", p.shops], ["Staff", p.users], ["Storage", p.storage], ["Businesses", p.businesses]].map(([k, v]) => (
                  <Row key={k as string} style={{ justifyContent: "space-between", paddingVertical: 4 }}>
                    <Lbl>{k}</Lbl><Fig>{v}</Fig>
                  </Row>
                ))}
                <Sub style={{ marginTop: 10 }}>{p.count.toLocaleString()} on this plan</Sub>
              </Panel>
            ))}
          </View>
          <Panel pad={0} title="Feature gates" sub="Which plan unlocks what">
            <Table cols={cols} rows={d.data.gates.map((g: any, i: number) => ({ ...g, id: String(i) }))} minWidth={620} />
          </Panel>
          <Note tone="info" title="Offline and backup are on every plan, including trial">
            {"Gating the feature that protects a trader's data would be the wrong thing to sell against."}
          </Note>
        </>
      )}
    </AdminShell>
  );
}
