// Primitives mirroring the HTML classes: card, lbl, h4, sub, money, badge,
// chip, seg, btn, field, li, av, switch, prog, appbar.
import React from "react";
import { Pressable, Text, TextInput, TextInputProps, TextProps, View, ViewProps, ViewStyle, StyleProp, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";

import { fonts, makeStyles, radius, useTheme } from "@/src/theme";

export type IonName = React.ComponentProps<typeof Ionicons>["name"];

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: 12 },
  lbl: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: c.ink40 },
  h4: { fontFamily: fonts.bold, fontSize: 14, letterSpacing: -0.14, color: c.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: c.ink60, lineHeight: 17 },
  tag: { fontFamily: fonts.mono, fontSize: 10.5, color: c.ink40 },
  money: { fontFamily: fonts.monoSemibold, fontSize: 13, color: c.onSurface, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  badge: { fontFamily: fonts.bold, fontSize: 10, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, letterSpacing: 0.2 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0 },
  chipOn: { backgroundColor: c.deep, borderColor: c.deep },
  chipText: { fontFamily: fonts.semibold, fontSize: 12, color: c.ink60 },
  chipTextOn: { color: c.onSurfaceInverse },
  seg: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: 10, padding: 3, gap: 2 },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
  segItemOn: { backgroundColor: c.surfaceSecondary, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", elevation: 1 },
  segText: { fontFamily: fonts.bold, fontSize: 12, color: c.ink60 },
  segTextOn: { color: c.deep },
  btn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", minHeight: 48, flexDirection: "row", gap: 8 },
  btnText: { fontFamily: fonts.extrabold, fontSize: 14, color: c.onBrandPrimary, letterSpacing: -0.14 },
  btnDeep: { backgroundColor: c.deep },
  btnGhost: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  btnCoral: { backgroundColor: c.coral },
  btnSm: { paddingVertical: 11, borderRadius: 10, minHeight: 44 },
  btnTextSm: { fontSize: 13 },
  field: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, minHeight: 50, justifyContent: "center" },
  fieldFocus: { borderColor: c.brandPrimary, boxShadow: `0 0 0 3px ${c.focusRing}` },
  fieldInput: { fontFamily: fonts.semibold, fontSize: 14, color: c.onSurface, paddingVertical: 2, marginTop: 2 },
  li: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  liLast: { borderBottomWidth: 0 },
  av: { width: 34, height: 34, borderRadius: 11, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  avText: { fontFamily: fonts.bold, fontSize: 12, color: c.deep },
  switchTrack: { width: 34, height: 20, borderRadius: radius.pill, backgroundColor: c.switchOff, padding: 2 },
  switchOn: { backgroundColor: c.brandPrimary },
  switchThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: c.surfaceSecondary, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" },
  prog: { height: 5, borderRadius: 9, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  progFill: { height: "100%", borderRadius: 9, backgroundColor: c.brandPrimary },
  appbar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  appbarTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 17, letterSpacing: -0.17, color: c.onSurface },
  ic: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: c.brandTertiary },
  icTeal: { backgroundColor: c.onDeepWell },
  divider: { height: 1, backgroundColor: c.border, marginVertical: 9 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: c.radioBorder },
  radioOn: { borderWidth: 5.5, borderColor: c.brandPrimary },
  check: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: c.radioBorder, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  kpi: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 13, padding: 10 },
  kpiValue: { fontFamily: fonts.monoSemibold, fontSize: 16, letterSpacing: -0.5, color: c.onSurface, marginTop: 5 },
  kpiSmall: { fontFamily: fonts.regular, fontSize: 10.5, color: c.ink40, marginTop: 2 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 5 },
  bar: { flex: 1, backgroundColor: c.mint2, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  barOn: { backgroundColor: c.brandPrimary },
  center: { alignItems: "center", justifyContent: "center", padding: 32 },
}));

export function Card({ style, children, ...rest }: ViewProps) {
  const s = useStyles();
  return <View style={[s.card, style]} {...rest}>{children}</View>;
}

export function Lbl({ style, ...p }: TextProps) {
  const s = useStyles();
  return <Text style={[s.lbl, style]} {...p} />;
}
export function H4({ style, ...p }: TextProps) {
  const s = useStyles();
  return <Text style={[s.h4, style]} {...p} />;
}
export function Sub({ style, ...p }: TextProps) {
  const s = useStyles();
  return <Text style={[s.sub, style]} {...p} />;
}
export function Tag({ style, ...p }: TextProps) {
  const s = useStyles();
  return <Text style={[s.tag, style]} {...p} />;
}
export function Money({ style, tone, size, ...p }: TextProps & { tone?: "pos" | "neg" | "mut" | "white" | "green"; size?: number }) {
  const s = useStyles();
  const { colors } = useTheme();
  const color = tone === "pos" ? colors.green700 : tone === "neg" ? colors.coral : tone === "mut" ? colors.ink60 : tone === "white" ? colors.onSurfaceInverse : tone === "green" ? colors.brandPrimary : undefined;
  return <Text style={[s.money, color ? { color } : null, size ? { fontSize: size } : null, style]} {...p} />;
}

