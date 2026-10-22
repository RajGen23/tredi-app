// Design tokens for TradaBooks. Light theme only — colours lifted straight from the
// logo and the supplied HTML screen set (design_guidelines.json).
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F3F7F5", // canvas — app background
  onSurface: "#06241F", // ink
  surfaceSecondary: "#FFFFFF", // cards, sheets, list rows
  onSurfaceSecondary: "#06241F",
  surfaceTertiary: "#EAF0EE", // segmented control bg, progress track
  onSurfaceTertiary: "#5C7570",
  surfaceInverse: "#014747", // deep teal — headers, toasts, dark cards
  onSurfaceInverse: "#FFFFFF",
  muted: "#5C7570", // ink-60

  brand: "#00C98D",
  onBrand: "#04312A",
  brandPrimary: "#00C98D", // green — primary action, money in
  onBrandPrimary: "#04312A",
  brandSecondary: "#00B37D", // green-600
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E9FBF4", // mint — icon wells, fills
  onBrandTertiary: "#014747",

  success: "#D2F5E7", // mint-2 — paid badge bg
  onSuccess: "#019068", // green-700
  warning: "#FDF3DC", // amber bg
  onWarning: "#B7791F",
  error: "#FDECEC", // coral bg
  onError: "#D93F45",
  info: "#E9F1FD",
  onInfo: "#2C6ECB",

  border: "#E5EEEB",
  borderStrong: "#00C98D",
  divider: "#E5EEEB",

  // extra tokens from the HTML
  ink40: "#93A9A4",
  ink60: "#5C7570",
  green700: "#019068",
  deep: "#014747",
  deep700: "#023B39",
  deep900: "#012422",
  mint2: "#D2F5E7",
  coral: "#D93F45",
  coralSoft: "#FF8B8F",
  amber: "#B7791F",
  blue: "#2C6ECB",
  faint: "#F7FAF9", // subtle card fill
  sqAv: "#F2F5F4", // square avatar bg
  draftBadge: "#EEF1F0",
  switchOff: "#DDE5E3",
  radioBorder: "#CBD8D4",
  onDeepMuted: "rgba(255,255,255,0.55)",
  onDeepSoft: "rgba(255,255,255,0.75)",
  onDeepWell: "rgba(255,255,255,0.14)",
  scrim: "rgba(4,33,31,0.45)",
  pdfBoard: "#3A4442",
  statementBoard: "#E7ECEA",
  focusRing: "rgba(0,201,141,0.14)",
  shadow: "rgba(1,71,71,0.5)",
};

export type ThemeColors = typeof light;
export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme as any);
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme() as ColorScheme | null | undefined;
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// Typography — Manrope for UI, IBM Plex Mono for every figure.
export const fonts = {
  regular: "Manrope-Regular",
  medium: "Manrope-Medium",
  semibold: "Manrope-SemiBold",
  bold: "Manrope-Bold",
  extrabold: "Manrope-ExtraBold",
  mono: "IBMPlexMono-Regular",
  monoMedium: "IBMPlexMono-Medium",
  monoSemibold: "IBMPlexMono-SemiBold",
  // Poppins — printed documents and their on-screen preview only.
  doc: "Poppins-Regular",
  docMedium: "Poppins-Medium",
  docSemibold: "Poppins-SemiBold",
  docBold: "Poppins-Bold",
};

export const radius = { sm: 6, md: 11, lg: 14, xl: 20, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
