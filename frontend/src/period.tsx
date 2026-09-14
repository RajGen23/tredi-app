// One date range, applied to every report (07.2). Held above the screens so
// choosing it in Reports also sets Summary, Cash flow and P&L.
import React, { createContext, useContext, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import dayjs, { Dayjs } from "dayjs";

import { Btn, Divider, H4, Lbl, Row, Sub } from "@/src/components/ui";
import { Sheet } from "@/src/components/sheet";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export type PeriodKey = "today" | "yesterday" | "week" | "month" | "last_month" | "year" | "all" | "custom";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

type Value = { period: PeriodKey; start: string | null; end: string | null; set: (p: PeriodKey, s?: string | null, e?: string | null) => void };
const Ctx = createContext<Value>({ period: "month", start: null, end: null, set: () => {} });

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ period: PeriodKey; start: string | null; end: string | null }>({ period: "month", start: null, end: null });
  const value = useMemo(
    () => ({ ...state, set: (period: PeriodKey, start: string | null = null, end: string | null = null) => setState({ period, start, end }) }),
    [state],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePeriod() {
  const v = useContext(Ctx);
  const query = v.period === "custom" && v.start && v.end ? `period=custom&start=${v.start}&end=${v.end}` : `period=${v.period}`;
  const label = PERIODS.find((p) => p.key === v.period)?.label ?? "This month";
  return { ...v, query, shortLabel: v.period === "custom" && v.start ? `${dayjs(v.start).format("DD MMM")} – ${dayjs(v.end).format("DD MMM YYYY")}` : label };
}

const useStyles = makeStyles((c) => ({
  chip: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  chipOn: { backgroundColor: c.deep, borderColor: c.deep },
  chipText: { fontFamily: fonts.semibold, fontSize: 12, color: c.ink60 },
  chipTextOn: { color: c.onSurfaceInverse },
  dow: { width: `${100 / 7}%`, textAlign: "center", fontFamily: fonts.mono, fontSize: 9.5, color: c.ink40, paddingVertical: 4 },
  day: { width: `${100 / 7}%`, textAlign: "center", fontFamily: fonts.mono, fontSize: 11, paddingVertical: 7, color: c.onSurface },
  dayOut: { color: c.ink40 },
  dayMid: { backgroundColor: c.brandTertiary },
  dayEdge: { backgroundColor: c.brandPrimary, color: "#FFFFFF" },
}));

export function PeriodSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { period, start, end, set } = usePeriod();
  const [draft, setDraft] = useState<PeriodKey>(period);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [a, setA] = useState<string | null>(start);
  const [b, setB] = useState<string | null>(end);

  const pick = (iso: string) => {
    if (!a || (a && b)) { setA(iso); setB(null); }
    else if (dayjs(iso).isBefore(dayjs(a))) { setB(a); setA(iso); }
    else setB(iso);
    setDraft("custom");
  };

  const first = month.startOf("month");
  const offset = (first.day() + 6) % 7; // Monday-first grid
  const cells: (Dayjs | null)[] = [...Array(offset).fill(null), ...Array(month.daysInMonth()).fill(0).map((_, i) => first.add(i, "day"))];

  const apply = () => {
    if (draft === "custom") {
      if (!a) return;
      set("custom", a, b ?? a);
    } else set(draft);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} testID="period-sheet">
      <H4>Choose a period</H4>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 11 }}>
        {PERIODS.map((p) => (
          <View key={p.key} style={{ width: "48%" }}>
            <Pressable testID={`period-${p.key}`} onPress={() => setDraft(p.key)} style={[s.chip, draft === p.key && s.chipOn]}>
              <Text style={[s.chipText, draft === p.key && s.chipTextOn]}>{p.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Divider />
      <Row between>
        <Lbl>{month.format("MMMM YYYY")}</Lbl>
        <Row style={{ gap: 18 }}>
          <Pressable testID="period-prev-month" hitSlop={10} onPress={() => setMonth(month.subtract(1, "month"))}><Text style={{ color: colors.ink60, fontSize: 16 }}>‹</Text></Pressable>
          <Pressable testID="period-next-month" hitSlop={10} onPress={() => setMonth(month.add(1, "month"))}><Text style={{ color: colors.ink60, fontSize: 16 }}>›</Text></Pressable>
        </Row>
      </Row>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <Text key={i} style={s.dow}>{d}</Text>)}
        {cells.map((d, i) => {
          if (!d) return <Text key={`x${i}`} style={[s.day, s.dayOut]} />;
          const iso = d.format("YYYY-MM-DD");
          const isEdge = iso === a || iso === b;
          const isMid = !!(a && b && d.isAfter(dayjs(a)) && d.isBefore(dayjs(b)));
          return (
            <Text key={iso} testID={`period-day-${iso}`} onPress={() => pick(iso)} style={[s.day, isMid && s.dayMid, isEdge && s.dayEdge]}>{d.date()}</Text>
          );
        })}
      </View>
      {draft === "custom" ? <Sub style={{ marginTop: 8 }}>{a ? `${dayjs(a).format("DD MMM")} → ${b ? dayjs(b).format("DD MMM") : "pick an end date"}` : "Tap a start date"}</Sub> : null}
      <Btn label="Apply to all reports" testID="period-apply" style={{ marginTop: 13 }} onPress={apply} />
    </Sheet>
  );
}

export function PeriodBar({ onPress, label, icon = "◷" }: { onPress: () => void; label: string; icon?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID="period-bar" onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
      <Row between style={{ backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 }}>
        <Row style={{ gap: 8 }}>
          <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: colors.sqAv, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.ink60, fontSize: 13 }}>{icon}</Text>
          </View>
          <View>
            <Lbl>Period</Lbl>
            <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 11.5, color: colors.onSurface }}>{label}</Text>
          </View>
        </Row>
        <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.ink60 }}>Change</Text>
        </View>
      </Row>
    </Pressable>
  );
}
