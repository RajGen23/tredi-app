// Desktop UI kit for the Super Admin panel. Same tokens as the phone app
// (src/theme.ts) but laid out for a wide screen: a fixed rail, dense tables,
// figures in mono. Nothing here imports the mobile screens' components so the
// two clients can diverge without breaking each other.
import React, { useState } from "react";
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, TextProps, useWindowDimensions, View, ViewStyle,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";

import { adminApi, adminSignOut, adminToken } from "@/src/admin/api";
import { useBottomPad } from "@/src/safe";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";

export type IonName = React.ComponentProps<typeof Ionicons>["name"];

export const NAV: { group: string; items: { label: string; route: string; icon: IonName; tag?: string }[] }[] = [
  { group: "Platform", items: [
    { label: "Overview", route: "/admin/overview", icon: "grid-outline", tag: "M1" },
    { label: "Analytics", route: "/admin/analytics", icon: "trending-up-outline", tag: "M2" },
  ] },
  { group: "Tenants", items: [
    { label: "Businesses", route: "/admin/businesses", icon: "business-outline", tag: "M1" },
    { label: "Subscriptions", route: "/admin/subscriptions", icon: "card-outline", tag: "M1" },
    { label: "Plans & pricing", route: "/admin/subscriptions/plans", icon: "pricetags-outline", tag: "M2" },
  ] },
  { group: "People", items: [
    { label: "Users", route: "/admin/users", icon: "people-outline", tag: "M1" },
    { label: "Roles & permissions", route: "/admin/roles", icon: "key-outline", tag: "M2" },
  ] },
  { group: "Trust", items: [
    { label: "Security", route: "/admin/security", icon: "shield-checkmark-outline", tag: "M2" },
    { label: "Audit log", route: "/admin/security/audit", icon: "receipt-outline", tag: "M1" },
    { label: "Support access", route: "/admin/support", icon: "help-buoy-outline", tag: "M2" },
  ] },
  { group: "Operations", items: [
    { label: "Sync monitor", route: "/admin/sync", icon: "sync-outline", tag: "M1" },
    { label: "System health", route: "/admin/system", icon: "pulse-outline", tag: "M2" },
    { label: "Backup & snapshots", route: "/admin/backup", icon: "cloud-download-outline", tag: "M1" },
    { label: "Migration console", route: "/admin/migration", icon: "swap-horizontal-outline", tag: "M1" },
    { label: "Configuration", route: "/admin/configuration", icon: "options-outline", tag: "M1" },
  ] },
];

export function useWide() {
  const { width } = useWindowDimensions();
  return { width, wide: width >= 1000, mid: width >= 720 };
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, flexDirection: "row", backgroundColor: c.surface },
  rail: { width: 236, backgroundColor: c.deep900, paddingVertical: 18, paddingHorizontal: 12 },
  brand: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 6, marginBottom: 18 },
  brandMark: { width: 26, height: 26, borderRadius: 8, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  brandText: { fontFamily: fonts.extrabold, fontSize: 15, color: c.onSurfaceInverse, letterSpacing: -0.3 },
  brandSub: { fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 1.4, color: c.brandPrimary, textTransform: "uppercase" },
  group: { fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 1.3, color: "rgba(255,255,255,0.34)", textTransform: "uppercase", paddingHorizontal: 8, marginTop: 14, marginBottom: 6 },
  nav: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 8, height: 34, borderRadius: 9 },
  navOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  navText: { fontFamily: fonts.semibold, fontSize: 12, color: "rgba(255,255,255,0.72)", flex: 1 },
  navTextOn: { color: c.onSurfaceInverse },
  tagM1: { fontFamily: fonts.bold, fontSize: 8, color: c.brandPrimary },
  tagM2: { fontFamily: fonts.bold, fontSize: 8, color: c.amber },
  body: { flex: 1 },
  topbar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surfaceSecondary },
  h1: { fontFamily: fonts.extrabold, fontSize: 19, color: c.onSurface, letterSpacing: -0.4 },
  h2: { fontFamily: fonts.bold, fontSize: 14, color: c.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 11.5, color: c.ink60 },
  lbl: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: c.ink40 },
  fig: { fontFamily: fonts.monoSemibold, fontSize: 12.5, color: c.onSurface, fontVariant: ["tabular-nums"] },
  panel: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg },
  metric: { flexGrow: 1, flexBasis: 170, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: 13 },
  metricVal: { fontFamily: fonts.monoSemibold, fontSize: 20, color: c.onSurface, letterSpacing: -0.6, marginTop: 5 },
  th: { fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: c.ink40 },
  trow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.border },
  thead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: c.faint, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  tab: { paddingHorizontal: 12, height: 30, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, flexDirection: "row", alignItems: "center", gap: 6 },
  tabOn: { backgroundColor: c.deep, borderColor: c.deep },
  tabText: { fontFamily: fonts.semibold, fontSize: 11.5, color: c.ink60 },
  tabTextOn: { color: c.onSurfaceInverse },
  btn: { height: 34, paddingHorizontal: 14, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  btnPrimary: { backgroundColor: c.brandPrimary },
  btnGhost: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  btnDeep: { backgroundColor: c.deep },
  btnDanger: { backgroundColor: c.error, borderWidth: 1, borderColor: c.coral },
  btnText: { fontFamily: fonts.bold, fontSize: 12 },
  input: { height: 36, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 11, fontFamily: fonts.medium, fontSize: 12.5, color: c.onSurface, backgroundColor: c.surfaceSecondary },
  avatar: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: c.brandTertiary },
  avatarText: { fontFamily: fonts.bold, fontSize: 10.5, color: c.deep },
  note: { borderRadius: radius.md, padding: 12, borderWidth: 1 },
  modalScrim: { flex: 1, backgroundColor: c.scrim, alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 440, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: 18, gap: 10 },
}));

