import { useThemeStyles } from "../../theme/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createLocalId } from "../../storage/database";
import { createThemedStyles } from "../../theme/designSystem";
import { getDaySlotLabel, localDateKey, PROGRAM_DAY_CHOICES, PROGRAM_LIMITS, type ProgramDay, type ProgramDraft, type ProgramSchedule } from "./programModel";

export function emptyProgramDay(): ProgramDay { return { id: createLocalId("program-day"), name: "", kind: "rest", exercises: [] }; }

const kindLabels = { training: "Training", rest: "Rest" };
export function ProgramDayPicker({ program, selectedIndex, onSelect, disabled }: {
  program: ProgramDraft; selectedIndex: number; onSelect: (index: number) => void; disabled?: boolean;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  return <View style={styles.days}>{program.days.map((day, index) => {
    const selected = index === selectedIndex;
    return <Pressable key={day.id} accessibilityRole="button" accessibilityLabel={`${getDaySlotLabel(program.schedule.mode, index)}, ${kindLabels[day.kind]}`}
      accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onSelect(index)}
      style={[styles.day, selected && styles.selectedDay, disabled && { opacity: 0.5 }]}>
      <Text style={[styles.dayLabel, selected && { color: colors.onAccent }]}>{program.schedule.mode === "weekly" ? getDaySlotLabel("weekly", index).slice(0, 3) : `Day ${index + 1}`}</Text>
      <Ionicons name={day.kind === "training" ? "barbell-outline" : "leaf-outline"} size={18} color={selected ? colors.onAccent : colors.accent} />
      <Text style={[styles.dayKind, selected && { color: colors.onAccent }]}>{day.kind === "training" ? "LIFT" : "REST"}</Text>
    </Pressable>;
  })}</View>;
}

export function ProgramScheduleEditor({ draft, onChange, selectedIndex, onSelect, disabled }: {
  draft: ProgramDraft; onChange: (draft: ProgramDraft) => void; selectedIndex: number; onSelect: (index: number) => void; disabled: boolean;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const [pending, setPending] = useState<{ mode: ProgramSchedule["mode"]; count: number } | null>(null);
  const day = draft.days[selectedIndex];
  function apply(next: ProgramDraft) { onChange(next); onSelect(Math.min(selectedIndex, next.days.length - 1)); setPending(null); }
  function resize(mode: ProgramSchedule["mode"], count: number) {
    if (disabled || pending || count < 1 || count > PROGRAM_LIMITS.days) return;
    const days = Array.from({ length: count }, (_, index) => draft.days[index] ?? emptyProgramDay());
    const next = { ...draft, schedule: { ...draft.schedule, mode }, days };
    if (draft.days.slice(count).some((item) => item.kind !== "rest" || item.name || item.exercises.length)) setPending({ mode, count });
    else apply(next);
  }
  function changeDay(update: Partial<ProgramDay>) { onChange({ ...draft, days: draft.days.map((item, index) => index === selectedIndex ? { ...item, ...update } : item) }); }
  return <View style={styles.editor}>
    <Text style={styles.heading}>Schedule</Text>
    <View style={styles.choices}>
      <Choice label="Weekdays" selected={draft.schedule.mode === "weekly"} disabled={disabled || Boolean(pending)} onPress={() => resize("weekly", 7)} />
      <Choice label="Repeating cycle" selected={draft.schedule.mode === "cycle"} disabled={disabled || Boolean(pending)} onPress={() => resize("cycle", draft.days.length)} />
    </View>
    <Text style={styles.caption}>{draft.schedule.mode === "weekly" ? "Repeat on the same weekdays each week." : "Repeat in order, independent of weekdays. Day 1 starts on the date below."}</Text>
    {draft.schedule.mode === "cycle" ? <View style={styles.cycleControl}>
      <Pressable accessibilityRole="button" accessibilityLabel="Shorter cycle" disabled={disabled || Boolean(pending) || draft.days.length === 1} onPress={() => resize("cycle", draft.days.length - 1)} style={styles.stepper}><Ionicons name="remove" color={colors.accent} size={22} /></Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.cycleCount}>Every {draft.days.length} {draft.days.length === 1 ? "day" : "days"}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Longer cycle" disabled={disabled || Boolean(pending) || draft.days.length === PROGRAM_LIMITS.days} onPress={() => resize("cycle", draft.days.length + 1)} style={styles.stepper}><Ionicons name="add" color={colors.accent} size={22} /></Pressable>
    </View> : null}
    {pending ? <View style={styles.warning}>
      <Text style={styles.body}>Shortening this schedule removes {pending.count + 1 === draft.days.length ? `day ${draft.days.length}` : `days ${pending.count + 1}–${draft.days.length}`} from this draft, including exercises.</Text>
      <Choice label="Remove those days" selected={false} disabled={disabled} onPress={() => apply({ ...draft, schedule: { ...draft.schedule, mode: pending.mode }, days: draft.days.slice(0, pending.count) })} />
      <Choice label="Keep all days" selected={false} disabled={disabled} onPress={() => setPending(null)} />
    </View> : null}
    <Text style={styles.label}>{draft.schedule.mode === "cycle" ? "Day 1 date" : "Schedule start date"}</Text>
    <View style={styles.dateRow}>
      <TextInput accessibilityLabel="Schedule start date" value={draft.schedule.startDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedText} maxLength={10}
        autoCapitalize="none" autoCorrect={false} editable={!disabled && !pending} onChangeText={(startDate) => onChange({ ...draft, schedule: { ...draft.schedule, startDate } })}
        style={[styles.input, { flex: 1, minWidth: 0 }]} selectionColor={colors.accent} />
      <Pressable accessibilityRole="button" accessibilityLabel="Start date today" disabled={disabled || Boolean(pending)} onPress={() => onChange({ ...draft, schedule: { ...draft.schedule, startDate: localDateKey() } })} style={styles.today}><Text style={styles.todayText}>Today</Text></Pressable>
    </View>
    <Text style={styles.caption}>YYYY-MM-DD · Rest protection begins when you follow this schedule, never before its start date.</Text>
    <Text style={[styles.heading, { marginTop: 10 }]}>Build each day</Text>
    <Text style={styles.caption}>Choose Training or Rest for each day. New days start as Rest.</Text>
    <ProgramDayPicker program={draft} selectedIndex={selectedIndex} onSelect={onSelect} disabled={disabled || Boolean(pending)} />
    <View style={styles.dayPanel}>
      <Text style={styles.heading}>{getDaySlotLabel(draft.schedule.mode, selectedIndex)}</Text>
      <View style={styles.choices}>
        {PROGRAM_DAY_CHOICES.map((kind) => <Choice key={kind} label={kindLabels[kind]} selected={day.kind === kind} disabled={disabled || Boolean(pending)} onPress={() => changeDay({ kind })} />)}
      </View>
      {day.kind === "training" ? <>
        <Text style={styles.label}>Day name (optional)</Text>
        <TextInput accessibilityLabel="Training day name" value={day.name} onChangeText={(name) => changeDay({ name })} placeholder="e.g. Upper body" placeholderTextColor={colors.mutedText}
          maxLength={PROGRAM_LIMITS.name} editable={!disabled && !pending} selectionColor={colors.accent} style={styles.input} />
      </> : <Text style={styles.body}>Planned recovery. This day automatically protects your streak while this is your active schedule.{day.exercises.length ? " Your exercises are kept here if you switch back to Training." : ""}</Text>}
    </View>
  </View>;
}

