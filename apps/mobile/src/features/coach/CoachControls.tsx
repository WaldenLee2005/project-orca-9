import { useThemeStyles } from "../../theme/ThemeProvider";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { createThemedStyles } from "../../theme/designSystem";
import type { ProgramLoad } from "../programs/programModel";
import type { Readiness } from "./coachModel";

export function CoachButton({ label, onPress, selected = false, disabled = false }: { label: string; onPress: () => void; selected?: boolean; disabled?: boolean }) {
  const { styles: coachStyles, colors, ui } = useThemeStyles(themedCoachStyles);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    style={[coachStyles.button, selected && { borderColor: colors.accent, backgroundColor: colors.accentSoft }, disabled && { opacity: 0.45 }]}>
    <Text style={{ color: selected ? colors.accent : colors.text, fontSize: 13, fontWeight: "600" }}>{label}</Text>
  </Pressable>;
}
export function DecimalField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) {
  const { styles: coachStyles, colors, ui } = useThemeStyles(themedCoachStyles);
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : "");
  const lastSent = useRef(value);
  useEffect(() => { if (!Object.is(value, lastSent.current)) { setText(Number.isFinite(value) ? String(value) : ""); lastSent.current = value; } }, [value]);
  return <View style={{ flex: 1, minWidth: 110, gap: 6 }}><Text style={coachStyles.copy}>{label}</Text>
    <TextInput accessibilityLabel={label} value={text} editable={!disabled} keyboardType="decimal-pad" inputMode="decimal" selectTextOnFocus
      onChangeText={(next) => { if (/^\d{0,5}(\.\d{0,2})?$/.test(next)) { setText(next); lastSent.current = next === "" || next === "." ? NaN : Number(next); onChange(lastSent.current); } }} style={coachStyles.input} />
  </View>;
}
export function ReadinessCheck({ value, onChange, disabled = false }: { value: Readiness; onChange: (next: Readiness) => void; disabled?: boolean }) {
  const { styles: coachStyles, colors, ui } = useThemeStyles(themedCoachStyles);
  return <View style={coachStyles.card}>
    <Text style={coachStyles.eyebrow}>LOCAL COACH · PROTOTYPE</Text><Text style={coachStyles.title}>How are you feeling today?</Text>
    <View style={coachStyles.row}>{([ ["unknown", "Skip / unsure"], ["good", "Feeling good"], ["low", "Low energy"], ["concern", "Pain / illness"] ] as const).map(([feeling, label]) =>
      <CoachButton key={feeling} label={label} selected={value.feeling === feeling} disabled={disabled} onPress={() => onChange({ ...value, feeling })} />)}</View>
    <CoachButton label="I want a shorter / lighter session" selected={value.lighter} disabled={disabled} onPress={() => onChange({ ...value, lighter: !value.lighter })} />
    <Text style={coachStyles.copy}>Optional, on-device check-in. Suggestions need your approval and never change your program automatically.</Text>
  </View>;
}
export function ProgramLoadEditor({ load, onChange, disabled, context }: { load?: ProgramLoad; onChange: (load?: ProgramLoad) => void; disabled: boolean; context: string }) {
  const { styles: coachStyles, colors, ui } = useThemeStyles(themedCoachStyles);
  return <View style={{ gap: 12 }}>
    <CoachButton label={load ? "Load coaching: on" : "Set up load coaching"} selected={!!load} disabled={disabled}
      onPress={() => onChange(load ? undefined : { weight: 0, increment: 5, unit: "lb", convention: "total", equipmentKey: "" })} />
    {load ? <>
      <Text style={coachStyles.copy}>External resistance only, in lb. Leave assisted, bodyweight and timed exercises manual. Enter your own starting load; 0 is not a recommendation.</Text>
      <View style={coachStyles.row}><DecimalField label={`Starting lb · ${context}`} value={load.weight} disabled={disabled} onChange={(weight) => onChange({ ...load, weight })} />
        <DecimalField label={`Smallest increase · ${context}`} value={load.increment} disabled={disabled} onChange={(increment) => onChange({ ...load, increment })} /></View>
      <View style={coachStyles.row}>{([ ["total", "Total weight"], ["perHand", "Per hand"] ] as const).map(([convention, label]) =>
        <CoachButton key={convention} label={label} selected={load.convention === convention} disabled={disabled} onPress={() => onChange({ ...load, convention })} />)}</View>
      <TextInput accessibilityLabel={`Equipment label for ${context}`} placeholder="Equipment label, e.g. Home barbell" placeholderTextColor={colors.mutedText} value={load.equipmentKey} maxLength={80}
        editable={!disabled} onChangeText={(equipmentKey) => onChange({ ...load, equipmentKey })} style={coachStyles.input} />
    </> : null}
  </View>;
}
export const themedCoachStyles = createThemedStyles((colors, ui) => ({
  card: { ...ui.group, padding: 20, gap: 14, marginVertical: 12 },
  eyebrow: { color: colors.mutedText, fontSize: 11, fontWeight: "500", letterSpacing: 0.7 },
  title: { color: colors.text, fontSize: 20, fontWeight: "700" }, copy: { color: colors.secondaryText, fontSize: 13, lineHeight: 20 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: "transparent", borderRadius: 10, justifyContent: "center" },
  input: { ...ui.input, minHeight: 48, padding: 12, color: colors.text, fontSize: 16 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 }
}));
