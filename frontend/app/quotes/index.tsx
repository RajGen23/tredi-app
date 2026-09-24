// 04.9 Quotations — convert-to-invoice is the primary action on every open quote.
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, H4, IconBtn, Li, Loading, Money, Row, Sub, Tag } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { money, shortDate } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

type Tab = "open" | "accepted" | "rejected" | "expired";
const STATE_BADGE: Record<string, { tone: "info" | "paid" | "over" | "draft"; label: string }> = {
  draft: { tone: "draft", label: "Draft" },
  sent: { tone: "info", label: "Sent" },
  accepted: { tone: "paid", label: "Accepted" },
  rejected: { tone: "over", label: "Rejected" },
};

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Quotes() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("open");
  const q = useQuery({ queryKey: ["quotes"], queryFn: () => api("/quotes") });

  const convert = useMutation({
    mutationFn: (id: string) => api(`/quotes/${id}/convert`, { method: "POST" }),
    onSuccess: (inv: any) => { qc.invalidateQueries(); toast.show("Stock has moved now", inv.number); router.push(`/invoices/${inv.id}`); },
    onError: (e: any) => toast.show(e.message),
  });

  const rows = useMemo(() => (q.data?.quotes ?? []).filter((x: any) => x.bucket === tab), [q.data, tab]);
  const counts = q.data?.counts ?? {};

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="quotes-screen">
      <AppBar title="Quotations" back right={<IconBtn name="add" testID="quotes-add" onPress={() => router.push("/quotes/new")} />} />
      <View style={{ height: 42 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {([["open", `Open ${counts.open ?? 0}`], ["accepted", `Accepted ${counts.accepted ?? 0}`], ["rejected", "Rejected"], ["expired", "Expired"]] as [Tab, string][]).map(([k, l]) => (
            <Chip key={k} label={l} on={tab === k} onPress={() => setTab(k)} testID={`quotes-tab-${k}`} />
          ))}
        </ScrollView>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {!q.data ? <Loading /> : rows.length === 0 ? (
          <Card>
            <Empty icon="document-text-outline" title="No quotations here" sub="A quotation reserves nothing. Stock moves the moment it becomes an invoice."
              action={<Btn label="New quotation" testID="quotes-empty-add" onPress={() => router.push("/quotes/new")} />} />
          </Card>
        ) : rows.map((x: any) => (
          <Card key={x.id} style={{ marginBottom: 9 }} testID={`quote-${x.id}`}>
            <Row style={{ gap: 10 }}>
              <Av icon="document-text-outline" tone="sq" />
              <View style={{ flex: 1 }}>
                <Row between><H4>{x.number}</H4><Money>{money(x.totals.total)}</Money></Row>
                <Row between>
                  <Sub>{x.customer_name} · sent {shortDate(x.created_at)}</Sub>
                  <Badge tone={x.expired ? "draft" : STATE_BADGE[x.state]?.tone ?? "draft"}>{x.expired ? "Expired" : STATE_BADGE[x.state]?.label ?? x.state}</Badge>
                </Row>
                <Tag>Valid to {shortDate(x.valid_until)} · {x.lines.length} items · viewed {x.views}×</Tag>
              </View>
            </Row>
            {x.bucket === "open" || x.bucket === "expired" ? (
              <Row style={{ marginTop: 10, gap: 8 }}>
                <View style={{ flex: 1 }}><Btn label="Preview" variant="ghost" small testID={`quote-preview-${x.id}`} onPress={() => router.push(`/quotes/${x.id}`)} /></View>
                <View style={{ flex: 2 }}><Btn label="Convert to invoice" small loading={convert.isPending} testID={`quote-convert-${x.id}`} onPress={() => convert.mutate(x.id)} /></View>
              </Row>
            ) : x.converted_invoice_id ? (
              <Btn label="Open the invoice" variant="ghost" small style={{ marginTop: 10 }} testID={`quote-invoice-${x.id}`} onPress={() => router.push(`/invoices/${x.converted_invoice_id}`)} />
            ) : null}
          </Card>
        ))}
        <Sub style={{ marginTop: 4 }}>Nothing is deducted from stock until a quotation becomes an invoice.</Sub>
      </ScrollView>
    </View>
  );
}
