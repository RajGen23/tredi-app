// SA.18 Support access & broadcast — consent-gated, scoped, time-boxed, logged.
// A tenant must be able to say no, and the system records that they did.
import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/src/admin/api";
import { useToast } from "@/src/components/sheet";
import {
  AdminModal, AdminShell, Btn, Col, Fig, Input, Lbl, Loading, Note, Panel, Pill, Row, Sub, Table, Tabs, useWide,
} from "@/src/admin/ui";
import { ago, inFuture, stamp } from "@/src/admin/format";
import { fonts, useTheme } from "@/src/theme";

const TONE: Record<string, "ok" | "warn" | "bad" | "mut"> = { waiting: "warn", declined: "bad", completed: "ok" };

export default function Support() {
  const { colors } = useTheme();
  const { wide } = useWide();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState("access");
  const [audience, setAudience] = useState("Pro plan · Nigeria");
  const [replying, setReplying] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [logFor, setLogFor] = useState<any>(null);
  const d = useQuery({ queryKey: ["admin-support"], queryFn: () => adminApi("/support") });
  const log = useQuery({ queryKey: ["admin-support-log", logFor?.id], enabled: !!logFor, queryFn: () => adminApi(`/support/requests/${logFor.id}/log`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-support"] });

  const end = useMutation({
    mutationFn: () => adminApi("/support/session/end", { method: "POST", json: {} }),
    onSuccess: (res: any) => { toast.show(res.message, "Closed ·"); refresh(); },
    onError: (e: any) => toast.show(e.message),
  });
  const remind = useMutation({
    mutationFn: (id: string) => adminApi(`/support/requests/${id}/remind`, { method: "POST", json: {} }),
    onSuccess: (res: any) => toast.show(res.message, "Sent ·"),
  });
  const reply = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) => adminApi(`/support/messages/${id}/reply`, { method: "POST", json: { message } }),
    onSuccess: (res: any) => { toast.show(res.message, "Sent ·"); setReplying(null); setReplyText(""); refresh(); },
    onError: (e: any) => toast.show(e.message),
  });
  const closeMsg = useMutation({
    mutationFn: (id: string) => adminApi(`/support/messages/${id}/close`, { method: "POST", json: {} }),
    onSuccess: (res: any) => { toast.show(res.message, "Closed ·"); refresh(); },
  });
  const send = useMutation({
    mutationFn: (queue: boolean) => adminApi("/support/broadcast", { method: "POST", json: { audience, title, message, queue } }),
    onSuccess: (res: any) => { toast.show(res.message, "Broadcast ·"); setTitle(""); setMessage(""); refresh(); },
    onError: (e: any) => toast.show(e.message),
  });

  const cols: Col<any>[] = [
    { key: "biz", label: "Business", flex: 1.8, render: (r) => <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onSurface }} numberOfLines={1}>{r.business}</Text> },
    { key: "when", label: "Requested", flex: 1, render: (r) => <Sub>{ago(r.requested)} ago</Sub> },
    { key: "scope", label: "Scope", flex: 1.4, render: (r) => <Sub numberOfLines={1}>{r.scope}</Sub> },
    { key: "status", label: "Status", flex: 1.4, render: (r) => (
      <Pill label={r.status === "waiting" ? "Waiting on owner" : r.status === "declined" ? "Declined by owner" : `Completed · ${r.duration}`} tone={TONE[r.status] ?? "mut"} />
    ) },
    { key: "act", label: "", flex: 0.9, align: "right", render: (r) => (
      r.status === "waiting" ? <Btn label="Remind" onPress={() => remind.mutate(r.id)} testID={`remind-${r.id}`} />
        : r.status === "completed" ? <Btn label="View log" onPress={() => setLogFor(r)} testID={`log-${r.id}`} /> : <Sub>—</Sub>
    ) },
  ];

  const s = d.data?.session;

  return (
    <AdminShell title="Support" sub="admin.tredi.app/support"
      actions={<Tabs items={[{ key: "access", label: "Access requests" }, { key: "messages", label: `Messages${d.data?.messages_open ? ` · ${d.data.messages_open}` : ""}` }, { key: "broadcast", label: "Broadcast" }]} value={tab} onChange={setTab} />}
      testID="sa18-support">
      {!d.data ? <Loading /> : tab === "access" ? (
        <>
          {s ? (
            <Panel title={`Active session · ${s.business}`} sub={`Granted by ${s.granted_by} · ${s.mode} · expires in ${inFuture(s.expires_at)}`}
              style={{ borderColor: colors.brandPrimary }} testID="active-session"
              right={<Btn label="End now" tone="danger" busy={end.isPending} onPress={() => end.mutate()} testID="end-session" />}>
              <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
                {[["Reason given", s.reason], ["Scope", s.scope], ["Screens viewed", `${s.screens_viewed} · all logged`]].map(([k, v]) => (
                  <View key={k} style={{ flex: 1 }}>
                    <Lbl>{k}</Lbl>
                    <Sub style={{ marginTop: 3 }}>{v}</Sub>
                  </View>
                ))}
              </View>
            </Panel>
          ) : (
            <Note tone="info" title="No support session is open">
              {"Impersonation is read-only by default, time-boxed, needs the tenant owner's consent, and always writes an audit line the tenant can see."}
            </Note>
          )}
          <Panel pad={0} title="Requests" sub="A tenant must be able to say no, and the system records that they did">
            <Table cols={cols} rows={d.data.requests} minWidth={840} empty="No access requests" />
          </Panel>
          <AdminModal visible={!!logFor} onClose={() => setLogFor(null)} title={`Session log · ${logFor?.business ?? ""}`}
            sub={`${logFor?.scope ?? ""}${logFor?.duration ? ` · ${logFor.duration}` : ""} · the owner sees the same lines`} testID="log-modal"
            footer={<Btn label="Close" tone="primary" onPress={() => setLogFor(null)} testID="log-close" />}>
            {!log.data ? <Loading /> : (
              <Table minWidth={460} empty="No support access lines recorded for this business"
                rows={log.data.rows}
                cols={[
                  { key: "ts", label: "When", flex: 1, render: (r: any) => <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink60 }}>{stamp(r.ts)}</Text> },
                  { key: "event", label: "Event", flex: 1.5, render: (r: any) => <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }} numberOfLines={1}>{r.event}</Text> },
                  { key: "entity", label: "Detail", flex: 1.5, render: (r: any) => <Sub numberOfLines={2}>{r.entity || "—"}</Sub> },
                ]} />
            )}
          </AdminModal>
        </>
      ) : tab === "messages" ? (
        <>
          <Note tone="info" title="Messages sent from Help & support inside the app">
            {"Every reply lands in the owner's Help screen. Keep it plain, keep it short, and say what they should do next."}
          </Note>
          {d.data.messages.length === 0 ? (
            <Panel title="No messages yet" sub="Nothing has come in from a shop owner" />
          ) : d.data.messages.map((m: any) => (
            <Panel key={m.id} title={m.subject} sub={`${m.business} · ${m.topic} · ${m.by} · ${ago(m.created_at)} ago`}
              testID={`msg-${m.id}`}
              right={<Row gap={8}>
                <Pill label={m.status === "open" ? "Open" : m.status === "answered" ? "Answered" : "Closed"} tone={m.status === "open" ? "warn" : m.status === "answered" ? "ok" : "mut"} />
                {m.urgency === "urgent" ? <Pill label="Shop is stuck" tone="bad" /> : null}
              </Row>}>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 19, color: colors.onSurface }}>{m.message}</Text>
              <Sub style={{ marginTop: 6 }}>Reach them on {m.contact || "—"} · {m.replies} repl{m.replies === 1 ? "y" : "ies"} sent</Sub>
              {(m.thread ?? []).map((t: any, i: number) => (
                <View key={i} style={{ marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: colors.surfaceSecondary, borderLeftWidth: 3, borderLeftColor: colors.brandPrimary }} testID={`thread-${m.id}-${i}`}>
                  <Sub>{t.by} · {ago(t.at)} ago</Sub>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: colors.onSurface, marginTop: 3 }}>{t.message}</Text>
                </View>
              ))}
              {replying === m.id ? (
                <>
                  <View style={{ marginTop: 10 }}>
                    <Input value={replyText} onChangeText={setReplyText} multiline testID={`reply-text-${m.id}`}
                      placeholder="Open the invoice, tap Share, then Save PDF — we have pushed a fix this morning." />
                  </View>
                  <Row gap={8} style={{ marginTop: 10 }}>
                    <Btn label="Send reply" tone="primary" busy={reply.isPending} onPress={() => reply.mutate({ id: m.id, message: replyText })} testID={`reply-send-${m.id}`} />
                    <Btn label="Cancel" onPress={() => { setReplying(null); setReplyText(""); }} testID={`reply-cancel-${m.id}`} />
                  </Row>
                </>
              ) : (
                <Row gap={8} style={{ marginTop: 10 }}>
                  <Btn label="Reply" tone="primary" icon="send-outline" onPress={() => { setReplying(m.id); setReplyText(""); }} testID={`reply-${m.id}`} />
                  {m.status !== "closed" ? <Btn label="Close" onPress={() => closeMsg.mutate(m.id)} testID={`close-msg-${m.id}`} /> : null}
                </Row>
              )}
            </Panel>
          ))}
        </>
      ) : (
        <>
          <Panel title="Broadcast a message" sub="Appears in the tenant's notification centre. Not email, not SMS.">
            <Lbl>Audience</Lbl>
            <View style={{ marginTop: 6 }}>
              <Tabs items={d.data.audiences.map((a: string) => ({ key: a, label: a }))} value={audience} onChange={setAudience} />
            </View>
            <Lbl style={{ marginTop: 12 }}>Title</Lbl>
            <View style={{ marginTop: 6 }}><Input value={title} onChangeText={setTitle} placeholder="Thermal printing is now available" testID="broadcast-title" /></View>
            <Lbl style={{ marginTop: 12 }}>Message</Lbl>
            <View style={{ marginTop: 6 }}>
              <Input value={message} onChangeText={setMessage} multiline testID="broadcast-message"
                placeholder="You can now print receipts to 58mm and 80mm Bluetooth printers. Open any invoice and choose Print." />
            </View>
            <Row gap={8} style={{ marginTop: 12 }}>
              <Btn label="Send now" tone="primary" icon="send-outline" busy={send.isPending} onPress={() => send.mutate(false)} testID="broadcast-send" />
              <Btn label="Queue broadcast" onPress={() => send.mutate(true)} testID="broadcast-queue" />
            </Row>
          </Panel>
          <Panel pad={0} title="Recent broadcasts" sub="Rate-limited to one per tenant per week">
            <Table minWidth={620}
              cols={[
                { key: "title", label: "Title", flex: 2, render: (r: any) => <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }} numberOfLines={1}>{r.title}</Text> },
                { key: "audience", label: "Audience", flex: 1.4, render: (r: any) => <Sub numberOfLines={1}>{r.audience}</Sub> },
                { key: "status", label: "Status", flex: 0.8, align: "right", render: (r: any) => <Pill label={r.status} tone={r.status === "sent" ? "ok" : "warn"} /> },
                { key: "when", label: "When", flex: 0.8, align: "right", render: (r: any) => <Fig>{ago(r.created_at)}</Fig> },
              ]}
              rows={d.data.broadcasts} empty="Nothing sent yet" />
          </Panel>
          <Note tone="warn" title="A notification centre that cries wolf gets muted">
            And then the low-stock alerts go unread too. One broadcast per tenant per week, enforced server-side.
          </Note>
        </>
      )}
    </AdminShell>
  );
}
