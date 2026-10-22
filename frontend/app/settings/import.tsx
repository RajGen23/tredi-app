// 11.3 Import from Excel — .xlsx, .xls or CSV. Validation runs before anything
// is written, names the row, and lets the clean rows through.
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as XLSX from "xlsx";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { AppBar, Av, Badge, Btn, Card, Field, H4, Lbl, Li, Loading, Row, Seg, Sub } from "@/src/components/ui";
import { useToast } from "@/src/components/sheet";
import { makeStyles, useTheme } from "@/src/theme";
import { useBottomPad } from "@/src/safe";
import { shareCsv } from "@/src/report-export";
import { money } from "@/src/format";

type Target = "customers" | "items";
type Rows = { row: number; values: Record<string, string> }[];

const SHEET_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv", "text/comma-separated-values", "text/plain", "*/*",
];

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

/** Header names are matched loosely: "Selling Price" and "selling_price" are
 *  the same column as far as the shop is concerned. */
function rowsFromGrid(grid: any[][]): Rows {
  const header = (grid[0] ?? []).map((h) => String(h ?? "").toLowerCase().trim().replace(/\s+/g, "_"));
  return grid.slice(1)
    .filter((r) => r.some((c) => String(c ?? "").trim().length))
    .map((r, i) => ({ row: i + 1, values: Object.fromEntries(header.map((h, j) => [h, r[j] == null ? "" : String(r[j]).trim()])) }));
}

function parseCsv(text: string): Rows {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const split = (l: string) => l.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  return rowsFromGrid(lines.map(split));
}

/** Excel bytes never reach the server — the sheet is read on the phone and only
 *  the rows travel, so the same validation covers pasted text and .xlsx. */
async function parseWorkbook(uri: string): Promise<Rows> {
  const wb = Platform.OS === "web"
    ? XLSX.read(new Uint8Array(await (await fetch(uri)).arrayBuffer()), { type: "array" })
    : XLSX.read(await new FileSystem.File(uri).base64(), { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return rowsFromGrid(XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: "" }));
}

export default function Import() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const toast = useToast();
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target>("customers");
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<Rows>([]);
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
      const po = (r.orders ?? []).length;
      toast.show(po ? `${r.imported} items in on ${po} purchase order${po === 1 ? "" : "s"}` : `${r.imported} ${r.target} imported`, "Done");
      setReport(null);
      setRows([]);
      setFilename("");
      setPaste("");
    },
    onError: (e: any) => toast.show(e.message),
  });

  const load = (name: string, rows: Rows) => {
    if (!rows.length) return toast.show("That file has no rows");
    setFilename(name);
    setRows(rows);
    preview.mutate({ filename: name, rows });
  };

  // The columns we actually read, straight from the server, so the template can
  // never drift from the importer.
  const tpl = useQuery({ queryKey: ["import-template", target], queryFn: () => api<any>(`/import/template?target=${target}`) });
  const grab = useMutation({
    mutationFn: async () => {
      const t = tpl.data ?? (await api<any>(`/import/template?target=${target}`));
      const res = await shareCsv(t.csv, t.filename);
      if (!res.shared) toast.show(`${t.filename} saved`, "Open it in Excel or Sheets");
      return t;
    },
    onError: (e: any) => toast.show(e.message ?? "Could not build the template", undefined, "bad"),
  });

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: SHEET_MIME, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    try {
      const excel = /\.(xlsx|xls|xlsm)$/i.test(asset.name ?? "");
      if (excel) return load(asset.name, await parseWorkbook(asset.uri));
      const text = Platform.OS === "web"
        ? await (await fetch(asset.uri)).text()
        : await new FileSystem.File(asset.uri).text();
      load(asset.name, parseCsv(text));
    } catch {
      toast.show("Could not read that file — try saving it again as .xlsx or CSV");
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="import-screen">
      <AppBar title={`Import ${target}`} back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        <Seg testID="import-target" value={target} onChange={(v) => { setTarget(v); setReport(null); }}
          options={[{ key: "customers", label: "Customers" }, { key: "items", label: "Stock items" }]} />

        <Card style={{ marginTop: 10 }} testID="import-template-card">
          <Row style={{ gap: 10 }}>
            <Av icon="download-outline" tone="sq" />
            <View style={{ flex: 1 }}>
              <H4>Start from our template</H4>
              <Sub>{tpl.data ? tpl.data.columns.join(", ") : "The exact columns we read, with one example row"}</Sub>
            </View>
          </Row>
          {target === "items" ? (
            <Sub style={{ marginTop: 8 }}>
              {"Put the supplier's name on each row. A batch upload is a delivery, so TradaBooks raises one purchase order per supplier — the goods come in against that PO and the supplier is owed. Leave supplier empty and the row counts as opening stock."}
            </Sub>
          ) : null}
          <Btn label="Download the template" variant="ghost" small style={{ marginTop: 10 }} loading={grab.isPending}
            testID="import-template" onPress={() => grab.mutate()} />
        </Card>

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
                <View style={{ flex: 1 }}><H4>Choose an Excel or CSV file</H4><Sub>.xlsx, .xls or .csv — the first sheet is read</Sub></View>
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
              onPress={() => load("pasted.csv", parseCsv(paste))} />
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
            {report.purchase_plan?.length ? (
              <>
                <Lbl style={{ marginTop: 14, marginBottom: 6 }}>Orders this upload will raise</Lbl>
                <Card style={{ paddingVertical: 4 }} testID="import-po-plan">
                  {report.purchase_plan.map((g: any, i: number) => (
                    <Li key={g.supplier || "opening"} last={i === report.purchase_plan.length - 1} testID={`import-po-${i}`}>
                      <Av icon={g.supplier ? "receipt-outline" : "cube-outline"} tone={g.supplier ? "mint" : "sq"} />
                      <View style={{ flex: 1 }}>
                        <Row between>
                          <H4>{g.supplier || "No supplier · opening stock"}</H4>
                          {g.new_supplier ? <Badge tone="info">New supplier</Badge> : null}
                        </Row>
                        <Sub>{g.items} item{g.items === 1 ? "" : "s"} · {g.qty} units · {money(g.value)}{g.supplier ? " owed on one PO" : " counted onto the shelf"}</Sub>
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
