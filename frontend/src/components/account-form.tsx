// Add a cash till, bank or mobile-money account without leaving the screen you
// are on — the accounts page, invoice settings, or the middle of an invoice.
import { useState } from "react";
import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { Btn, Field, H4, Seg, Sub } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { parseNum, sym } from "@/src/format";

export type AccountRow = { id: string; name: string; kind: string; detail?: string };

export function AccountForm({ onCreated, onCancel, saveLabel = "Save account" }: {
  onCreated?: (a: AccountRow) => void;
  onCancel?: () => void;
  saveLabel?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"cash" | "bank" | "mobile">("bank");
  const [detail, setDetail] = useState("");
  const [opening, setOpening] = useState("");

  const create = useMutation({
    mutationFn: () => api<AccountRow>("/accounts", {
      method: "POST",
      json: { name: name.trim(), kind, detail: detail.trim(), opening_balance: parseNum(opening) },
    }),
    onSuccess: (a) => {
      ["accounts", "invoice-settings", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setName(""); setDetail(""); setOpening("");
      toast.show(`${a.name} added — you can take payments into it`, "Saved.");
      onCreated?.(a);
    },
    onError: (e: any) => toast.show(e.message ?? "Could not save the account"),
  });

  return (
    <View testID="account-form">
      <Seg testID="account-kind" value={kind} onChange={setKind}
        options={[{ key: "bank", label: "Bank" }, { key: "cash", label: "Cash" }, { key: "mobile", label: "Mobile money" }]} />
      <View style={{ gap: 9, marginTop: 10 }}>
        <Field label="Account name" value={name} onChangeText={setName} testID="account-name"
          placeholder={kind === "bank" ? "GTB — 0221" : kind === "cash" ? "Counter till" : "Opay merchant"} autoFocus />
        <Field label={kind === "bank" ? "Bank and account number" : "Detail"} value={detail} onChangeText={setDetail}
          placeholder={kind === "bank" ? "GTBank · 0123456789" : "Business current account"} testID="account-detail" />
        <Field label="Opening balance" value={opening} onChangeText={setOpening} keyboardType="decimal-pad" mono
          placeholder={`${sym()} 0`} testID="account-opening" />
      </View>
      <Btn label={saveLabel} style={{ marginTop: 12 }} disabled={!name.trim()} loading={create.isPending}
        testID="account-save" onPress={() => create.mutate()} />
      {onCancel ? <Btn variant="ghost" small label="Cancel" style={{ marginTop: 8 }} testID="account-cancel" onPress={onCancel} /> : null}
    </View>
  );
}

export function AddAccountSheet({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated?: (a: AccountRow) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} testID="account-add-sheet">
      <H4>Add an account</H4>
      <Sub style={{ marginTop: 3 }}>Every payment you take is recorded against one of these, so the money is always traceable.</Sub>
      <View style={{ marginTop: 11 }}>
        <AccountForm onCreated={(a) => { onCreated?.(a); onClose(); }} />
      </View>
    </Sheet>
  );
}