export type BadgeTone = "paid" | "over" | "due" | "draft" | "info";
export function Badge({ tone, children, style }: { tone: BadgeTone; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  const { colors } = useTheme();
  const map = {
    paid: { bg: colors.success, fg: colors.onSuccess },
    over: { bg: colors.error, fg: colors.onError },
    due: { bg: colors.warning, fg: colors.onWarning },
    draft: { bg: colors.draftBadge, fg: colors.ink60 },
    info: { bg: colors.info, fg: colors.onInfo },
  }[tone];
  return (
    <View style={[{ backgroundColor: map.bg, borderRadius: 5, alignSelf: "flex-start" }, style]}>
      <Text style={[s.badge, { color: map.fg }]}>{children}</Text>
    </View>
  );
}

export function Chip({ label, on, onPress, dotColor, testID, style }: { label: string; on?: boolean; onPress?: () => void; dotColor?: string; testID?: string; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: 0.8 }, style]}>
      {dotColor ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: on ? "#FFFFFF" : dotColor }} /> : null}
      <Text style={[s.chipText, on && s.chipTextOn, dotColor && !on ? { color: dotColor } : null]}>{label}</Text>
    </Pressable>
  );
}

export function Seg<T extends string>({ options, value, onChange, testID }: { options: { key: T; label: string; dot?: boolean }[]; value: T; onChange: (k: T) => void; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.seg} testID={testID}>
      {options.map((o) => (
        <Pressable key={o.key} testID={`${testID ?? "seg"}-${o.key}`} onPress={() => onChange(o.key)} style={[s.segItem, value === o.key && s.segItemOn]}>
          <Text style={[s.segText, value === o.key && s.segTextOn]}>
            {o.label}
            {o.dot ? <Text style={{ color: colors.amber }}> ●</Text> : null}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Btn({ label, onPress, variant = "green", small, loading, disabled, testID, style, icon }: {
  label: string; onPress?: () => void; variant?: "green" | "deep" | "ghost" | "coral"; small?: boolean; loading?: boolean; disabled?: boolean; testID?: string; style?: StyleProp<ViewStyle>; icon?: IonName;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const textColor = variant === "green" ? colors.onBrandPrimary : variant === "ghost" ? colors.deep : colors.onSurfaceInverse;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, variant === "deep" && s.btnDeep, variant === "ghost" && s.btnGhost, variant === "coral" && s.btnCoral, small && s.btnSm, (pressed || disabled) && { opacity: 0.7 }, style]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : (
        <>
          {icon ? <Ionicons name={icon} size={16} color={textColor} /> : null}
          <Text style={[s.btnText, small && s.btnTextSm, { color: textColor }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, mono, right, onPress, testID, style, multiline, ...rest }: TextInputProps & {
  label?: string; mono?: boolean; right?: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const [focus, setFocus] = React.useState(false);
  const inner = (
    <View style={[s.field, focus && s.fieldFocus, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          {label ? <Lbl>{label}</Lbl> : null}
          {onPress ? (
            <Text testID={testID} style={[s.fieldInput, mono && { fontFamily: fonts.monoSemibold }, !value && { color: colors.ink40, fontFamily: fonts.medium }]}>{value || placeholder}</Text>
          ) : (
            <TextInput
              testID={testID}
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor={colors.ink40}
              onFocus={() => setFocus(true)}
              onBlur={() => setFocus(false)}
              multiline={multiline}
              style={[s.fieldInput, mono && { fontFamily: fonts.monoSemibold }, multiline && { minHeight: 44 }]}
              {...rest}
            />
          )}
        </View>
        {right}
      </View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

export function Li({ children, last, onPress, testID, style }: { children: React.ReactNode; last?: boolean; onPress?: () => void; testID?: string; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  const body = <View style={[s.li, last && s.liLast, style]}>{children}</View>;
  return onPress ? <Pressable testID={testID} onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>{body}</Pressable> : <View testID={testID}>{body}</View>;
}

export function Av({ text, icon, tone = "mint", size = 34, radiusOverride }: { text?: string; icon?: IonName; tone?: "mint" | "green" | "sq" | "coral" | "blue" | "white"; size?: number; radiusOverride?: number }) {
  const s = useStyles();
  const { colors } = useTheme();
  const map = {
    mint: { bg: colors.brandTertiary, fg: colors.deep },
    green: { bg: colors.brandPrimary, fg: colors.onSurfaceInverse },
    sq: { bg: colors.sqAv, fg: colors.ink60 },
    coral: { bg: colors.error, fg: colors.coral },
    blue: { bg: colors.info, fg: colors.blue },
    white: { bg: colors.surfaceSecondary, fg: colors.ink60 },
  }[tone];
  return (
    <View style={[s.av, { width: size, height: size, borderRadius: radiusOverride ?? Math.round(size * 0.33), backgroundColor: map.bg }]}>
      {icon ? <Ionicons name={icon} size={Math.round(size * 0.46)} color={map.fg} /> : <Text style={[s.avText, { color: map.fg, fontSize: Math.round(size * 0.34) }]}>{text}</Text>}
    </View>
  );
}

export function Switch({ on, onChange, testID }: { on: boolean; onChange?: (v: boolean) => void; testID?: string }) {
  const s = useStyles();
  return (
    <Pressable testID={testID} onPress={() => onChange?.(!on)} hitSlop={8} style={[s.switchTrack, on && s.switchOn, { alignItems: on ? "flex-end" : "flex-start" }]}>
      <View style={s.switchThumb} />
    </Pressable>
  );
}

export function Prog({ pct, tone }: { pct: number; tone?: "warn" | "bad" }) {
  const s = useStyles();
  const { colors } = useTheme();
  const bg = tone === "warn" ? colors.amber : tone === "bad" ? colors.coral : colors.brandPrimary;
  return (
    <View style={s.prog}>
      <View style={[s.progFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: bg }]} />
    </View>
  );
}

export function Radio({ on }: { on: boolean }) {
  const s = useStyles();
  return <View style={[s.radio, on && s.radioOn]} />;
}
export function Check({ on }: { on: boolean }) {
  const s = useStyles();
  return <View style={[s.check, on && s.checkOn]}>{on ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}</View>;
}

export function Divider() {
  const s = useStyles();
  return <View style={s.divider} />;
}

export function Kpi({ label, value, small, tone }: { label: string; value: string; small?: string; tone?: "pos" | "neg" }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.kpi}>
      <Lbl>{label}</Lbl>
      <Text style={[s.kpiValue, tone === "neg" && { color: colors.coral }, tone === "pos" && { color: colors.green700 }]}>{value}</Text>
      {small ? <Text style={s.kpiSmall}>{small}</Text> : null}
    </View>
  );
}

export function Bars({ values, height = 40 }: { values: { v: number; on?: boolean }[]; height?: number }) {
  const s = useStyles();
  const max = Math.max(1, ...values.map((x) => x.v));
  return (
    <View style={[s.bars, { height }]}>
      {values.map((x, i) => <View key={i} style={[s.bar, x.on && s.barOn, { height: `${Math.max(6, (x.v / max) * 100)}%` }]} />)}
    </View>
  );
}

export function IconBtn({ name, onPress, teal, testID, dark, dot }: { name: IonName; onPress?: () => void; teal?: boolean; testID?: string; dark?: boolean; dot?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={6} style={({ pressed }) => [s.ic, teal && s.icTeal, dark && { backgroundColor: colors.deep }, pressed && { opacity: 0.7 }]}>
      <Ionicons name={name} size={18} color={teal || dark ? colors.onSurfaceInverse : colors.deep} />
      {dot ? <View style={{ position: "absolute", top: 4, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandPrimary }} /> : null}
    </Pressable>
  );
}

export function AppBar({ title, back, close, right, teal, onBack, mono, rightText, onRightText, rightTextTestID, testID }: {
  title: string; back?: boolean; close?: boolean; right?: React.ReactNode; teal?: boolean; onBack?: () => void; mono?: boolean; rightText?: string; onRightText?: () => void; rightTextTestID?: string; testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const fg = teal ? colors.onSurfaceInverse : colors.onSurface;
  return (
    <View style={s.appbar} testID={testID}>
      {back || close ? (
        <Pressable testID="appbar-back" onPress={onBack ?? (() => router.back())} hitSlop={10} style={{ width: 24 }}>
          <Ionicons name={close ? "close" : "arrow-back"} size={20} color={fg} />
        </Pressable>
      ) : null}
      <Text style={[s.appbarTitle, { color: fg }, mono && { fontFamily: fonts.monoSemibold, fontSize: 15 }]} numberOfLines={1}>{title}</Text>
      {right}
      {rightText ? (
        <Pressable testID={rightTextTestID ?? "appbar-right-text"} onPress={onRightText} hitSlop={8}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.green700 }}>{rightText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Row({ style, children, between, ...rest }: ViewProps & { between?: boolean }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 10 }, between && { justifyContent: "space-between", gap: 8 }, style]} {...rest}>{children}</View>;
}

export function Loading({ label }: { label?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.center} testID="loading-indicator">
      <ActivityIndicator color={colors.brandPrimary} />
      {label ? <Sub style={{ marginTop: 8 }}>{label}</Sub> : null}
    </View>
  );
}

export function Empty({ icon, title, sub, action }: { icon: IonName; title: string; sub?: string; action?: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.center} testID="empty-state">
      <Av icon={icon} size={52} tone="mint" />
      <H4 style={{ marginTop: 12, textAlign: "center" }}>{title}</H4>
      {sub ? <Sub style={{ marginTop: 4, textAlign: "center" }}>{sub}</Sub> : null}
      {action ? <View style={{ marginTop: 14, alignSelf: "stretch" }}>{action}</View> : null}
    </View>
  );
}
