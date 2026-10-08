// Shared reader for the terms and the privacy policy.
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LegalDoc } from "@/src/legal";
import { AppBar, Card, Sub } from "@/src/components/ui";
import { fonts, makeStyles } from "@/src/theme";
import { useBottomPad } from "@/src/safe";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  h: { fontFamily: fonts.bold, fontSize: 14.5, color: c.onSurface, marginTop: 16, marginBottom: 6 },
  p: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: c.onSurface, marginBottom: 8 },
  intro: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 21, color: c.onSurface },
}));

export function LegalReader({ doc, testID }: { doc: LegalDoc; testID: string }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID={testID}>
      <AppBar title={doc.title} back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }}>
        <Card>
          <Sub>{doc.updated}</Sub>
          <Text style={[s.intro, { marginTop: 8 }]}>{doc.intro}</Text>
        </Card>
        <Card style={{ marginTop: 10 }}>
          {doc.sections.map((sec) => (
            <View key={sec.h}>
              <Text style={s.h}>{sec.h}</Text>
              {sec.p.map((line, i) => <Text key={i} style={s.p}>{line}</Text>)}
            </View>
          ))}
          <Sub style={{ marginTop: 12 }}>TREDI · Made with tredi</Sub>
        </Card>
      </ScrollView>
    </View>
  );
}
