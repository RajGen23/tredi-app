// The Print / Export pair that sits at the bottom of every report.
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomPad } from "@/src/safe";

import { Btn, H4, Li, Loading, Row, Sub } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { useAuth } from "@/src/auth";
import { useShops } from "@/src/lookups";
import { printHtml, sharePdf } from "@/src/pdf";
import { ReportDoc, reportCsv, reportFileName, reportHtml, shareCsv } from "@/src/report-export";

/** The two lines that head every exported report. */
export function useReportMeta() {
  const { business } = useAuth();
  const { active } = useShops();
  return { business: business?.name ?? "TradaBooks", shop: active || "All shops" };
}

export function ExportBar({ build, testID = "report" }: { build: () => ReportDoc | null | undefined; testID?: string }) {
  const insets = useSafeAreaInsets();
  const pad = useBottomPad();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");

  const run = async (kind: "print" | "pdf" | "csv") => {
    const doc = build();
    if (!doc) return toast.show("Give the report a moment to load");
    setBusy(kind);
    try {
      if (kind === "csv") {
        const name = reportFileName(doc, "csv");
        const res = await shareCsv(reportCsv(doc), name);
        toast.show(res.shared ? `${name} ready` : `${name} saved — sharing is not available here`, "Excel");
      } else {
        const html = reportHtml(doc);
        if (kind === "print") await printHtml(html);
        else {
          const name = reportFileName(doc, "pdf");
          const res = await sharePdf(html, name);
          toast.show(res.shared ? `${name} ready` : `${name} saved — sharing is not available here`, "PDF");
        }
      }
      setOpen(false);
    } catch (e: any) {
      toast.show(e?.message ?? "Could not build the file");
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <Row style={{ position: "absolute", left: 14, right: 14, bottom: pad, gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Btn small variant="ghost" label="Export" icon="download-outline" testID={`${testID}-export`} onPress={() => setOpen(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn small variant="deep" label="Print" icon="print-outline" loading={busy === "print"} testID={`${testID}-print`} onPress={() => run("print")} />
        </View>
      </Row>
      <Sheet visible={open} onClose={() => setOpen(false)} testID={`${testID}-export-sheet`}>
        <H4>Export this report</H4>
        <Sub style={{ marginTop: 3, marginBottom: 8 }}>The figures on this screen, exactly as you are looking at them.</Sub>
        <Li testID={`${testID}-export-pdf`} onPress={() => run("pdf")}>
          <View style={{ flex: 1 }}><H4>PDF</H4><Sub>Share on WhatsApp or email it to your accountant</Sub></View>
          {busy === "pdf" ? <Loading /> : null}
        </Li>
        <Li last testID={`${testID}-export-csv`} onPress={() => run("csv")}>
          <View style={{ flex: 1 }}><H4>CSV for Excel</H4><Sub>Opens in Excel, Google Sheets or Numbers</Sub></View>
          {busy === "csv" ? <Loading /> : null}
        </Li>
      </Sheet>
    </>
  );
}
