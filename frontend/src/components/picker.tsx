// One dropdown for the whole app: a sheet of options, optional search, and an
// optional "add a new one" row so a trader is never blocked by a fixed list.
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Btn, Field, H4, Li, Radio, Sub } from "@/src/components/ui";
import { Sheet } from "@/src/components/sheet";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export type Option = { key: string; label: string; sub?: string };

const useStyles = makeStyles((c) => ({
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8, minHeight: 36 },
  plus: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  plusOn: { backgroundColor: c.sqAv },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 11, paddingHorizontal: 11, minHeight: 42, marginBottom: 8 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: c.onSurface, paddingVertical: 8 },
}));

export type AddField = { key: string; label: string; placeholder?: string; keyboardType?: "default" | "phone-pad" | "email-address" | "numeric"; multiline?: boolean };

export function Picker({ visible, onClose, title, options, value, onPick, onAdd, addLabel = "Add a new one", addTitle, addFields = [], addHint, addBusy, searchable, testID }: {
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
  const close = () => { setTerm(""); setAdding(""); setExtra({}); setAddOpen(false); onClose(); };
  const save = () => {
    const trimmed: Record<string, string> = {};
    for (const f of addFields) trimmed[f.key] = (extra[f.key] ?? "").trim();
    onAdd?.(adding.trim(), trimmed);
    close();
  };

  return (
    <Sheet visible={visible} onClose={close} testID={testID ?? "picker-sheet"}>
      <View style={s.head}>
        <H4 style={{ flex: 1 }}>{addOpen ? addTitle ?? addLabel : title}</H4>
        {onAdd ? (
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
export function PickerField({ label, value, options, onPick, onAdd, addLabel, addTitle, addFields, addHint, addBusy, searchable, placeholder, style, testID, title, disabled }: {
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
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </>
  );
}
