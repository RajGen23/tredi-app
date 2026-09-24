// Bottom sheet + toast, drawn as in the HTML: scrim rgba(4,33,31,.45), white
// sheet radius 20 top, grab handle; toast deep teal with green accent.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, Platform } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { fonts, makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingHorizontal: 16, maxHeight: "88%" },
  grab: { width: 34, height: 4, borderRadius: 9, backgroundColor: c.switchOff, alignSelf: "center", marginBottom: 12 },
  toast: { position: "absolute", left: 14, right: 14, backgroundColor: c.deep, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  toastText: { fontFamily: fonts.medium, fontSize: 12, color: c.onSurfaceInverse, flex: 1 },
}));

export function Sheet({ visible, onClose, children, testID, scroll = true }: { visible: boolean; onClose: () => void; children: React.ReactNode; testID?: string; scroll?: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* Nested provider: a full-screen Modal on Android has its own window, so it
          needs to measure its own insets or the action button hides behind the
          system navigation bar. */}
      <SafeAreaProvider>
        <SheetBody onClose={onClose} testID={testID} scroll={scroll}>{children}</SheetBody>
      </SafeAreaProvider>
    </Modal>
  );
}

function SheetBody({ onClose, children, testID, scroll }: { onClose: () => void; children: React.ReactNode; testID?: string; scroll: boolean }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <Pressable style={s.scrim} onPress={onClose} testID="sheet-scrim" />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} testID={testID}>
        <View style={s.grab} />
        {scroll ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView> : children}
      </View>
    </KeyboardAvoidingView>
  );
}

type ToastCtx = { show: (msg: string, accent?: string) => void };
const Ctx = createContext<ToastCtx>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ msg: string; accent?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, accent?: string) => {
    setToast({ msg, accent });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? (
        <View style={[s.toast, { bottom: 72 + insets.bottom, pointerEvents: "none" }]} testID="toast">
          <Ionicons name="checkmark-circle" size={16} color={colors.brandPrimary} />
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
