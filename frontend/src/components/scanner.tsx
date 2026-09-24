// Bar code scanner. The camera is only asked for after the user taps Scan, the
// ask happens at most twice, and a blocked camera always offers Settings —
// never a dead end, the screen just closes and search still works.
import { useRef, useState } from "react";
import { Linking, Modal, Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Btn, H4, Seg, Sub } from "@/src/components/ui";
import { useBottomPad } from "@/src/safe";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export type ScanMode = "add" | "price";

const TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "codabar", "qr"] as const;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "#000" },
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 10 },
  barTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 17, color: "#FFFFFF" },
  frame: { flex: 1, alignItems: "center", justifyContent: "center" },
  window: { width: "78%", aspectRatio: 1.45, borderWidth: 2, borderColor: c.brandPrimary, borderRadius: 18 },
  hint: { marginTop: 16, fontFamily: fonts.medium, fontSize: 13, color: "#FFFFFFCC", textAlign: "center", paddingHorizontal: 30 },
  modes: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 14, paddingTop: 12 },
  ask: { flex: 1, backgroundColor: c.surface, padding: 20, justifyContent: "center" },
  askIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 14 },
}));

export function Scanner({ visible, onClose, onScan, title = "Scan bar code", hint = "Hold the code inside the frame", mode, onMode, addLabel = "Add to sale" }: {
  visible: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
  hint?: string;
  /** When a mode and handler are given, the camera carries an Add / Price check switch. */
  mode?: ScanMode;
  onMode?: (m: ScanMode) => void;
  addLabel?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const [permission, request] = useCameraPermissions();
  const [asking, setAsking] = useState(false);
  const last = useRef(0);

  // One scan per second — a barcode fires continuously while it is in frame.
  const handle = ({ data }: { data: string }) => {
    const code = (data ?? "").trim();
    if (!code || Date.now() - last.current < 1000) return;
    last.current = Date.now();
    onScan(code);
  };

  const allow = async () => {
    if (permission && !permission.canAskAgain) return Linking.openSettings();
    setAsking(true);
    await request();
    setAsking(false);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} testID="scanner-modal">
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.bar}>
          <Text style={s.barTitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} testID="scanner-close"><Ionicons name="close" size={24} color="#FFFFFF" /></Pressable>
        </View>
        {!permission || !permission.granted ? (
          <View style={s.ask} testID="scanner-permission">
            <View style={s.askIcon}><Ionicons name="barcode-outline" size={26} color={colors.deep} /></View>
            <H4 style={{ fontSize: 19 }}>Scan instead of typing</H4>
            <Sub style={{ marginTop: 6 }}>
              {permission && !permission.canAskAgain
                ? "The camera is blocked for TREDI. Allow it in Settings and the scanner works again — you can still search by name in the meantime."
                : "TREDI uses the camera to read the bar code on a product so it lands in the sale straight away. Nothing is recorded or uploaded."}
            </Sub>
            <Btn label={permission && !permission.canAskAgain ? "Open Settings" : "Allow camera"} loading={asking} onPress={allow} style={{ marginTop: 18 }} testID="scanner-allow" />
            <Btn label="Search by name instead" variant="ghost" onPress={onClose} style={{ marginTop: 8 }} testID="scanner-skip" />
          </View>
        ) : (
          <>
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: [...TYPES] }} onBarcodeScanned={handle} testID="scanner-camera">
              <View style={s.frame}>
                <View style={s.window} />
                <Text style={s.hint}>{mode === "price" ? "Point at the code — the price and stock come up, nothing is added" : hint}</Text>
              </View>
            </CameraView>
            {onMode && mode ? (
              <View style={[s.modes, { paddingBottom: pad }]} testID="scanner-modes">
                <Seg testID="scanner-mode" value={mode} onChange={onMode}
                  options={[{ key: "add", label: addLabel }, { key: "price", label: "Price check" }]} />
                <Sub style={{ marginTop: 6, textAlign: "center", fontSize: 11 }}>
                  {mode === "price" ? "Price check only — nothing goes on the sale until you say so." : "Every scan adds one to the sale."}
                </Sub>
              </View>
            ) : null}
          </>
        )}
      </View>
    </Modal>
  );
}
