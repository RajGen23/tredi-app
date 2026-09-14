// 00.1 Splash — green field, the tredi mark, then route by auth state.
import { useEffect } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Path, Circle } from "react-native-svg";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";

import { useAuth } from "@/src/auth";
import { fonts, makeStyles } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  word: { fontFamily: fonts.extrabold, fontSize: 40, color: c.onSurfaceInverse, letterSpacing: -1.6, marginTop: 14 },
  tagline: { position: "absolute", bottom: 40, fontFamily: fonts.medium, fontSize: 13, color: c.onDeepSoft },
}));

export function TrediMark({ size = 62, color = "#014747" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 3v13.2c0 1.4 1.7 2.1 2.7 1.1L18 8" stroke={color} strokeWidth={4.6} strokeLinecap="round" />
      <Path d="M12.6 15.4 17 19.8" stroke={color} strokeWidth={4.6} strokeLinecap="round" />
      <Circle cx="12.4" cy="8.6" r="2.5" fill="#FFFFFF" />
    </Svg>
  );
}

export default function Splash() {
  const s = useStyles();
  const router = useRouter();
  const { ready, user, business } = useAuth();
  const y = useSharedValue(-24);
  const o = useSharedValue(0);

  useEffect(() => {
    y.value = withSpring(0, { damping: 12 });
    o.value = withTiming(1, { duration: 500 });
  }, [y, o]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      if (!user) router.replace("/onboarding");
      else if (!business) router.replace("/setup-business");
      else router.replace("/(tabs)");
    }, 900);
    return () => clearTimeout(t);
  }, [ready, user, business, router]);

  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: o.value }));

  return (
    <View style={s.root} testID="splash-screen">
      <StatusBar style="light" />
      <Animated.View style={[{ alignItems: "center" }, anim]}>
        <TrediMark />
        <Text style={s.word}>tredi</Text>
      </Animated.View>
      <Text style={s.tagline}>Sales, stock and debtors — one book</Text>
    </View>
  );
}