function Choice({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled: boolean }) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} onPress={onPress} disabled={disabled}
    style={[styles.choice, selected && styles.selectedDay, disabled && { opacity: 0.45 }]}>
    <Text style={[styles.choiceText, selected && { color: colors.onAccent }]}>{label}</Text>
  </Pressable>;
}

const themedStyles = createThemedStyles((colors, ui) => ({
  editor: { gap: 14, marginTop: 28 }, heading: { color: colors.text, fontSize: 20, fontWeight: "600" },
  caption: { color: colors.secondaryText, fontSize: 12, lineHeight: 19 }, body: { color: colors.secondaryText, fontSize: 13, lineHeight: 21 },
  label: { color: colors.secondaryText, fontSize: 13, fontWeight: "600" }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choice: { ...ui.control, minHeight: 46, paddingHorizontal: 15, paddingVertical: 13, alignItems: "center", justifyContent: "center", flexGrow: 1 },
  choiceText: { color: colors.text, fontSize: 13, fontWeight: "700" }, selectedDay: { backgroundColor: colors.accent, boxShadow: "none", borderColor: colors.accent },
  days: { flexDirection: "row", flexWrap: "wrap", gap: 4 }, day: { ...ui.input, borderWidth: 0, borderRadius: 10, flexBasis: 44, flexGrow: 1, minHeight: 76, paddingVertical: 10, paddingHorizontal: 4, alignItems: "center", gap: 6 },
  dayLabel: { color: colors.text, fontSize: 12, fontWeight: "600" }, dayKind: { color: colors.secondaryText, fontSize: 11, fontWeight: "500" },
  cycleControl: { ...ui.input, padding: 8, flexDirection: "row", alignItems: "center", gap: 12 }, cycleCount: { flex: 1, textAlign: "center", color: colors.text, fontSize: 17, fontWeight: "600" },
  stepper: { width: 48, height: 46, alignItems: "center", justifyContent: "center" },
  input: { ...ui.input, color: colors.text, fontSize: 16, minHeight: 54, padding: 16 }, dateRow: { flexDirection: "row", gap: 10 },
  today: { ...ui.control, paddingHorizontal: 15, justifyContent: "center" }, todayText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  dayPanel: { ...ui.group, padding: 18, gap: 16, marginTop: 4 }, warning: { ...ui.input, padding: 18, gap: 14 }
}));
