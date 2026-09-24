// App lock settings — set the PIN, the idle timeout and fingerprint.
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { bioState, bioUnlock, type BioState } from "@/src/biometrics";
import { AppBar, Badge, Btn, Card, Chip, Field, H4, Lbl, Loading, Row, Sub, Switch } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { makeStyles } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function LockSettings() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lock"], queryFn: () => api("/settings/lock") });
  const [enabled, setEnabled] = useState(false);
  const [bio, setBio] = useState(true);
  const [idle, setIdle] = useState(2);
  const [pin, setPin] = useState("");
  const [sensor, setSensor] = useState<BioState>({ available: false, enrolled: false, label: "Fingerprint" });
  useEffect(() => { if (q.data) { setEnabled(q.data.enabled); setBio(q.data.biometrics); setIdle(q.data.idle_minutes); } }, [q.data]);
  useEffect(() => { bioState().then(setSensor); }, []);

  const save = useMutation({
    mutationFn: () => api("/settings/lock", { method: "PUT", json: { enabled, pin, idle_minutes: idle, biometrics: bio } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lock"] }); setPin(""); toast.show("App lock updated"); },
    onError: (e: any) => toast.show(e.message),
  });

  const test = async () => {
    const res = await bioUnlock("Test the unlock");
    if (res.ok) toast.show(`${sensor.label} read — that is how it will unlock`, "Worked.");
    else if (res.message) toast.show(res.message);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="lock-settings-screen">
      <AppBar title="App lock" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {!q.data ? <Loading /> : (
          <>
            <Card>
              <Row between>
                <View style={{ flex: 1 }}><H4>Lock this phone</H4><Sub>A PIN is asked for when the app has been idle</Sub></View>
                <Switch on={enabled} onChange={setEnabled} testID="lock-enabled" />
              </Row>
              <Row between style={{ marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <H4>Allow {sensor.label}</H4>
                  <Sub>
                    {!sensor.available ? "This phone has no fingerprint or face sensor — a device build is needed to test it"
                      : !sensor.enrolled ? `Add a ${sensor.label.toLowerCase()} in your phone settings first`
                      : `Offered first on the lock screen, with the PIN underneath`}
                  </Sub>
                </View>
                <Switch on={bio} onChange={setBio} testID="lock-bio" />
              </Row>
              {sensor.available && sensor.enrolled && bio ? (
                <Btn variant="ghost" small label={`Test ${sensor.label}`} style={{ marginTop: 10 }} testID="lock-bio-test" onPress={test} />
              ) : null}
            </Card>
            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Lock after</Lbl>
            <Row style={{ gap: 6 }}>
              {[1, 2, 5, 15].map((m) => <Chip key={m} label={`${m} min`} on={idle === m} onPress={() => setIdle(m)} testID={`lock-idle-${m}`} />)}
            </Row>
            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>PIN</Lbl>
            <Card>
              <Field label={q.data.has_pin ? "Change PIN" : "Set a PIN"} placeholder="4 to 8 digits" keyboardType="number-pad" secureTextEntry mono
                value={pin} onChangeText={setPin} testID="lock-pin" />
              {q.data.has_pin ? <Badge tone="paid" style={{ marginTop: 8 }}>A PIN is already set</Badge> : null}
            </Card>
            <Btn label="Save" style={{ marginTop: 14 }} loading={save.isPending} testID="lock-save" onPress={() => save.mutate()} />
            {q.data.has_pin ? <Btn label="Test the lock screen" variant="ghost" style={{ marginTop: 8 }} testID="lock-test" onPress={() => router.push("/lock")} /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
