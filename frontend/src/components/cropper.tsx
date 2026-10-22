// Crop a photo before it is uploaded: drag the frame, pull a corner to resize
// (a smaller frame is a closer zoom), or lock it square. Pure JS on top of
// gesture-handler + expo-image-manipulator, so it works in Expo Go and on web.
import { useEffect, useState } from "react";
import { Image, LayoutChangeEvent, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { SharedValue, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, useTheme } from "@/src/theme";

type Req = { uri: string; width: number; height: number; png: boolean; resolve: (uri: string | null) => void };
let show: ((r: Req) => void) | null = null;

/** Opens the cropper; resolves with the cropped file's uri, or null if cancelled.
 *  `png` keeps transparency (logos). */
export async function cropImage(uri: string, width?: number, height?: number, png = false): Promise<string | null> {
  if (!show) return uri;
  if (!width || !height) {
    const size = await new Promise<{ w: number; h: number }>((ok) =>
      Image.getSize(uri, (w, h) => ok({ w, h }), () => ok({ w: 0, h: 0 })));
    width = size.w; height = size.h;
  }
  if (!width || !height) return uri;
  return new Promise((resolve) => show!({ uri, width: width!, height: height!, png, resolve }));
}

const MIN = 48;

export function CropHost() {
  const [req, setReq] = useState<Req | null>(null);
  useEffect(() => { show = setReq; return () => { show = null; }; }, []);
  if (!req) return null;
  return <Cropper req={req} done={(uri) => { req.resolve(uri); setReq(null); }} />;
}

function Cropper({ req, done }: { req: Req; done: (uri: string | null) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [square, setSquare] = useState(false);
  const [busy, setBusy] = useState(false);
  // the photo as drawn on screen (fitted inside the box)
  const scale = box.w ? Math.min(box.w / req.width, box.h / req.height) : 0;
  const dw = req.width * scale;
  const dh = req.height * scale;
  const x = useSharedValue(0), y = useSharedValue(0), w = useSharedValue(0), h = useSharedValue(0);
  const sx = useSharedValue(0), sy = useSharedValue(0), sw = useSharedValue(0), sh = useSharedValue(0);
  const sq = useSharedValue(false);

  const reset = (lock: boolean) => {
    const side = Math.min(dw, dh) * 0.9;
    const nw = lock ? side : dw * 0.9, nh = lock ? side : dh * 0.9;
    w.value = nw; h.value = nh; x.value = (dw - nw) / 2; y.value = (dh - nh) / 2;
  };
  useEffect(() => { if (dw) reset(square); sq.value = square; }, [dw, dh, square]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = () => { "worklet"; sx.value = x.value; sy.value = y.value; sw.value = w.value; sh.value = h.value; };
  const move = Gesture.Pan().onStart(begin).onUpdate((e) => {
    x.value = Math.min(Math.max(0, sx.value + e.translationX), dw - w.value);
    y.value = Math.min(Math.max(0, sy.value + e.translationY), dh - h.value);
  });
  // corner: -1/1 for which side the corner sits on, on each axis
  const corner = (cx: -1 | 1, cy: -1 | 1) => Gesture.Pan().onStart(begin).onUpdate((e) => {
    let dx = e.translationX * cx, dy = e.translationY * cy;
    if (sq.value) { const d = Math.abs(dx) > Math.abs(dy) ? dx : dy; dx = d; dy = d; }
    const maxW = cx < 0 ? sx.value + sw.value : dw - sx.value;
    const maxH = cy < 0 ? sy.value + sh.value : dh - sy.value;
    let nw = Math.min(Math.max(MIN, sw.value + dx), maxW);
    let nh = Math.min(Math.max(MIN, sh.value + dy), maxH);
    if (sq.value) { const m = Math.min(nw, nh); nw = m; nh = m; }
    w.value = nw; h.value = nh;
    x.value = cx < 0 ? sx.value + sw.value - nw : sx.value;
    y.value = cy < 0 ? sy.value + sh.value - nh : sy.value;
  });

  const frame = useAnimatedStyle(() => ({ left: x.value, top: y.value, width: w.value, height: h.value }));
  const windowImage = useWindowImage(x, y, dw, dh);

  const confirm = async () => {
    setBusy(true);
    try {
      const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");
      const k = 1 / scale;
      const originX = Math.max(0, Math.round(x.value * k)), originY = Math.max(0, Math.round(y.value * k));
      const rect = {
        originX, originY,
        width: Math.min(req.width - originX, Math.round(w.value * k)),
        height: Math.min(req.height - originY, Math.round(h.value * k)),
      };
      const ref = await ImageManipulator.manipulate(req.uri).crop(rect).renderAsync();
      const out = await ref.saveAsync(req.png ? { format: SaveFormat.PNG } : { compress: 0.9, format: SaveFormat.JPEG });
      done(out.uri);
    } catch {
      done(req.uri); // never lose the photo over a crop failure
    }
  };

  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  return (
    <Modal visible animationType="fade" onRequestClose={() => done(null)} statusBarTranslucent>
      <GestureHandlerRootView style={[st.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]} testID="cropper">
        <Text style={st.title}>Crop photo</Text>
        <Text style={st.hint}>Drag the frame · pull a corner to zoom in</Text>
        <View style={st.stage} onLayout={onLayout}>
          {dw ? (
            <View style={{ width: dw, height: dh }}>
              <Image source={{ uri: req.uri }} style={{ width: dw, height: dh }} />
              <View style={[StyleSheet.absoluteFill, st.dim]} pointerEvents="none" />
              <GestureDetector gesture={move}>
                <Animated.View style={[st.frame, { borderColor: colors.brand }, frame]} testID="cropper-frame">
                  <View style={st.window} pointerEvents="none">
                    <Animated.Image source={{ uri: req.uri }} style={windowImage} />
                  </View>
                  {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([cx, cy]) => (
                    <GestureDetector key={`${cx}${cy}`} gesture={corner(cx, cy)}>
                      <View style={[st.handle, { backgroundColor: colors.brand }, cx < 0 ? { left: -14 } : { right: -14 }, cy < 0 ? { top: -14 } : { bottom: -14 }]} hitSlop={10} />
                    </GestureDetector>
                  ))}
                </Animated.View>
              </GestureDetector>
            </View>
          ) : null}
        </View>
        <View style={st.row}>
          <Pressable style={[st.chip, !square && { backgroundColor: colors.brand }]} onPress={() => setSquare(false)} testID="cropper-free">
            <Text style={[st.chipText, !square && { color: colors.onBrand }]}>Free</Text>
          </Pressable>
          <Pressable style={[st.chip, square && { backgroundColor: colors.brand }]} onPress={() => setSquare(true)} testID="cropper-square">
            <Text style={[st.chipText, square && { color: colors.onBrand }]}>Square</Text>
          </Pressable>
          <Pressable style={st.chip} onPress={() => reset(square)} testID="cropper-reset">
            <Text style={st.chipText}>Reset</Text>
          </Pressable>
        </View>
        <View style={st.row}>
          <Pressable style={[st.btn, st.ghost]} onPress={() => done(null)} testID="cropper-cancel">
            <Text style={st.btnText}>Cancel</Text>
          </Pressable>
          <Pressable style={[st.btn, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={confirm} testID="cropper-done">
            <Text style={[st.btnText, { color: colors.onBrand }]}>{busy ? "Cropping…" : "Use photo"}</Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** The bright, un-dimmed photo inside the frame: the same picture, shifted so it lines up. */
function useWindowImage(x: SharedValue<number>, y: SharedValue<number>, dw: number, dh: number) {
  return useAnimatedStyle(() => ({ position: "absolute", width: dw, height: dh, left: -x.value - 2, top: -y.value - 2 }));
}

// The cropper is always dark, like every phone's photo editor, in both themes.
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0F0E", paddingHorizontal: 16 },
  title: { color: "#FFFFFF", fontFamily: fonts.semibold, fontSize: 17, textAlign: "center" },
  hint: { color: "#9AA5A2", fontFamily: fonts.medium, fontSize: 12, textAlign: "center", marginTop: 4 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", marginVertical: 16 },
  dim: { backgroundColor: "rgba(0,0,0,0.55)" },
  frame: { position: "absolute", borderWidth: 2 },
  window: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, overflow: "hidden" },
  handle: { position: "absolute", width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: "#FFFFFF" },
  row: { flexDirection: "row", gap: 10, justifyContent: "center", marginTop: 10 },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: "center", backgroundColor: "#1F2826" },
  chipText: { color: "#FFFFFF", fontFamily: fonts.semibold, fontSize: 13 },
  btn: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  ghost: { backgroundColor: "#1F2826" },
  btnText: { color: "#FFFFFF", fontFamily: fonts.semibold, fontSize: 15 },
});
