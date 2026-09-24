// One dropdown for the whole app: a sheet of options, optional search, and an
// optional "add a new one" row so a trader is never blocked by a fixed list.
import React, { useMemo, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Btn, Field, H4, Li, Radio, Sub } from "@/src/components/ui";
import { Sheet } from "@/src/components/sheet";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export type Option = { key: string; label: string; sub?: string };

const useStyles = makeStyles((c) => ({
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 11, paddingHorizontal: 11, minHeight: 42, marginBottom: 8 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: c.onSurface, paddingVertical: 8 },
}));

export function Picker({ visible, onClose, title, options, value, onPick, onAdd, addLabel = "Add a new one", searchable, testID }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: Option[];
  value?: string | null;
  onPick: (key: string) => void;
  onAdd?: (label: string) => void;
  addLabel?: string;
  searchable?: boolean;
  testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const [term, setTerm] = useState("");
  const [adding, setAdding] = useState("");
  const list = useMemo(
    () => (term.trim() ? options.filter((o) => o.label.toLowerCase().includes(term.trim().toLowerCase())) : options),
    [options, term],
  );

  const close = () => { setTerm(""); setAdding(""); onClose(); };

  return (
    <Sheet visible={visible} onClose={close} testID={testID ?? "picker-sheet"}>
      <H4 style={{ marginBottom: 8 }}>{title}</H4>
      {searchable ? (
        <View style={s.search}>
          <Ionicons name="search-outline" size={16} color={colors.ink60} />
          <TextInput value={term} onChangeText={setTerm} placeholder="Search" placeholderTextColor={colors.ink40} style={s.input} testID="picker-search" />
        </View>
      ) : null}
      <View style={{ maxHeight: 380 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          {list.length === 0 ? <Sub style={{ paddingVertical: 12 }}>Nothing matches “{term}”.</Sub> : null}
          {list.map((o, i) => (
            <Li key={o.key} last={i === list.length - 1} testID={`picker-option-${o.key}`} onPress={() => { onPick(o.key); close(); }}>
              <Radio on={value === o.key} />
              <View style={{ flex: 1 }}><H4>{o.label}</H4>{o.sub ? <Sub>{o.sub}</Sub> : null}</View>
            </Li>
          ))}
        </ScrollView>
      </View>
      {onAdd ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          <Field label={addLabel} value={adding} onChangeText={setAdding} placeholder="Type a new name" testID="picker-add-input" />
          <Btn small label="Add and use it" disabled={!adding.trim()} testID="picker-add-save"
            onPress={() => { onAdd(adding.trim()); close(); }} />
        </View>
      ) : null}
    </Sheet>
  );
}

/** A Field that opens a Picker. Keeps screens free of sheet plumbing. */
export function PickerField({ label, value, options, onPick, onAdd, addLabel, searchable, placeholder, style, testID, title, disabled }: {
  label?: string;
  value?: string | null;
  options: Option[];
  onPick: (key: string) => void;
  onAdd?: (label: string) => void;
  addLabel?: string;
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
        searchable={searchable}
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </>
  );
}
