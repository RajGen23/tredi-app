// "Last synced" — every list says when its figures were last brought down, and
// tapping the stamp fetches them again.
import { Pressable, Text, View } from "react-native";
import dayjs from "dayjs";
import Ionicons from "@react-native-vector-icons/ionicons";

import { fonts, useTheme } from "@/src/theme";

function ago(at: number) {
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  const t = dayjs(at);
  return t.isSame(dayjs(), "day") ? `at ${t.format("HH:mm")}` : t.format("DD MMM HH:mm");
}

export function SyncStamp({ at, busy, onRefresh, testID = "sync-stamp" }: {
  at?: number;
  busy?: boolean;
  onRefresh?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const label = busy ? "Syncing…" : at ? `Last synced ${ago(at)}` : "Not synced yet";
  return (
    <Pressable testID={testID} onPress={onRefresh} hitSlop={8} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5 }}>
        <Ionicons name={busy ? "sync-outline" : "cloud-done-outline"} size={12} color={colors.ink40} />
        <Text style={{ fontFamily: fonts.medium, fontSize: 10.5, color: colors.ink40 }}>{label}</Text>
        {onRefresh ? <Text style={{ fontFamily: fonts.bold, fontSize: 10.5, color: colors.green700 }}>· Refresh</Text> : null}
      </View>
    </Pressable>
  );
}
