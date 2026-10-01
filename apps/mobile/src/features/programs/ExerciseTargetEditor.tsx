import { useThemeStyles } from "../../theme/ThemeProvider";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { createThemedStyles } from "../../theme/designSystem";
import { PROGRAM_LIMITS, stepGoalValue, changeExerciseTargetKind, type ExerciseTarget } from "./programModel";

export function NumberField({ label, value, onChange, min = 1, max, disabled = false, exerciseContext }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max: number; disabled?: boolean; exerciseContext?: string;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const invalid = !Number.isInteger(value) || value < min || value > max;
  const inputLabel = exerciseContext ? `${label} for ${exerciseContext}` : label;
  const decreaseDisabled = disabled || value <= min;
  const increaseDisabled = disabled || value >= max;
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={[styles.stepper, invalid && styles.invalid]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${inputLabel.toLowerCase()}`} disabled={decreaseDisabled}
        onPress={() => onChange(stepGoalValue(value, -1, min, max))} style={styles.stepButton}>
        <Ionicons name="remove" size={18} color={decreaseDisabled ? colors.mutedText : colors.accent} />
      </Pressable>
      <TextInput accessibilityLabel={inputLabel} value={Number.isFinite(value) ? String(value) : ""} editable={!disabled}
        onChangeText={(text) => { if (/^\d{0,4}$/.test(text)) onChange(text === "" ? NaN : Number(text)); }}
        keyboardType="number-pad" inputMode="numeric" selectTextOnFocus maxLength={4}
        style={styles.input} selectionColor={colors.accent} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${inputLabel.toLowerCase()}`} disabled={increaseDisabled}
        onPress={() => onChange(stepGoalValue(value, 1, min, max))} style={styles.stepButton}>
        <Ionicons name="add" size={18} color={increaseDisabled ? colors.mutedText : colors.accent} />
      </Pressable>
    </View>
    {invalid ? <Text style={styles.error}>Choose {min}–{max}</Text> : null}
  </View>;
}

export function DurationFields({ seconds, onChange, disabled = false, context = "per set", exerciseContext }: {
  seconds: number; onChange: (value: number) => void; disabled?: boolean; context?: string; exerciseContext?: string;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const [parts, setParts] = useState(() => [Math.floor(seconds / 60), seconds % 60]);
  const lastSent = useRef(seconds);
  useEffect(() => {
    if (!Object.is(seconds, lastSent.current)) {
      setParts([Math.floor(seconds / 60), seconds % 60]);
      lastSent.current = seconds;
    }
  }, [seconds]);
  function update(index: number, value: number) {
    const next = [...parts]; next[index] = value; setParts(next);
    const validParts = Number.isInteger(next[0]) && next[0] >= 0 && next[0] <= 60 && Number.isInteger(next[1]) && next[1] >= 0 && next[1] <= 59;
    const total = validParts ? next[0] * 60 + next[1] : NaN;
    lastSent.current = total;
    onChange(total);
  }
  return <View style={styles.section}>
    <View style={styles.row}>
      <NumberField label={`Minutes ${context}`} exerciseContext={exerciseContext} min={0} max={60} value={parts[0]} disabled={disabled} onChange={(value) => update(0, value)} />
      <NumberField label={`Seconds ${context}`} exerciseContext={exerciseContext} min={0} max={59} value={parts[1]} disabled={disabled} onChange={(value) => update(1, value)} />
    </View>
    {!Number.isInteger(seconds) || seconds < 1 || seconds > PROGRAM_LIMITS.seconds ? <Text style={styles.error}>Choose 1 second–60 minutes per set.</Text> : null}
  </View>;
}

export function ExerciseTargetEditor({ value, onChange, disabled, context }: {
  value: ExerciseTarget; onChange: (value: ExerciseTarget) => void; disabled: boolean; context: string;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  function select(kind: ExerciseTarget["kind"]) {
    if (value.kind === kind) return;
    onChange(changeExerciseTargetKind(value, kind));
  }
  return <View style={styles.section}>
    <View style={styles.choices}>
      {([ ["reps", "Reps"], ["repRange", "Rep range"], ["duration", "Timed"] ] as const).map(([kind, label]) =>
        <Pressable key={kind} accessibilityRole="button" accessibilityLabel={`${label} target for ${context}`}
          accessibilityState={{ selected: value.kind === kind }} disabled={disabled} onPress={() => select(kind)}
          style={[styles.choice, value.kind === kind && styles.selected]}>
          <Text style={[styles.choiceText, value.kind === kind && { color: colors.accent }]}>{label}</Text>
        </Pressable>)}
    </View>
    {value.kind === "duration" ? <DurationFields seconds={value.seconds} onChange={(seconds) => onChange({ kind: "duration", seconds })} disabled={disabled} exerciseContext={context} /> :
      value.kind === "repRange" ? <>
        <View style={styles.row}>
          <NumberField label="Minimum reps" exerciseContext={context} value={value.min} max={PROGRAM_LIMITS.reps} disabled={disabled} onChange={(min) => onChange({ ...value, min })} />
          <NumberField label="Maximum reps" exerciseContext={context} value={value.max} max={PROGRAM_LIMITS.reps} disabled={disabled} onChange={(max) => onChange({ ...value, max })} />
        </View>
        {value.min > value.max ? <Text style={styles.error}>Minimum reps cannot exceed maximum reps.</Text> : null}
      </> : <NumberField label="Rep goal" exerciseContext={context} value={value.reps} max={PROGRAM_LIMITS.reps} disabled={disabled} onChange={(reps) => onChange({ ...value, reps })} />}
    <Text style={styles.hint}>Target for each set</Text>
  </View>;
}

const themedStyles = createThemedStyles((colors, ui) => ({
  section: { gap: 12 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, field: { flex: 1, minWidth: 132, gap: 8 },
  label: { color: colors.secondaryText, fontSize: 12, lineHeight: 18 },
  stepper: { ...ui.input, minHeight: 48, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "transparent" },
  stepButton: { width: 44, height: 46, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 0, paddingVertical: 10, textAlign: "center", color: colors.text, fontSize: 18, fontWeight: "700" },
  invalid: { borderColor: colors.danger }, error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, minHeight: 44, justifyContent: "center" },
  selected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  choiceText: { color: colors.secondaryText, fontSize: 12, fontWeight: "600" }, hint: { color: colors.mutedText, fontSize: 12 }
}));
