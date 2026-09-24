// Charts drawn exactly as in the HTML: paired in/out bars with an axis, a
// green area spark for cash flow, and the ranked progress rows on 02.3.
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Svg, { Circle, Defs, LinearGradient, Path, Polyline, Stop } from "react-native-svg";

import { Lbl, Money, Prog, Row, Sub } from "@/src/components/ui";
import { compact } from "@/src/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 5 },
  bar: { flex: 1, backgroundColor: c.mint2, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  barOn: { backgroundColor: c.brandPrimary },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  axisText: { fontFamily: fonts.mono, fontSize: 9.5, color: c.ink40 },
  legendDot: { width: 8, height: 8, borderRadius: 3 },
}));

export function Axis({ labels }: { labels: string[] }) {
  const s = useStyles();
  return (
    <View style={s.axis}>
      {labels.map((l, i) => <Text key={`${l}-${i}`} style={s.axisText}>{l}</Text>)}
    </View>
  );
}

export function InOutBars({ data, height = 56 }: { data: { label: string; in: number; out: number }[]; height?: number }) {
  const s = useStyles();
  const { colors } = useTheme();
  const max = Math.max(1, ...data.flatMap((d) => [d.in, d.out]));
  const totalIn = data.reduce((a, d) => a + d.in, 0);
  const totalOut = data.reduce((a, d) => a + d.out, 0);
  return (
    <View>
      <Row between style={{ marginBottom: 8 }}>
        <View><Lbl>In</Lbl><Money tone="pos" size={13}>{`+ ${compact(totalIn)}`}</Money></View>
        <View style={{ alignItems: "flex-end" }}><Lbl>Out</Lbl><Money tone="neg" size={13}>{`− ${compact(totalOut)}`}</Money></View>
      </Row>
      <View style={[s.bars, { height }]} testID="inout-bars">
        {data.flatMap((d, i) => [
          <View key={`i${i}`} style={[s.bar, s.barOn, { height: `${d.in > 0 ? Math.max(8, (d.in / max) * 100) : 2}%` }]} />,
          <View key={`o${i}`} style={[s.bar, { height: `${d.out > 0 ? Math.max(8, (d.out / max) * 100) : 2}%` }]} />,
        ])}
      </View>
      {/* The figure behind each pair, because a short bar on its own says nothing. */}
      <View style={s.axis}>
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} style={{ flex: 1, alignItems: "center" }}>
            <Text style={s.axisText}>{d.label}</Text>
            <Text style={[s.axisText, { color: colors.green700 }]}>{compact(d.in)}</Text>
            <Text style={[s.axisText, { color: colors.ink60 }]}>{compact(d.out)}</Text>
          </View>
        ))}
      </View>
      <Row style={{ marginTop: 8, gap: 12 }}>
        <Row style={{ gap: 5 }}><View style={[s.legendDot, { backgroundColor: colors.brandPrimary }]} /><Sub style={{ fontSize: 9.5 }}>Money in</Sub></Row>
        <Row style={{ gap: 5 }}><View style={[s.legendDot, { backgroundColor: colors.mint2 }]} /><Sub style={{ fontSize: 9.5 }}>Money out</Sub></Row>
      </Row>
    </View>
  );
}

export function SingleBars({ data, height = 44 }: { data: { label: string; value: number }[]; height?: number }) {
  const s = useStyles();
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <View>
      <View style={[s.bars, { height }]} testID="single-bars">
        {data.map((d, i) => <View key={`${d.label}-${i}`} style={[s.bar, i === data.length - 1 && s.barOn, { height: `${Math.max(6, (Math.abs(d.value) / max) * 100)}%` }]} />)}
      </View>
      <Axis labels={data.map((d) => d.label)} />
    </View>
  );
}

export function AreaSpark({ points, width = 264, height = 80 }: { points: number[]; width?: number; height?: number }) {
  const { colors } = useTheme();
  if (points.length < 2) return <View style={{ height }} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const xy = points.map((p, i) => [i * step, height - 8 - ((p - min) / span) * (height - 20)]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `M${xy[0][0]} ${xy[0][1]} ` + xy.slice(1).map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + ` L${width} ${height} L0 ${height} Z`;
  const last = xy[xy.length - 1];
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} testID="area-spark">
      <Defs>
        <LinearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.brandPrimary} stopOpacity="0.28" />
          <Stop offset="1" stopColor={colors.brandPrimary} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#cf)" />
      <Polyline points={line} fill="none" stroke={colors.brandPrimary} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r="3.4" fill="#FFFFFF" stroke={colors.deep} strokeWidth="2" />
    </Svg>
  );
}

export function RankRow({ rank, name, pct, primary, secondary, tone, onPress, testID }: {
  rank?: number; name: string; pct: number; primary: string; secondary?: string; tone?: "warn" | "bad"; onPress?: () => void; testID?: string;
}) {
  const { colors } = useTheme();
  const body = (
    <Row style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 }}>
      {rank ? <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.ink40, width: 14 }}>{rank}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 14, letterSpacing: -0.14, color: colors.onSurface }} numberOfLines={1}>{name}</Text>
        <View style={{ marginTop: 5 }}><Prog pct={pct} tone={tone} /></View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Money size={11.5}>{primary}</Money>
        {secondary ? <Sub style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.ink40 }}>{secondary}</Sub> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={14} color={colors.ink40} /> : null}
    </Row>
  );
  return onPress ? <Pressable testID={testID} onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>{body}</Pressable> : body;
}

export function Ring({ slices, size = 78 }: { slices: { value: number; color: string }[]; size?: number }) {
  const { colors } = useTheme();
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  let offset = 25;
  return (
    <Svg width={size} height={size} viewBox="0 0 42 42">
      <Circle cx="21" cy="21" r="15.9" fill="none" stroke={colors.surfaceTertiary} strokeWidth="7" />
      {slices.map((sl, i) => {
        const pct = (sl.value / total) * 100;
        const el = <Circle key={i} cx="21" cy="21" r="15.9" fill="none" stroke={sl.color} strokeWidth="7" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} />;
        offset -= pct;
        return el;
      })}
    </Svg>
  );
}

export function DeepKpi({ label, value, small, smallTone }: { label: string; value: string; small?: string; smallTone?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.deep, borderRadius: 13, padding: 10 }}>
      <Lbl style={{ color: colors.onDeepMuted }}>{label}</Lbl>
      <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 16, letterSpacing: -0.5, color: "#FFFFFF", marginTop: 5 }}>{value}</Text>
      {small ? <Text style={{ fontFamily: fonts.regular, fontSize: 10.5, color: smallTone ?? colors.brandPrimary, marginTop: 2 }}>{small}</Text> : null}
    </View>
  );
}

export function Trend({ pct }: { pct: number | null | undefined }) {
  const { colors } = useTheme();
  if (pct === null || pct === undefined) return <Sub style={{ fontSize: 10.5 }}>no earlier figure</Sub>;
  const up = pct >= 0;
  return <Text style={{ fontFamily: fonts.regular, fontSize: 10.5, color: up ? colors.green700 : colors.coral, marginTop: 2 }}>{up ? "▲" : "▼"} {Math.abs(pct)}% vs last period</Text>;
}

export { compact };
