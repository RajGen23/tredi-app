// Bottom sheet + toast, drawn as in the HTML: scrim rgba(4,33,31,.45), white
// sheet radius 20 top, grab handle; toast deep teal with green accent.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardProvider, KeyboardStickyView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: "flex-end" },
  sticky: { maxHeight: "88%" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingHorizontal: 16, flexShrink: 1 },
  grab: { width: 34, height: 4, borderRadius: 9, backgroundColor: c.switchOff, alignSelf: "center", marginBottom: 12 },
  toast: { position: "absolute", left: 14, right: 14, backgroundColor: c.deep, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  toastText: { fontFamily: fonts.medium, fontSize: 12, color: c.onSurfaceInverse, flex: 1 },
}));

export function Sheet({ visible, onClose, children, testID, scroll = true }: { visible: boolean; onClose: () => void; children: React.ReactNode; testID?: string; scroll?: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* Nested providers: a Modal on Android is its own window, so it has to
          measure its own insets and listen for the keyboard itself — the root
          providers never see either. */}
      <SafeAreaProvider>
        <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
          <SheetBody onClose={onClose} testID={testID} scroll={scroll}>{children}</SheetBody>
        </KeyboardProvider>
      </SafeAreaProvider>
    </Modal>
  );
}

function SheetBody({ onClose, children, testID, scroll }: { onClose: () => void; children: React.ReactNode; testID?: string; scroll: boolean }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  // The scrim owns the whole window and never resizes, so the screen underneath
  // can never peek out below the sheet. Only the sheet itself rides the
  // keyboard — a shrinking container was leaving the page's own buttons visible.
  return (
    <View style={s.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="sheet-scrim" />
      <KeyboardStickyView style={s.sticky}>
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom + 8, 24) }]} testID={testID}>
          <View style={s.grab} />
          {scroll ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView> : children}
        </View>
      </KeyboardStickyView>
    </View>
  );
}

type ToastCtx = { show: (msg: string, accent?: string, tone?: "bad") => void };
const Ctx = createContext<ToastCtx>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ msg: string; accent?: string; tone?: "bad" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, accent?: string, tone?: "bad") => {
    // a problem never wears the green tick, whoever forgot to say so
    if (!tone && /^(You're offline|The connection is too slow)/.test(msg)) tone = "bad";
    setToast({ msg, accent, tone });
    if (timer.current) clearTimeout(timer.current);
    // problems stay up long enough to read a full sentence
    timer.current = setTimeout(() => setToast(null), tone === "bad" ? 5000 : 2800);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? (
        <View style={[s.toast, { bottom: 72 + insets.bottom, pointerEvents: "none" }]} testID="toast">
          <Ionicons name={toast.tone === "bad" ? "alert-circle" : "checkmark-circle"} size={16} color={toast.tone === "bad" ? colors.coralSoft : colors.brandPrimary} />
          <Text style={s.toastText}>
            {toast.accent ? <Text style={{ color: colors.brandPrimary, fontFamily: fonts.bold }}>{toast.accent} </Text> : null}
            {toast.msg}
          </Text>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
