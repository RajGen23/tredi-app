// One dropdown for the whole app: a sheet of options, optional search, an
// optional "add a new one" row so a trader is never blocked by a fixed list, and
// for editable lists an "Edit list" mode to rename or remove names.
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Btn, Field, H4, Li, Radio, Sub } from "@/src/components/ui";
import type { LookupManage } from "@/src/lookups";
import { Sheet } from "@/src/components/sheet";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export type Option = { key: string; label: string; sub?: string };

const useStyles = makeStyles((c) => ({
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8, minHeight: 36 },
  plus: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  plusOn: { backgroundColor: c.sqAv },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 11, paddingHorizontal: 11, minHeight: 42, marginBottom: 8 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: c.onSurface, paddingVertical: 8 },
  editLink: { fontFamily: fonts.bold, fontSize: 13, color: c.green700 },
  rowBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: c.faint },
  note: { fontFamily: fonts.medium, fontSize: 12, color: c.ink60, paddingVertical: 6 },
  err: { fontFamily: fonts.medium, fontSize: 12, color: c.coral, paddingVertical: 6 },
  confirm: { borderWidth: 1, borderColor: c.coral, borderRadius: 11, padding: 10, gap: 8, marginVertical: 4 },
}));

/** Edit mode for a list: rename a name in place, or remove it after a warning
 *  saying how many records use it. */
