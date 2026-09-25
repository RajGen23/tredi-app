// 00.1 Splash — green field, the tredi logo, then route by auth state.
import { useEffect } from "react";
import { Image, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { useAuth } from "@/src/auth";
import { fonts, makeStyles } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  logo: { width: 252, height: 74 },
  tagline: { position: "absolute", bottom: 40, fontFamily: fonts.medium, fontSize: 13, color: c.onDeepSoft },
}));

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
        <Image source={require("../assets/images/tredi-logo-green.png")} style={s.logo} resizeMode="contain" testID="splash-logo" />
      </Animated.View>
      <Text style={s.tagline}>Sales, stock and debtors — one book</Text>
    </View>
  );
}
