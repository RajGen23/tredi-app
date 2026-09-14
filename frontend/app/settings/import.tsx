// 11.3 Import from Excel — validation runs before anything is written, names
// the row, and lets the clean rows through.
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Field, H4, Lbl, Li, Loading, Row, Seg, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { makeStyles, useTheme } from "@/src/theme";

type Target = "customers" | "items";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

function parseCsv(text: string): { header: string[]; rows: { row: number; values: Record<string, string> }[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { header: [], rows: [] };
  const split = (l: string) => l.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map((l, i) => {
    const cells = split(l);
    return { row: i + 1, values: Object.fromEntries(header.map((h, j) => [h, cells[j] ?? ""])) };
  });
  return { header, rows };
}

export default function Import() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target>("customers");
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<{ row: number; values: Record<string, string> }[]>([]);
  const [paste, setPaste] = useState("");
  const [report, setReport] = useState<any>(null);

  const preview = useMutation({
    mutationFn: (payload: { filename: string; rows: any[] }) => api("/import/preview", { method: "POST", json: { target, ...payload } }),
    onSuccess: (r: any) => setReport(r),
    onError: (e: any) => toast.show(e.message),
  });
  const commit = useMutation({
    mutationFn: () => api("/import/commit", { method: "POST", json: { target, filename, rows, skip_rows: [] } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.show(`${r.imported} ${r.target} imported`, "Done");
      setReport(null);
      setRows([]);
      setFilename("");
      setPaste("");
    },
    onError: (e: any) => toast.show(e.message),
  });

  const load = (name: string, text: string) => {
    const parsed = parseCsv(text);
    if (!parsed.rows.length) return toast.show("That file has no rows");
    setFilename(name);
    setRows(parsed.rows);
    preview.mutate({ filename: name, rows: parsed.rows });
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    try {
      let text = "";
      if (Platform.OS === "web") {
        const r = await fetch(asset.uri);
        text = await r.text();
      } else {
        text = await FileSystem.readAsStringAsync(asset.uri);
      }
      load(asset.name, text);
    } catch {
      toast.show("Could not read that file — save it as CSV first");
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="import-screen">
      <AppBar title={`Import ${target}`} back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Seg testID="import-target" value={target} onChange={(v) => { setTarget(v); setReport(null); }}
          options={[{ key: "customers", label: "Customers" }, { key: "items", label: "Stock items" }]} />

        <Card style={{ marginTop: 10 }}>
          {filename ? (
            <Row style={{ gap: 10 }}>
              <Av icon="document-text-outline" tone="sq" />
              <View style={{ flex: 1 }}><H4>{filename}</H4><Sub>{rows.length} rows read</Sub></View>
              <Btn label="Replace" variant="ghost" small testID="import-replace" onPress={pickFile} />
            </Row>
          ) : (
            <>
              <Row style={{ gap: 10 }}>
                <Av icon="cloud-upload-outline" tone="mint" />
                <View style={{ flex: 1 }}><H4>Choose a CSV file</H4><Sub>Save your Excel sheet as CSV first</Sub></View>
              </Row>
              <Btn label="Pick a file" style={{ marginTop: 12 }} testID="import-pick" onPress={pickFile} />
            </>
          )}
        </Card>

        {!filename ? (
          <>
            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Or paste the rows</Lbl>
            <Field label="CSV text" multiline placeholder={"name,phone\nGrace Mwangi,08152207741"} value={paste} onChangeText={setPaste} testID="import-paste" />
            <Btn label="Check pasted rows" variant="ghost" small style={{ marginTop: 8 }} disabled={!paste.trim()} testID="import-check-paste"
              onPress={() => load("pasted.csv", paste)} />
          </>
        ) : null}

        {preview.isPending ? <Loading label="Checking every row" /> : null}

        {report ? (
          <>
            <Card style={{ marginTop: 12 }} testID="import-report">
              <Row between>
                <View style={{ flex: 1 }}><H4>{report.ready_count} rows are ready</H4>
                  <Sub>{report.issue_count ? `${report.issue_count} rows need attention before import` : "Nothing to fix"}</Sub></View>
                <Badge tone={report.issue_count ? "due" : "paid"}>{report.issue_count ? "Check" : "Clean"}</Badge>
              </Row>
            </Card>
            {report.issues.length ? (
              <>
                <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Needs attention</Lbl>
                <Card style={{ paddingVertical: 4 }}>
                  {report.issues.map((iss: any, i: number) => (
                    <Li key={i} last={i === report.issues.length - 1} testID={`import-issue-${i}`}>
                      <Av icon={iss.kind === "blocked" ? "close-circle-outline" : "alert-circle-outline"} tone={iss.kind === "blocked" ? "coral" : "sq"} />
                      <View style={{ flex: 1 }}>
                        <Row between><H4>{iss.title}</H4><Badge tone={iss.kind === "blocked" ? "over" : "due"}>{iss.action}</Badge></Row>
                        <Sub>{iss.detail}</Sub>
                      </View>
                    </Li>
                  ))}
                </Card>
              </>
            ) : null}
            <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Expected columns</Lbl>
            <Card><Sub>{report.columns.join(", ")}</Sub></Card>
            <Row style={{ marginTop: 14, gap: 8 }}>
              <View style={{ flex: 1 }}><Btn label="Start again" variant="ghost" small testID="import-reset" onPress={() => { setReport(null); setRows([]); setFilename(""); }} /></View>
              <View style={{ flex: 2 }}><Btn label={`Import ${report.ready_count}`} small disabled={!report.ready_count} loading={commit.isPending} testID="import-commit" onPress={() => commit.mutate()} /></View>
            </Row>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