function ManageList({ options, manage, onRenamed, onRemoved }: {
  options: Option[]; manage: LookupManage; onRenamed?: (from: string, to: string) => void; onRemoved?: (value: string) => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState<{ value: string; count: number; noun: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const run = async (fn: () => Promise<string>, after: () => void) => {
    setBusy(true); setErr("");
    try { setNote(await fn()); after(); } catch (e: any) { setErr(e.message || "That didn't work — try again"); } finally { setBusy(false); }
  };
  const askRemove = async (value: string) => {
    setErr(""); setNote(""); setRenaming(null);
    try { const u = await manage.usage(value); setRemoving({ value, ...u }); } catch (e: any) { setErr(e.message || "Couldn't check that name"); }
  };
  return (
    <>
      {note ? <Text style={s.note} testID="picker-manage-note">{note}</Text> : null}
      {err ? <Text style={s.err} testID="picker-manage-error">{err}</Text> : null}
      {options.length === 0 ? <Sub style={{ paddingVertical: 12 }}>Nothing on this list yet.</Sub> : null}
      {options.map((o, i) => renaming === o.key ? (
        <View key={o.key} style={{ gap: 8, paddingVertical: 6 }}>
          <Field label={`Rename “${o.label}”`} value={name} onChangeText={setName} autoFocus testID="picker-rename-input" />
          <Sub>Every record using “{o.label}” changes too.</Sub>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn small variant="ghost" label="Cancel" style={{ flex: 1 }} testID="picker-rename-cancel" onPress={() => setRenaming(null)} />
            <Btn small label="Save name" style={{ flex: 2 }} loading={busy} disabled={!name.trim() || name.trim() === o.key || busy} testID="picker-rename-save"
              onPress={() => run(() => manage.rename(o.key, name.trim()), () => { onRenamed?.(o.key, name.trim()); setRenaming(null); })} />
          </View>
        </View>
      ) : removing?.value === o.key ? (
        <View key={o.key} style={s.confirm} testID="picker-remove-confirm">
          <H4>Remove “{o.label}”?</H4>
          <Sub>{removing.count ? `${removing.count} ${removing.noun} use it.` : "Nothing uses it."}</Sub>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn small variant="ghost" label="Keep it" style={{ flex: 1 }} testID="picker-remove-cancel" onPress={() => setRemoving(null)} />
            <Btn small variant="coral" label="Remove" style={{ flex: 1 }} loading={busy} disabled={busy} testID="picker-remove-yes"
              onPress={() => run(() => manage.remove(o.key), () => { onRemoved?.(o.key); setRemoving(null); })} />
          </View>
        </View>
      ) : (
        <Li key={o.key} last={i === options.length - 1} testID={`picker-manage-${o.key}`}>
          <View style={{ flex: 1 }}><H4>{o.label}</H4>{o.sub ? <Sub>{o.sub}</Sub> : null}</View>
          <Pressable style={s.rowBtn} hitSlop={4} accessibilityLabel={`Rename ${o.label}`} testID={`picker-rename-${o.key}`}
            onPress={() => { setRemoving(null); setErr(""); setNote(""); setName(o.label); setRenaming(o.key); }}>
            <Ionicons name="pencil-outline" size={16} color={colors.onSurface} />
          </Pressable>
          <Pressable style={s.rowBtn} hitSlop={4} accessibilityLabel={`Remove ${o.label}`} testID={`picker-remove-${o.key}`} onPress={() => askRemove(o.key)}>
            <Ionicons name="trash-outline" size={16} color={colors.coral} />
          </Pressable>
        </Li>
      ))}
    </>
  );
}

export type AddField = { key: string; label: string; placeholder?: string; keyboardType?: "default" | "phone-pad" | "email-address" | "numeric"; multiline?: boolean };

export function Picker({ visible, onClose, title, options, value, onPick, onAdd, addLabel = "Add a new one", addTitle, addFields = [], addHint, addBusy, searchable, manage, onRenamed, onRemoved, testID }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: Option[];
  value?: string | null;
  onPick: (key: string) => void;
  onAdd?: (label: string, extra: Record<string, string>) => void;
  addLabel?: string;
  /** Heading shown while the add form is open (defaults to addLabel). */
  addTitle?: string;
  /** Extra inputs under the name, e.g. phone and notes for a supplier. */
  addFields?: AddField[];
  addHint?: string;
  addBusy?: boolean;
  searchable?: boolean;
  /** Lets the owner or a manager rename or remove names (see useLookup). */
  manage?: LookupManage;
  /** Called after a rename, so a form showing the old name can follow it. */
  onRenamed?: (from: string, to: string) => void;
  onRemoved?: (value: string) => void;
  testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const [term, setTerm] = useState("");
  const [adding, setAdding] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const list = useMemo(
    () => (term.trim() ? options.filter((o) => o.label.toLowerCase().includes(term.trim().toLowerCase())) : options),
    [options, term],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const close = () => { setTerm(""); setAdding(""); setExtra({}); setAddOpen(false); setEditing(false); onClose(); };
  const save = () => {
    const trimmed: Record<string, string> = {};
    for (const f of addFields) trimmed[f.key] = (extra[f.key] ?? "").trim();
    onAdd?.(adding.trim(), trimmed);
    close();
  };

  return (
    <Sheet visible={visible} onClose={close} testID={testID ?? "picker-sheet"}>
      <View style={s.head}>
        <H4 style={{ flex: 1 }}>{addOpen ? addTitle ?? addLabel : editing ? `Edit ${title.toLowerCase()} list` : title}</H4>
        {manage && !addOpen ? (
          <Pressable onPress={() => setEditing((v) => !v)} hitSlop={8} testID="picker-edit-toggle">
            <Text style={s.editLink}>{editing ? "Done" : "Edit list"}</Text>
          </Pressable>
        ) : null}
        {onAdd && !editing ? (
          <Pressable onPress={() => setAddOpen((v) => !v)} style={[s.plus, addOpen && s.plusOn]} testID="picker-add-toggle" accessibilityLabel={addOpen ? "Back to list" : addLabel} hitSlop={6}>
            <Ionicons name={addOpen ? "close" : "add"} size={20} color={addOpen ? colors.onSurface : colors.onBrandPrimary} />
          </Pressable>
        ) : null}
      </View>
      {onAdd && addOpen ? (
        // The add form replaces the list so the whole thing stays above the keyboard.
        <View style={{ gap: 9 }}>
          <Field label={addLabel} value={adding} onChangeText={setAdding} placeholder="Type a new name" autoFocus testID="picker-add-input" />
          {addFields.map((f) => (
            <Field key={f.key} label={f.label} value={extra[f.key] ?? ""} onChangeText={(v) => setExtra((e) => ({ ...e, [f.key]: v }))}
              placeholder={f.placeholder} keyboardType={f.keyboardType} multiline={f.multiline} testID={`picker-add-${f.key}`} />
          ))}
          {addHint ? <Sub>{addHint}</Sub> : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <Btn small variant="ghost" label="Back to list" style={{ flex: 1 }} testID="picker-add-back" onPress={() => setAddOpen(false)} />
            <Btn small label="Add and use it" style={{ flex: 2 }} disabled={!adding.trim() || addBusy} loading={addBusy} testID="picker-add-save" onPress={save} />
          </View>
        </View>
      ) : editing && manage ? (
        <View style={{ maxHeight: 420 }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <ManageList options={options} manage={manage} onRenamed={onRenamed} onRemoved={onRemoved} />
          </ScrollView>
        </View>
      ) : (
        <>
          {searchable ? (
            <View style={s.search}>
              <Ionicons name="search-outline" size={16} color={colors.ink60} />
              <TextInput value={term} onChangeText={setTerm} placeholder="Search" placeholderTextColor={colors.ink40} style={s.input} testID="picker-search" />
            </View>
          ) : null}
          <View style={{ maxHeight: 380 }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {list.length === 0 ? (
                <Sub style={{ paddingVertical: 12 }}>
                  Nothing matches “{term}”.{onAdd ? " Tap + to add it." : ""}
                </Sub>
              ) : null}
              {list.map((o, i) => (
                <Li key={o.key} last={i === list.length - 1} testID={`picker-option-${o.key}`} onPress={() => { onPick(o.key); close(); }}>
                  <Radio on={value === o.key} />
                  <View style={{ flex: 1 }}><H4>{o.label}</H4>{o.sub ? <Sub>{o.sub}</Sub> : null}</View>
                </Li>
              ))}
            </ScrollView>
          </View>
        </>
      )}
    </Sheet>
  );
}

/** A Field that opens a Picker. Keeps screens free of sheet plumbing. */
export function PickerField({ label, value, options, onPick, onAdd, addLabel, addTitle, addFields, addHint, addBusy, searchable, manage, placeholder, style, testID, title, disabled }: {
  label?: string;
  value?: string | null;
  options: Option[];
  onPick: (key: string) => void;
  onAdd?: (label: string, extra: Record<string, string>) => void;
  addLabel?: string;
  addTitle?: string;
  addFields?: AddField[];
  addHint?: string;
  addBusy?: boolean;
  searchable?: boolean;
  /** Rename/remove for an editable list; the field follows a rename or removal of its own value. */
  manage?: LookupManage;
  placeholder?: string;
  style?: any;
  testID?: string;
  title?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shown = options.find((o) => o.key === value)?.label ?? (value || "");
  return (
    <>
      <Field
        label={label}
        value={shown}
        placeholder={placeholder ?? "Choose"}
        onPress={disabled ? undefined : () => setOpen(true)}
        right={<Ionicons name="chevron-down" size={15} color="#8FA3A0" />}
        style={style}
        testID={testID}
      />
      <Picker
        visible={open}
        onClose={() => setOpen(false)}
        title={title ?? label ?? "Choose"}
        options={options}
        value={value}
        onPick={onPick}
        onAdd={onAdd}
        addLabel={addLabel}
        addTitle={addTitle}
        addFields={addFields}
        addHint={addHint}
        addBusy={addBusy}
        searchable={searchable}
        manage={manage}
        onRenamed={(from, to) => { if (value === from) onPick(to); }}
        onRemoved={(v) => { if (value === v) onPick(""); }}
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </>
  );
}