// ---------------------------------------------------------------- primitives
export function H1({ style, ...p }: TextProps) { const s = useStyles(); return <Text style={[s.h1, style]} {...p} />; }
export function H2({ style, ...p }: TextProps) { const s = useStyles(); return <Text style={[s.h2, style]} {...p} />; }
export function Sub({ style, ...p }: TextProps) { const s = useStyles(); return <Text style={[s.sub, style]} {...p} />; }
export function Lbl({ style, ...p }: TextProps) { const s = useStyles(); return <Text style={[s.lbl, style]} {...p} />; }
export function Fig({ style, tone, size, ...p }: TextProps & { tone?: "pos" | "neg" | "mut"; size?: number }) {
  const s = useStyles();
  const { colors } = useTheme();
  const color = tone === "pos" ? colors.green700 : tone === "neg" ? colors.coral : tone === "mut" ? colors.ink60 : undefined;
  return <Text style={[s.fig, color ? { color } : null, size ? { fontSize: size } : null, style]} {...p} />;
}

export function Row({ children, style, gap = 10, wrapped }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; gap?: number; wrapped?: boolean }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, wrapped && { flexWrap: "wrap" }, style as ViewStyle]}>{children}</View>;
}

export function Avatar({ text, tone }: { text: string; tone?: "deep" | "mint" }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.avatar, tone === "deep" && { backgroundColor: colors.deep }]}>
      <Text style={[s.avatarText, tone === "deep" && { color: colors.onSurfaceInverse }]}>{text}</Text>
    </View>
  );
}

export type Tone = "ok" | "warn" | "bad" | "mut" | "info";
export function Pill({ label, tone = "mut" }: { label: string; tone?: Tone }) {
  const { colors } = useTheme();
  const map: Record<Tone, { bg: string; fg: string }> = {
    ok: { bg: colors.success, fg: colors.onSuccess },
    warn: { bg: colors.warning, fg: colors.onWarning },
    bad: { bg: colors.error, fg: colors.onError },
    mut: { bg: colors.draftBadge, fg: colors.ink60 },
    info: { bg: colors.info, fg: colors.onInfo },
  };
  return (
    <View style={{ backgroundColor: map[tone].bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 9.5, color: map[tone].fg }}>{label}</Text>
    </View>
  );
}

