// Help & support — FAQs, a way to reach us, and the messages this business sent.
import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Chip, Empty, Field, H4, Lbl, Li, Loading, Row, Sub } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  answer: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 19, color: c.onSurface, marginTop: 6 },
  body: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 19, color: c.onSurface },
  reply: { backgroundColor: c.surface, borderRadius: 10, padding: 10, marginTop: 8 },
}));

const blank = { topic: "Other", subject: "", message: "", contact: "", urgency: "normal" as "normal" | "urgent" };

const TONE = { open: "due", answered: "paid", closed: "draft" } as const;
const WORD = { open: "Waiting on us", answered: "We replied", closed: "Sorted" } as const;

export default function Help() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<typeof blank | null>(null);

  const q = useQuery({ queryKey: ["support"], queryFn: () => api<any>("/support") });
  const d = q.data;

  const send = useMutation({
    mutationFn: () => api("/support/messages", { method: "POST", json: form }),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ["support"] }); setForm(null); toast.show(res.message ?? "Sent"); },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });
  const close = useMutation({
    mutationFn: (id: string) => api(`/support/messages/${id}/close`, { method: "POST", json: {} }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["support"] }); toast.show("Marked as sorted"); },
  });

  const contact = d?.contact ?? {};
  const dial = (v: string) => String(v).replace(/[^\d+]/g, "");

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="help-screen">
      <AppBar title="Help & support" back />
      {!d ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
          <Card testID="help-contact-card">
            <H4>Talk to a person</H4>
            <Sub>{contact.hours} · {contact.reply_within}</Sub>
            <View style={{ marginTop: 8 }}>
              <Li testID="help-whatsapp" onPress={() => Linking.openURL(`https://wa.me/${dial(contact.whatsapp)}`)}>
                <Av icon="logo-whatsapp" tone="sq" />
                <View style={{ flex: 1 }}><H4>WhatsApp</H4><Sub>{contact.whatsapp}</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
              <Li testID="help-call" onPress={() => Linking.openURL(`tel:${dial(contact.phone)}`)}>
                <Av icon="call-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>Call us</H4><Sub>{contact.phone}</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
              <Li testID="help-email" last onPress={() => Linking.openURL(`mailto:${contact.email}`)}>
                <Av icon="mail-outline" tone="sq" />
                <View style={{ flex: 1 }}><H4>Email</H4><Sub>{contact.email}</Sub></View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
              </Li>
            </View>
            <Btn label="Send us a message" style={{ marginTop: 12 }} testID="help-new-message" onPress={() => setForm({ ...blank })} />
          </Card>

          <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Common questions</Lbl>
          <Card style={{ paddingVertical: 4 }}>
            {(d.faqs ?? []).map((f: any, i: number) => (
              <Pressable key={f.q} testID={`faq-${i}`} onPress={() => setOpen(open === f.q ? null : f.q)}
                style={{ paddingVertical: 11, borderBottomWidth: i === d.faqs.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
                <Row between>
                  <View style={{ flex: 1, paddingRight: 8 }}><H4>{f.q}</H4></View>
                  <Ionicons name={open === f.q ? "chevron-up" : "chevron-down"} size={16} color={colors.ink40} />
                </Row>
                {open === f.q ? <Text style={s.answer}>{f.a}</Text> : null}
              </Pressable>
            ))}
          </Card>

          <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Your messages</Lbl>
          {(d.messages ?? []).length === 0 ? (
            <Card>
              <Empty icon="chatbubbles-outline" title="No messages yet" sub="Anything that looks wrong, tell us — we reply within one working day."
                action={<Btn label="Send us a message" testID="help-empty-message" onPress={() => setForm({ ...blank })} />} />
            </Card>
          ) : d.messages.map((m: any) => (
            <Card key={m.id} style={{ marginBottom: 9 }} testID={`support-msg-${m.id}`}>
              <Row between>
                <View style={{ flex: 1, paddingRight: 8 }}><H4>{m.subject}</H4><Sub>{m.topic} · sent by {m.by}</Sub></View>
                <Badge tone={TONE[m.status as keyof typeof TONE] ?? "draft"}>{WORD[m.status as keyof typeof WORD] ?? m.status}</Badge>
              </Row>
              <Text style={[s.body, { marginTop: 8 }]}>{m.message}</Text>
              {(m.replies ?? []).map((r: any, i: number) => (
                <View key={i} style={s.reply}>
                  <Lbl>{r.by}</Lbl>
                  <Text style={s.body}>{r.message}</Text>
                </View>
              ))}
              {m.status !== "closed" ? (
                <Btn label="Mark as sorted" variant="ghost" small style={{ marginTop: 10 }} testID={`support-close-${m.id}`} onPress={() => close.mutate(m.id)} />
              ) : null}
            </Card>
          ))}

          <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Legal</Lbl>
          <Card style={{ paddingVertical: 4 }}>
            <Li testID="help-terms" onPress={() => router.push("/legal/terms")}>
              <Av icon="document-text-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>Terms & conditions</H4><Sub>What we promise, what we ask of you</Sub></View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            <Li testID="help-privacy" onPress={() => router.push("/legal/privacy")}>
              <Av icon="lock-closed-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>Privacy policy</H4><Sub>What we hold and the control you have</Sub></View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
            <Li testID="help-deletion" last onPress={() => router.push("/legal/account-deletion")}>
              <Av icon="trash-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>Account & data deletion</H4><Sub>How to close your account and erase your data</Sub></View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink40} />
            </Li>
          </Card>
        </ScrollView>
      )}

      <Sheet visible={!!form} onClose={() => setForm(null)} testID="help-sheet">
        <H4>Send us a message</H4>
        <Sub>{contact.reply_within}. We see your business name and who is writing.</Sub>
        {form ? (
          <>
            <Lbl style={{ marginTop: 12 }}>What is it about</Lbl>
            <Row style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {(d?.topics ?? []).map((t: string) => (
                <Chip key={t} label={t} on={form.topic === t} testID={`help-topic-${t}`} onPress={() => setForm({ ...form, topic: t })} />
              ))}
            </Row>
            <Field label="Short title" placeholder="Invoice PDF will not open" value={form.subject}
              onChangeText={(v) => setForm({ ...form, subject: v })} testID="help-subject" style={{ marginTop: 10 }} />
            <Field label="Tell us what happened" multiline placeholder="I tapped Share on invoice INV-104 and nothing opened."
              value={form.message} onChangeText={(v) => setForm({ ...form, message: v })} testID="help-message" style={{ marginTop: 8 }} />
            <Field label="Best number or email to reach you" placeholder="0803..." value={form.contact}
              onChangeText={(v) => setForm({ ...form, contact: v })} testID="help-contact" style={{ marginTop: 8 }} />
            <Row style={{ gap: 6, marginTop: 10 }}>
              <Chip label="Normal" on={form.urgency === "normal"} testID="help-normal" onPress={() => setForm({ ...form, urgency: "normal" })} />
              <Chip label="Shop is stuck" on={form.urgency === "urgent"} testID="help-urgent" onPress={() => setForm({ ...form, urgency: "urgent" })} />
            </Row>
            <Btn label="Send message" style={{ marginTop: 14 }} loading={send.isPending}
              disabled={form.subject.trim().length < 3 || form.message.trim().length < 10} testID="help-send" onPress={() => send.mutate()} />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
