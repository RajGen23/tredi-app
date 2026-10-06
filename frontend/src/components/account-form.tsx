// Add a cash till, bank or mobile-money account — or correct one — without
// leaving the screen you are on: the accounts page, invoice settings, or the
// middle of an invoice.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { Btn, Field, H4, Seg, Sub } from "@/src/components/ui";
import { Sheet, useToast } from "@/src/components/sheet";
import { parseNum, sym } from "@/src/format";

export type AccountRow = { id: string; name: string; kind: string; detail?: string; dormant?: boolean; opening_balance?: number };

export function AccountForm({ account, onCreated, onCancel, saveLabel }: {
  account?: AccountRow | null;
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

  useEffect(() => {
    setName(account?.name ?? "");
    setKind(((account?.kind as any) || "bank") as "cash" | "bank" | "mobile");
    setDetail(account?.detail ?? "");
    setOpening(account?.opening_balance ? String(account.opening_balance) : "");
  }, [account?.id]);

  const save = useMutation({
    mutationFn: () => {
      const json = { name: name.trim(), kind, detail: detail.trim(), opening_balance: parseNum(opening) };
      return account?.id
        ? api<AccountRow>(`/accounts/${account.id}`, { method: "PUT", json })
        : api<AccountRow>("/accounts", { method: "POST", json });
    },
    onSuccess: (a) => {
      ["accounts", "account", "invoice-settings", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      if (!account?.id) { setName(""); setDetail(""); setOpening(""); }
      toast.show(account?.id ? `${a.name} updated` : `${a.name} added — you can take payments into it`, "Saved.");
      onCreated?.(a);
    },
    onError: (e: any) => toast.show(e.message ?? "Could not save the account", undefined, "bad"),
  });

  return (
    <View testID="account-form">
      <Seg testID="account-kind" value={kind} onChange={setKind}
        options={[{ key: "bank", label: "Bank" }, { key: "cash", label: "Cash" }, { key: "mobile", label: "Mobile money" }]} />
      <View style={{ gap: 9, marginTop: 10 }}>
        <Field label="Account name" value={name} onChangeText={setName} testID="account-name"
          placeholder={kind === "bank" ? "GTB — 0221" : kind === "cash" ? "Counter till" : "Opay merchant"} autoFocus={!account?.id} />
        <Field label={kind === "bank" ? "Bank and account number" : "Detail"} value={detail} onChangeText={setDetail}
          placeholder={kind === "bank" ? "GTBank · 0123456789" : "Business current account"} testID="account-detail" />
        <Field label="Opening balance" value={opening} onChangeText={setOpening} keyboardType="decimal-pad" mono
          placeholder={`${sym()} 0`} testID="account-opening" />
      </View>
      <Btn label={saveLabel ?? (account?.id ? "Save changes" : "Save account")} style={{ marginTop: 12 }}
        disabled={!name.trim()} loading={save.isPending} testID="account-save" onPress={() => save.mutate()} />
      {onCancel ? <Btn variant="ghost" small label="Cancel" style={{ marginTop: 8 }} testID="account-cancel" onPress={onCancel} /> : null}
    </View>
  );
}

export function AddAccountSheet({ visible, onClose, onCreated, account }: {
  visible: boolean;
  onClose: () => void;
  onCreated?: (a: AccountRow) => void;
  account?: AccountRow | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const sleep = useMutation({
    mutationFn: () => api<any>(`/accounts/${account?.id}/dormant`, { method: "POST", json: { dormant: !account?.dormant } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["accounts"] }); toast.show(r.message); onClose(); },
    onError: (e: any) => toast.show(e.message, undefined, "bad"),
  });

  return (
    <Sheet visible={visible} onClose={onClose} testID="account-add-sheet">
      <H4>{account?.id ? `Edit ${account.name}` : "Add an account"}</H4>
      <Sub style={{ marginTop: 3 }}>
        {account?.id
          ? "Accounts are never deleted. Make one dormant and it leaves the pickers while its statement stays untouched."
          : "Every payment you take is recorded against one of these, so the money is always traceable."}
      </Sub>
      <View style={{ marginTop: 11 }}>
        <AccountForm account={account} onCreated={(a) => { onCreated?.(a); onClose(); }} />
        {account?.id ? (
          <Btn variant="ghost" small style={{ marginTop: 8 }} loading={sleep.isPending} testID="account-dormant"
            label={account.dormant ? "Reopen this account" : "Make dormant"} onPress={() => sleep.mutate()} />
        ) : null}
      </View>
    </Sheet>
  );
}
