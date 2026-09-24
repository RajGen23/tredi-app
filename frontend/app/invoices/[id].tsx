// 04.6 Invoice detail — teal top, amount due hero, items, and every action the
// document needs: view, edit, confirm a draft into a sales order, cancel.
import { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Divider, Field, H4, IconBtn, Li, Lbl, Loading, Money, Prog, Row, Sub, Switch, Tag } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { initials, money, shortDate, statusLabel } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  teal: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: c.deep },
  phone: { fontFamily: fonts.mono, fontSize: 12, color: c.ink60 },
  amber: { backgroundColor: c.warning, borderColor: "#F3E2BE" },
  mint: { backgroundColor: c.brandTertiary, borderColor: c.mint2 },
  red: { backgroundColor: c.error, borderColor: "#F7D6D7" },
  bold: { fontFamily: fonts.bold },
}));

export default function InvoiceDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [repeat, setRepeat] = useState(false);
  const [usePrices, setUsePrices] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [killOpen, setKillOpen] = useState(false);
  const [reason, setReason] = useState("");
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api(`/invoices/${id}`) });
  const preview = useQuery({ queryKey: ["duplicate", id, usePrices], queryFn: () => api(`/invoices/${id}/duplicate?update_prices=${usePrices}`), enabled: repeat });
  const inv = q.data;
  const draft = inv?.status === "draft";
  const cancelled = inv?.status === "cancelled";
  const issuePreview = useQuery({ queryKey: ["issue-preview", id], queryFn: () => api(`/invoices/${id}/issue-preview`), enabled: issueOpen });

  const fresh = () => ["invoices", "invoice", "customers", "customer-summary", "items", "low-stock", "dashboard", "activity", "accounts", "reports-summary"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const issueRepeat = useMutation({
    mutationFn: () => api(`/invoices/${id}/duplicate`, { method: "POST", json: { update_prices: usePrices, issue: true } }),
    onSuccess: (n: any) => { fresh(); setRepeat(false); toast.show(`${n.number} raised for ${money(n.totals.total)}`, "Repeat"); router.replace(`/invoices/${n.id}`); },
    onError: (e: any) => toast.show(e.message),
  });

  const confirmIssue = useMutation({
    mutationFn: () => api(`/invoices/${id}/issue`, { method: "POST" }),
    onSuccess: (n: any) => { fresh(); setIssueOpen(false); toast.show(`${n.number} is now a sales order — stock deducted`, "Issued."); },
    onError: (e: any) => toast.show(e.message),
  });

  const kill = useMutation({
    mutationFn: () => api(`/invoices/${id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" }),
    onSuccess: (r: any) => {
      fresh();
      setKillOpen(false);
      setReason("");
      toast.show(r.message, r.mode === "deleted" ? "Deleted." : "Cancelled.");
      if (r.mode === "deleted") router.back();
    },
    onError: (e: any) => toast.show(e.message),
  });

  const restore = useMutation({
    mutationFn: () => api(`/invoices/${id}/uncancel`, { method: "POST" }),
    onSuccess: () => { fresh(); toast.show("Invoice restored — the stock came off the shelf again", "Restored."); },
    onError: (e: any) => toast.show(e.message),
  });

  const over = inv?.status === "overdue";
  const paidPct = inv ? (inv.paid / inv.totals.total) * 100 : 0;
  const label = cancelled ? "Cancelled" : draft ? "Draft — not issued" : statusLabel(inv ?? { status: "unpaid" });

  return (
    <View style={s.root} testID="invoice-detail-screen">
      <View style={[s.teal, { height: insets.top + 132 }]} />
      <View style={{ paddingTop: insets.top }}>
        <AppBar teal back mono title={inv?.number ?? "Invoice"}
          right={<IconBtn teal name="copy-outline" testID="invoice-more" onPress={() => setRepeat(true)} />} />
      </View>
      {!inv ? <Card style={{ marginHorizontal: 14 }}><Loading /></Card> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24 }}>
          <Card>
            <Row between>
              <Badge tone={cancelled ? "over" : draft ? "draft" : over ? "over" : inv.status === "paid" ? "paid" : "due"}>{label}</Badge>
              <Tag>{draft ? "No number until issued" : `Issued ${shortDate(inv.created_at)}`}{inv.due_date && !draft ? ` · due ${shortDate(inv.due_date)}` : ""}</Tag>
            </Row>
            {inv.duplicated_from_number ? <Tag style={{ marginTop: 4 }}>Repeat of {inv.duplicated_from_number}</Tag> : null}
            <Row between style={{ marginTop: 9, alignItems: "flex-end" }}>
              <View>
                <Lbl>{draft ? "Draft total" : cancelled ? "Was" : "Amount due"}</Lbl>
                <Money tone={cancelled ? "mut" : draft ? undefined : inv.due > 0 ? "neg" : "pos"} size={22} testID="invoice-amount-due">
                  {money(draft || cancelled ? inv.totals.total : inv.due)}
                </Money>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Lbl>Invoice total</Lbl>
                <Money>{money(inv.totals.total)}</Money>
                <Tag style={inv.paid ? { color: colors.green700 } : { color: colors.coral }}>{inv.paid ? `Paid ${money(inv.paid)}` : "Nothing paid yet"}</Tag>
              </View>
            </Row>
            {!draft && !cancelled ? <View style={{ marginTop: 9 }}><Prog pct={Math.max(3, paidPct)} tone={over ? "bad" : undefined} /></View> : null}
            <Divider />
            <Row>
              <Av text={initials(inv.customer_name)} />
              <View style={{ flex: 1 }}>
                <H4>{inv.customer_name}</H4>
                {inv.customer_phone ? <Sub style={s.phone}>{inv.customer_phone}</Sub> : null}
              </View>
              {inv.customer_phone ? <IconBtn name="call-outline" testID="invoice-call-customer" onPress={() => Linking.openURL(`tel:${inv.customer_phone.replace(/\s/g, "")}`)} /> : null}
            </Row>
            <Row between style={{ marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View><Lbl>Sold by</Lbl><Sub testID="invoice-rep">{inv.rep || inv.created_by || "—"}</Sub></View>
              <View style={{ alignItems: "flex-end" }}><Lbl>Shop</Lbl><Sub>{inv.shop || "Main branch"}</Sub></View>
            </Row>
          </Card>

          {draft ? (
            <Card style={[s.amber, { marginTop: 9 }]} testID="invoice-draft-card">
              <Row style={{ alignItems: "flex-start", gap: 8 }}>
                <Ionicons name="alert-circle-outline" size={17} color={colors.amber} />
                <View style={{ flex: 1 }}>
                  <H4>This is still a draft</H4>
                  <Sub style={{ marginTop: 2 }}>
                    Nothing has left your stock and it does not count as a sale yet. Confirm it to give it a number and take the goods off the shelf.
                  </Sub>
                </View>
              </Row>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 11 }}>
                <Btn small variant="ghost" label="Edit" style={{ flex: 1 }} testID="invoice-edit-draft" onPress={() => router.push(`/invoices/new?edit=${id}`)} />
                <Btn small label="Confirm & issue" style={{ flex: 1.4 }} testID="invoice-confirm-issue" onPress={() => setIssueOpen(true)} />
              </View>
            </Card>
          ) : null}

          {cancelled ? (
            <Card style={[s.red, { marginTop: 9 }]} testID="invoice-cancelled-card">
              <H4>{inv.number} was cancelled</H4>
              <Sub style={{ marginTop: 2 }}>
                {inv.cancelled_reason ? `“${inv.cancelled_reason}” — ` : ""}{inv.cancelled_by ? `by ${inv.cancelled_by}. ` : ""}
                The number is kept so your books have no gaps. The stock went back on the shelf.
                {inv.cancelled_credit ? ` ${money(inv.cancelled_credit)} already received sits on the customer's account as unused credit.` : ""}
              </Sub>
              <Btn small variant="ghost" label="Restore this invoice" style={{ marginTop: 11 }} loading={restore.isPending} testID="invoice-restore" onPress={() => restore.mutate()} />
            </Card>
          ) : null}

          {!draft && !cancelled && inv.due > 0 ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
              <Btn small variant="ghost" label="Record payment" style={{ flex: 1 }} testID="invoice-record-payment"
                onPress={() => router.push({ pathname: "/payments/new", params: { customer_id: inv.customer_id, invoice_id: inv.id } })} />
              <Btn small variant="deep" label="Send reminder" style={{ flex: 1 }} testID="invoice-send-reminder" onPress={() => router.push(`/invoices/reminder/${id}`)} />
            </View>
          ) : null}

          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            {inv.lines.map((l: any, i: number) => (
              <Li key={i} last={i === inv.lines.length - 1 && !inv.totals.invoice_discount && !inv.totals.vat}>
                <View style={{ flex: 1 }}>
                  <H4>{l.name}{l.quick_add ? <Tag>  · quick add</Tag> : null}</H4>
                  <Tag>{l.quantity} × {money(l.unit_price, { symbol: false })}{l.discount ? ` · − ${money(l.discount, { symbol: false })}` : ""}</Tag>
                  {l.note ? <Sub>{l.note}</Sub> : null}
                </View>
                <Money>{money(l.total, { symbol: false })}</Money>
              </Li>
            ))}
            {inv.totals.invoice_discount ? <Li><View style={{ flex: 1 }}><H4>Less discount</H4><Tag>On whole invoice</Tag></View><Money tone="pos">− {money(inv.totals.invoice_discount, { symbol: false })}</Money></Li> : null}
            {inv.totals.vat ? <Li last><View style={{ flex: 1 }}><H4>VAT {inv.vat_rate}%</H4><Tag>On {money(inv.totals.taxable, { symbol: false })}</Tag></View><Money>{money(inv.totals.vat, { symbol: false })}</Money></Li> : null}
          </Card>

          <Card style={{ marginTop: 9, paddingVertical: 4 }}>
            <Li testID="invoice-view-pdf" onPress={() => router.push(`/invoices/pdf/${id}`)}>
              <Av icon="document-text-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>View PDF</H4><Sub>Preview, download, share on WhatsApp</Sub></View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            {!cancelled ? (
              <Li testID="invoice-edit" onPress={() => router.push(`/invoices/new?edit=${id}`)}>
                <Av icon="create-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>Edit invoice</H4><Sub>{draft ? "Change anything — it is not issued yet" : "Stock follows the change, line by line"}</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
            ) : null}
            {!draft ? (
              <Li testID="invoice-waybill" onPress={() => router.push(`/documents/waybill/new?invoice_id=${id}`)}>
                <Av icon="cube-outline" tone="sq" />
                <View style={{ flex: 1 }}>
                  <H4>Waybill</H4>
                  <Sub>{inv.waybill ? `${inv.waybill.number} already raised — tap for a new one` : "Driver, vehicle and packages for this invoice"}</Sub>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
            ) : null}
            <Li testID="invoice-duplicate" onPress={() => setRepeat(true)}>
              <Av icon="copy-outline" tone="sq" />
              <View style={{ flex: 1 }}>
                <H4>Duplicate this invoice</H4>
                <Sub>{inv.duplicate_count ? `Repeated ${inv.duplicate_count}× already` : "For a repeat purchase of the same basket"}</Sub>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            <Li last testID="invoice-activity" onPress={() => router.push(`/history/${id}`)}>
              <Av icon="time-outline" tone="sq" />
              <View style={{ flex: 1 }}>
                <H4>Activity & payments</H4>
                <Sub>{inv.payments.length} payment{inv.payments.length === 1 ? "" : "s"} recorded · raised by {inv.created_by || "you"}</Sub>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
          </Card>

          {!cancelled ? (
            <Btn variant="ghost" small label={draft ? "Delete this draft" : "Cancel this invoice"} style={{ marginTop: 12, borderColor: colors.coral }}
              testID="invoice-kill" onPress={() => setKillOpen(true)} />
          ) : null}
        </ScrollView>
      )}

      {/* The stock-deduction disclaimer, before a draft becomes a sales order */}
      <Sheet visible={issueOpen} onClose={() => setIssueOpen(false)} testID="invoice-issue-sheet">
        <H4>Confirm this invoice as a sales order?</H4>
        <Sub style={{ marginTop: 3 }}>{issuePreview.data?.note ?? "Working out what leaves the shelf…"}</Sub>
        {!issuePreview.data ? <Loading /> : (
          <>
            <Card style={{ marginTop: 11, paddingVertical: 4 }} testID="issue-preview-rows">
              {issuePreview.data.rows.map((r: any, i: number, arr: any[]) => (
                <Li key={i} last={i === arr.length - 1}>
                  <View style={{ flex: 1 }}>
                    <H4>{r.name}</H4>
                    <Tag>{r.quantity} {r.unit || "unit"}{r.tracked ? "" : " · not stock-tracked"}</Tag>
                  </View>
                  {r.tracked ? (
                    <Row style={{ gap: 6 }}>
                      <Money tone="mut" size={12}>{r.before}</Money>
                      <Ionicons name="arrow-forward" size={12} color={colors.ink40} />
                      <Money size={12} tone={r.short ? "neg" : "pos"}>{r.after}</Money>
                    </Row>
                  ) : <Tag>—</Tag>}
                </Li>
              ))}
            </Card>
            {issuePreview.data.short?.length ? (
              <Card style={[s.amber, { marginTop: 9, paddingVertical: 9 }]} testID="issue-short-warning">
                <Sub><Text style={s.bold}>Not enough stock</Text> for {issuePreview.data.short.join(", ")}. You can still issue it — the count will go negative until you receive more.</Sub>
              </Card>
            ) : null}
            <Card style={[s.mint, { marginTop: 9, paddingVertical: 9 }]}>
              <Sub>Once confirmed this invoice keeps the same document, gets its invoice number, counts as a sale and cannot be deleted — only cancelled.</Sub>
            </Card>
            <Btn label={`Confirm — ${money(issuePreview.data.total)}`} style={{ marginTop: 12 }} loading={confirmIssue.isPending} testID="issue-confirm" onPress={() => confirmIssue.mutate()} />
            <Btn variant="ghost" small label="Keep it as a draft" style={{ marginTop: 8 }} testID="issue-cancel" onPress={() => setIssueOpen(false)} />
          </>
        )}
      </Sheet>

      {/* Delete a draft outright, or cancel an issued invoice with a reason */}
      <Sheet visible={killOpen} onClose={() => setKillOpen(false)} testID="invoice-kill-sheet">
        <H4>{draft ? "Delete this draft?" : `Cancel ${inv?.number}?`}</H4>
        <Sub style={{ marginTop: 3 }}>
          {draft
            ? "It never touched your stock or your figures, so it goes completely."
            : "The invoice number stays on your books with a Cancelled stamp, the goods go back on the shelf and it stops counting as a sale."}
        </Sub>
        {!draft && (inv?.paid ?? 0) > 0 ? (
          <Card style={[s.amber, { marginTop: 9, paddingVertical: 9 }]} testID="kill-paid-warning">
            <Sub><Text style={s.bold}>{money(inv.paid)} was already received.</Text> It comes off this invoice and stays on {inv.customer_name}&rsquo;s account as unused credit — apply it to their next invoice or refund it.</Sub>
          </Card>
        ) : null}
        <Field label={draft ? "Reason (optional)" : "Why is it being cancelled?"} value={reason} onChangeText={setReason}
          placeholder={draft ? "Customer changed their mind" : "Wrong customer, goods returned…"} style={{ marginTop: 9 }} testID="kill-reason" />
        <Btn variant="coral" label={draft ? "Delete draft" : "Cancel invoice"} style={{ marginTop: 12 }} loading={kill.isPending}
          disabled={!draft && !reason.trim()} testID="kill-confirm" onPress={() => kill.mutate()} />
        <Btn variant="ghost" small label="Keep it" style={{ marginTop: 8 }} testID="kill-abort" onPress={() => setKillOpen(false)} />
      </Sheet>

      <Sheet visible={repeat} onClose={() => setRepeat(false)} testID="invoice-duplicate-sheet">
        <H4>Repeat this invoice</H4>
        <Sub style={{ marginTop: 4 }}>Same customer, same items. Payments, reminders and history stay with {inv?.number}.</Sub>
        <Row between style={{ marginTop: 12 }}>
          <View style={{ flex: 1 }}><H4>Use today&rsquo;s prices</H4><Sub>Off keeps the prices on {inv?.number}</Sub></View>
          <Switch on={usePrices} onChange={setUsePrices} testID="duplicate-use-prices" />
        </Row>
        {preview.data ? (
          <Card style={{ marginTop: 12 }} testID="duplicate-preview">
            <Row between><Sub>{preview.data.lines.length} line{preview.data.lines.length === 1 ? "" : "s"} · {preview.data.customer_name}</Sub><Money>{money(preview.data.totals.total)}</Money></Row>
            {preview.data.repriced.length ? <Sub style={{ marginTop: 6, color: colors.green700 }}>Re-priced: {preview.data.repriced.join(", ")}</Sub> : null}
            {preview.data.short.length ? (
              <Sub style={{ marginTop: 6, color: colors.coral }}>
                Not enough stock for {preview.data.short.map((x: any) => `${x.name} (${x.have} of ${x.need})`).join(", ")} — stock will go negative.
              </Sub>
            ) : null}
          </Card>
        ) : <Loading />}
        <Btn label="Issue it now" style={{ marginTop: 14 }} loading={issueRepeat.isPending} testID="duplicate-issue" onPress={() => issueRepeat.mutate()} />
        <Btn label="Edit before saving" variant="ghost" small style={{ marginTop: 8 }} testID="duplicate-edit"
          onPress={() => { setRepeat(false); router.push(`/invoices/new?from=${id}`); }} />
      </Sheet>
    </View>
  );
}