export function Btn({ label, onPress, tone = "ghost", icon, disabled, busy, testID, style }: {
  label: string; onPress?: () => void; tone?: "primary" | "ghost" | "deep" | "danger"; icon?: IonName;
  disabled?: boolean; busy?: boolean; testID?: string; style?: ViewStyle;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const fg = tone === "primary" ? colors.onBrandPrimary : tone === "deep" ? colors.onSurfaceInverse : tone === "danger" ? colors.coral : colors.onSurface;
  return (
    <Pressable testID={testID} disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [s.btn, tone === "primary" && s.btnPrimary, tone === "ghost" && s.btnGhost, tone === "deep" && s.btnDeep,
        tone === "danger" && s.btnDanger, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}>
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={14} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Input({ value, onChangeText, placeholder, width, icon, testID, keyboardType, multiline, secure, onToggleSecure, showSecure }: {
  value: string; onChangeText: (v: string) => void; placeholder?: string; width?: number | string; icon?: IonName;
  testID?: string; keyboardType?: "default" | "numeric"; multiline?: boolean; secure?: boolean;
  onToggleSecure?: () => void; showSecure?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ width: width as any, flexGrow: width ? 0 : 1, position: "relative" }}>
      {icon ? <View style={{ position: "absolute", left: 10, top: 10, zIndex: 1 }}><Ionicons name={icon} size={14} color={colors.ink40} /></View> : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink40}
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secure && !showSecure}
        autoCapitalize={secure ? "none" : undefined}
        autoCorrect={secure ? false : undefined}
        style={[s.input, icon ? { paddingLeft: 30 } : null, onToggleSecure ? { paddingRight: 38 } : null, multiline ? { height: 76, paddingTop: 9, textAlignVertical: "top" } : null]}
      />
      {onToggleSecure ? (
        <Pressable testID={`${testID}-toggle`} onPress={onToggleSecure} hitSlop={8} style={{ position: "absolute", right: 10, top: 9 }}>
          <Ionicons name={showSecure ? "eye-off-outline" : "eye-outline"} size={17} color={colors.ink60} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Panel({ title, sub, right, children, style, pad = 14, testID }: {
  title?: string; sub?: string; right?: React.ReactNode; children?: React.ReactNode; style?: ViewStyle; pad?: number; testID?: string;
}) {
  const s = useStyles();
  return (
    <View style={[s.panel, style]} testID={testID}>
      {title ? (
        <View style={{ paddingHorizontal: pad, paddingTop: pad, paddingBottom: 2, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <H2>{title}</H2>
            {sub ? <Sub style={{ marginTop: 2 }}>{sub}</Sub> : null}
          </View>
          {right}
        </View>
      ) : null}
      <View style={{ padding: pad }}>{children}</View>
    </View>
  );
}

export function Metrics({ items }: { items: { label: string; value: string; delta?: string; tone?: string }[] }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {items.map((m) => (
        <View key={m.label} style={s.metric} testID={`metric-${m.label}`}>
          <Lbl numberOfLines={1}>{m.label}</Lbl>
          <Text style={s.metricVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{m.value}</Text>
          {m.delta ? <Text style={{ fontFamily: fonts.medium, fontSize: 10.5, marginTop: 3, color: m.tone === "pos" ? colors.green700 : m.tone === "neg" ? colors.coral : colors.ink60 }}>{m.delta}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export type Col<T> = { key: string; label: string; w?: number; flex?: number; align?: "left" | "right"; render: (row: T) => React.ReactNode };

export function Table<T extends { id?: string }>({ cols, rows, empty = "Nothing here yet", minWidth = 860, testID, onRowPress }: {
  cols: Col<T>[]; rows: T[]; empty?: string; minWidth?: number; testID?: string; onRowPress?: (row: T) => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const cell = (c: Col<T>): ViewStyle => ({ width: c.w, flex: c.w ? undefined : (c.flex ?? 1), alignItems: c.align === "right" ? "flex-end" : "flex-start" });
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth, flexGrow: 1 }}>
      <View style={{ flex: 1, minWidth }} testID={testID}>
        <View style={s.thead}>
          {cols.map((c) => <View key={c.key} style={cell(c)}><Text style={s.th} numberOfLines={1}>{c.label}</Text></View>)}
        </View>
        {rows.length === 0 ? (
          <View style={[s.trow, { justifyContent: "center", paddingVertical: 26 }]}><Sub>{empty}</Sub></View>
        ) : rows.map((r, i) => (
          <Pressable key={r.id ?? i} disabled={!onRowPress} onPress={() => onRowPress?.(r)}
            testID={`row-${r.id ?? i}`}
            style={({ hovered, pressed }: any) => [s.trow, (hovered || pressed) && onRowPress ? { backgroundColor: colors.faint } : null]}>
            {cols.map((c) => <View key={c.key} style={cell(c)}>{c.render(r)}</View>)}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

export function Tabs({ items, value, onChange }: { items: { key: string; label: string; count?: number }[]; value: string; onChange: (k: string) => void }) {
  const s = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row", gap: 7 }}>
        {items.map((t) => {
          const on = t.key === value;
          return (
            <Pressable key={t.key} testID={`tab-${t.key}`} onPress={() => onChange(t.key)} style={[s.tab, on && s.tabOn]}>
              <Text style={[s.tabText, on && s.tabTextOn]}>{t.label}</Text>
              {t.count !== undefined ? <Text style={[s.tabText, { fontFamily: fonts.monoSemibold, fontSize: 10.5 }, on && s.tabTextOn]}>{t.count.toLocaleString()}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

export function Note({ tone = "info", title, children, action }: { tone?: "info" | "warn" | "bad"; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  const map = { info: { bg: colors.info, bd: colors.blue, fg: colors.onInfo }, warn: { bg: colors.warning, bd: colors.amber, fg: colors.onWarning }, bad: { bg: colors.error, bd: colors.coral, fg: colors.onError } }[tone];
  return (
    <View style={[s.note, { backgroundColor: map.bg, borderColor: map.bd }]}>
      {title ? <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: map.fg }}>{title}</Text> : null}
      {typeof children === "string" ? <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, color: colors.onSurface, marginTop: 3, lineHeight: 17 }}>{children}</Text> : children}
      {action ? <View style={{ marginTop: 9, alignSelf: "flex-start" }}>{action}</View> : null}
    </View>
  );
}

export function Bars({ data, height = 120, keys }: { data: any[]; height?: number; keys: { key: string; color: string; label: string }[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...data.flatMap((d) => keys.map((k) => d[k.key] ?? 0)));
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, height }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, flexDirection: "row", gap: 3, alignItems: "flex-end", height: "100%" }}>
            {keys.map((k) => (
              <View key={k.key} style={{ flex: 1, backgroundColor: k.color, borderTopLeftRadius: 4, borderTopRightRadius: 4, height: `${Math.max(3, ((d[k.key] ?? 0) / max) * 100)}%` }} />
            ))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 7 }}>
        {data.map((d, i) => <Text key={i} style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.ink40 }}>{d.label}</Text>)}
      </View>
      <Row style={{ marginTop: 8 }} gap={14}>
        {keys.map((k) => (
          <Row key={k.key} gap={5}>
            <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: k.color }} />
            <Sub style={{ fontSize: 10 }}>{k.label}</Sub>
          </Row>
        ))}
      </Row>
    </View>
  );
}

export function MiniTrend({ values }: { values: number[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 20 }}>
      {values.map((v, i) => <View key={i} style={{ width: 5, borderRadius: 2, backgroundColor: i === values.length - 1 ? colors.brandPrimary : colors.mint2, height: `${Math.max(10, (v / max) * 100)}%` }} />)}
    </View>
  );
}

export function AdminModal({ visible, onClose, title, sub, children, footer, testID }: {
  visible: boolean; onClose: () => void; title: string; sub?: string; children?: React.ReactNode; footer?: React.ReactNode; testID?: string;
}) {
  const s = useStyles();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalScrim} onPress={onClose}>
        <Pressable style={s.modalCard} testID={testID} onPress={(e) => e.stopPropagation?.()}>
          <H2>{title}</H2>
          {sub ? <Sub>{sub}</Sub> : null}
          {children}
          <Row style={{ justifyContent: "flex-end", marginTop: 4 }}>{footer}</Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 40, alignItems: "center", gap: 8 }} testID="admin-loading">
      <ActivityIndicator color={colors.brandPrimary} />
      {label ? <Sub>{label}</Sub> : null}
    </View>
  );
}

// ---------------------------------------------------------------- shell
export function AdminShell({ title, sub, actions, children, search, onSearch, testID }: {
  title: string; sub?: string; actions?: React.ReactNode; children: React.ReactNode; search?: string;
  onSearch?: (v: string) => void; testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const { wide } = useWide();
  const pad = useBottomPad();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const guard = useQuery({
    queryKey: ["admin-me"],
    queryFn: async () => {
      if (!(await adminToken())) throw new Error("no-session");
      return adminApi("/auth/me");
    },
    retry: false,
  });

  React.useEffect(() => {
    if (guard.isError) router.replace("/admin/login");
  }, [guard.isError, router]);

  const rail = (
    <View style={s.rail}>
      <Pressable style={s.brand} onPress={() => router.push("/admin/overview")}>
        <View style={s.brandMark}><Image source={require("../../assets/images/tradabooks-mark.png")} style={{ width: 20, height: 20 }} resizeMode="contain" /></View>
        <View>
          <Text style={s.brandText}>TradaBooks</Text>
          <Text style={s.brandSub}>Super Admin</Text>
        </View>
      </Pressable>
      <ScrollView showsVerticalScrollIndicator={false}>
        {NAV.map((g) => (
          <View key={g.group}>
            <Text style={s.group}>{g.group}</Text>
            {g.items.map((it) => {
              const on = pathname === it.route || (it.route !== "/admin/overview" && pathname.startsWith(it.route));
              return (
                <Pressable key={it.route} testID={`nav-${it.label}`} onPress={() => { setOpen(false); router.push(it.route as any); }}
                  style={({ hovered }: any) => [s.nav, (on || hovered) && s.navOn]}>
                  <Ionicons name={it.icon} size={15} color={on ? colors.brandPrimary : "rgba(255,255,255,0.6)"} />
                  <Text style={[s.navText, on && s.navTextOn]} numberOfLines={1}>{it.label}</Text>
                  <Text style={it.tag === "M1" ? s.tagM1 : s.tagM2}>{it.tag}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <Pressable testID="admin-signout" onPress={async () => { await adminSignOut(); router.replace("/admin/login"); }} style={[s.nav, { marginTop: 18 }]}>
          <Ionicons name="log-out-outline" size={15} color="rgba(255,255,255,0.6)" />
          <Text style={s.navText}>Sign out</Text>
        </Pressable>
        <Text style={{ fontFamily: fonts.regular, fontSize: 9.5, color: "rgba(255,255,255,0.4)", paddingHorizontal: 8, marginTop: 10, lineHeight: 14 }}>
          Cross-tenant reads are attributed to {(guard.data as any)?.name ?? "you"} and visible to the business owner.
        </Text>
      </ScrollView>
    </View>
  );

  return (
    <View style={s.root} testID={testID}>
      {wide ? rail : null}
      {!wide && open ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.scrim }}>
            {rail}
            <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
          </View>
        </Modal>
      ) : null}
      <View style={s.body}>
        <View style={s.topbar}>
          {!wide ? (
            <Pressable testID="admin-menu" onPress={() => setOpen(true)} hitSlop={8}><Ionicons name="menu" size={20} color={colors.onSurface} /></Pressable>
          ) : null}
          <View style={{ flexShrink: 1 }}>
            <H1 numberOfLines={1}>{title}</H1>
            {sub ? <Sub numberOfLines={1}>{sub}</Sub> : null}
          </View>
          <View style={{ flex: 1 }} />
          {onSearch && wide ? <Input value={search ?? ""} onChangeText={onSearch} placeholder="Search businesses, users, invoices…" icon="search-outline" width={300} testID="admin-search" /> : null}
          {actions}
          <Pill label="PRODUCTION" tone="ok" />
        </View>
        <ScrollView contentContainerStyle={{ padding: wide ? 20 : 14, paddingBottom: (wide ? 20 : 14) + pad, gap: 12, maxWidth: 1360, width: "100%" }} testID="admin-scroll">
          {onSearch && !wide ? <Input value={search ?? ""} onChangeText={onSearch} placeholder="Search…" icon="search-outline" testID="admin-search-narrow" /> : null}
          {guard.isLoading ? <Loading label="Checking your admin session" /> : children}
        </ScrollView>
      </View>
    </View>
  );
}

export const SUB_TONE: Record<string, Tone> = { active: "ok", trialing: "warn", expired: "bad" };
export const SUB_LABEL: Record<string, string> = { active: "Active", trialing: "On trial", expired: "Lapsed" };
