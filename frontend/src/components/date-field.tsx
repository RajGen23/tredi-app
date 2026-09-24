// A date field you can actually tap. One month grid, drawn in the app's own
// style so it looks and behaves the same on every phone and on the web preview.
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import dayjs from "dayjs";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Btn, Field, H4, Row, Sub } from "@/src/components/ui";
import { Sheet } from "@/src/components/sheet";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

const useStyles = makeStyles((c) => ({
  head: { flexDirection: "row", marginBottom: 4 },
  headCell: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 10, color: c.ink40 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  day: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  dayOn: { backgroundColor: c.brandPrimary },
  dayToday: { borderWidth: 1, borderColor: c.brandPrimary },
  dayText: { fontFamily: fonts.semibold, fontSize: 13, color: c.onSurface },
  dayTextOn: { color: c.onBrandPrimary },
  month: { fontFamily: fonts.bold, fontSize: 14, color: c.onSurface, flex: 1, textAlign: "center" },
}));

export function Calendar({ value, onPick }: { value?: string | null; onPick: (iso: string) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const selected = value ? dayjs(value) : dayjs();
  const [cursor, setCursor] = useState(selected.startOf("month"));
  const cells = useMemo(() => {
    const first = cursor.startOf("month");
    const pad = (first.day() + 6) % 7; // Monday first
    const days = cursor.daysInMonth();
    return [...Array(pad).fill(null), ...Array.from({ length: days }, (_, i) => first.add(i, "day"))];
  }, [cursor]);

  return (
    <View testID="calendar">
      <Row style={{ marginBottom: 8 }}>
        <Pressable onPress={() => setCursor(cursor.subtract(1, "month"))} hitSlop={10} testID="calendar-prev">
          <Ionicons name="chevron-back" size={18} color={colors.deep} />
        </Pressable>
        <Text style={s.month}>{cursor.format("MMMM YYYY")}</Text>
        <Pressable onPress={() => setCursor(cursor.add(1, "month"))} hitSlop={10} testID="calendar-next">
          <Ionicons name="chevron-forward" size={18} color={colors.deep} />
        </Pressable>
      </Row>
      <View style={s.head}>{WEEK.map((w, i) => <Text key={i} style={s.headCell}>{w}</Text>)}</View>
      <View style={s.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={`p${i}`} style={s.cell} />;
          const on = value ? d.isSame(dayjs(value), "day") : false;
          const today = d.isSame(dayjs(), "day");
          return (
            <View key={d.format("YYYY-MM-DD")} style={s.cell}>
              <Pressable testID={`calendar-day-${d.format("YYYY-MM-DD")}`} onPress={() => onPick(d.format("YYYY-MM-DD"))}
                style={[s.day, today && !on && s.dayToday, on && s.dayOn]}>
                <Text style={[s.dayText, on && s.dayTextOn]}>{d.date()}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function DateField({ label, value, onChange, style, testID, hint, allowClear }: {
  label?: string;
  value?: string | null;         // ISO yyyy-mm-dd
  onChange: (iso: string) => void;
  style?: any;
  testID?: string;
  hint?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  return (
    <>
      <Field
        label={label}
        mono
        value={value ? dayjs(value).format("DD MMM YYYY") : ""}
        placeholder="Select date"
        onPress={() => setOpen(true)}
        right={<Ionicons name="calendar-outline" size={16} color={colors.green700} />}
        style={style}
        testID={testID}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} testID={testID ? `${testID}-sheet` : "date-sheet"}>
        <H4>{label ?? "Pick a date"}</H4>
        {hint ? <Sub style={{ marginTop: 2, marginBottom: 6 }}>{hint}</Sub> : <View style={{ height: 8 }} />}
        <Calendar value={value} onPick={(iso) => { onChange(iso); setOpen(false); }} />
        <Row style={{ gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}><Btn small variant="ghost" label="Today" testID="date-today" onPress={() => { onChange(dayjs().format("YYYY-MM-DD")); setOpen(false); }} /></View>
          {allowClear ? <View style={{ flex: 1 }}><Btn small variant="ghost" label="Clear" testID="date-clear" onPress={() => { onChange(""); setOpen(false); }} /></View> : null}
        </Row>
      </Sheet>
    </>
  );
}
