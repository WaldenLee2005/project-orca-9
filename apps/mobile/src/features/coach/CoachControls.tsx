import { useThemeStyles } from "../../theme/ThemeProvider";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { createThemedStyles } from "../../theme/designSystem";
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
export function LoadCoachingToggle({ enabled, onChange, disabled = false, scope }: { enabled: boolean; onChange: (enabled: boolean) => void; disabled?: boolean; scope: "program" | "session" }) {
  const { styles: s, colors } = useThemeStyles(themedCoachStyles);
  return <View style={s.toggleCard}>
    <View style={s.toggleRow}>
      <View style={{ flex: 1, gap: 3 }}><Text style={s.toggleLabel}>Load coaching</Text>
        <Text style={s.copy}>{scope === "program" ? "For every session in this program" : "For this entire session"}</Text></View>
      <Switch accessibilityLabel={`Load coaching for this ${scope}`} value={enabled} disabled={disabled} onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accent }} />
    </View>
    {enabled ? <Text style={s.copy}>Optional local prototype. Review suggestions before applying them; your actual sets remain yours to record.</Text> : null}
  </View>;
}
export const themedCoachStyles = createThemedStyles((colors, ui) => ({
  card: { ...ui.group, padding: 20, gap: 14, marginVertical: 12 },
  eyebrow: { color: colors.mutedText, fontSize: 11, fontWeight: "500", letterSpacing: 0.7 },
  title: { color: colors.text, fontSize: 20, fontWeight: "700" }, copy: { color: colors.secondaryText, fontSize: 13, lineHeight: 20 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: "transparent", borderRadius: 10, justifyContent: "center" },
  input: { ...ui.input, minHeight: 48, padding: 12, color: colors.text, fontSize: 16 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  toggleCard: { ...ui.group, padding: 16, gap: 10, marginTop: 14 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleLabel: { color: colors.text, fontSize: 15, fontWeight: "600" }
}));
