import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeStyles } from "../../theme/ThemeProvider";
import { createThemedStyles } from "../../theme/designSystem";
import { sessionExercises } from "../workouts/repdbSessionExercises";
import { ProgramDayPicker } from "./ProgramScheduleEditor";
import { formatProgramPrescription, getDaySlotLabel, localDateKey } from "./programModel";
import { createStarterProgram, STARTER_GUIDANCE, STARTER_PROGRAMS, starterSetSummary, type StarterProgram } from "./starterPrograms";

export function StarterProgramLibrary({ onUse, disabled }: { onUse: (starter: StarterProgram) => void; disabled: boolean }) {
  const { styles } = useThemeStyles(themedStyles);
  const [expanded, setExpanded] = useState<string | null>(null);
  return <View style={styles.library}>
    <Text accessibilityRole="header" style={styles.heading}>Starter programs</Text>
    <Text style={styles.caption}>Moderate-volume gym plans. Preview the schedule, then make an editable copy.</Text>
    <View style={styles.cards}>{STARTER_PROGRAMS.map((starter) => <StarterCard key={starter.id} starter={starter} expanded={expanded === starter.id}
      onToggle={() => setExpanded(expanded === starter.id ? null : starter.id)} onUse={() => onUse(starter)} disabled={disabled} />)}</View>
    <Text style={styles.caption}>With a program ON, scheduled rest days protect your streak without logging. A missed training day breaks it once that day ends.</Text>
  </View>;
}

function StarterCard({ starter, expanded, onToggle, onUse, disabled }: {
  starter: StarterProgram; expanded: boolean; onToggle: () => void; onUse: () => void; disabled: boolean;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const [selectedDay, setSelectedDay] = useState(0);
  // Preview IDs never leave this component. Only the Use action creates real IDs.
  const program = useMemo(() => {
    let id = 0;
    return createStarterProgram(starter.id, localDateKey(), sessionExercises, (prefix) => `preview-${starter.id}-${prefix}-${++id}`);
  }, [starter.id]);
  const day = program.days[selectedDay];
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${starter.name}`} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={onToggle}
      style={({ pressed }) => [styles.summary, { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{starter.name}</Text>
        <Text style={styles.caption}>{starter.cadence}</Text>
        <Text style={styles.caption}>{starterSetSummary(starter)}</Text>
      </View>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.accent} />
    </Pressable>
    {expanded ? <View style={styles.details}>
      <Text style={styles.frequency}>{starter.frequency}</Text>
      <Text style={styles.body}>{starter.description}</Text>
      <ProgramDayPicker program={program} selectedIndex={selectedDay} onSelect={setSelectedDay} disabled={disabled} />
      <Text style={styles.dayTitle}>{getDaySlotLabel(starter.mode, selectedDay)} · {day.name}</Text>
      {day.kind === "rest" ? <Text style={styles.body}>No logging needed. This day automatically protects your streak once this program is turned on.</Text> : <View>
        {day.exercises.map((entry) => <View key={entry.id} style={styles.exercise}>
          <Text style={styles.exerciseName}>{entry.exerciseName}</Text><Text style={styles.target}>{formatProgramPrescription(entry)}</Text>
        </View>)}
      </View>}
      <Text style={styles.caption}>{STARTER_GUIDANCE}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Use ${starter.name}`} accessibilityState={{ disabled }} disabled={disabled} onPress={onUse}
        style={({ pressed }) => [ui.primary, styles.use, { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}>
        <Text style={styles.useText}>Use this program</Text><Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
      </Pressable>
      <Text style={styles.caption}>Review the start date and save your copy. It stays OFF until you turn it on; then rest days protect your streak without logging.</Text>
    </View> : null}
  </View>;
}

const themedStyles = createThemedStyles((colors, ui) => ({
  library: { marginTop: 28, gap: 10 }, heading: { color: colors.text, fontSize: 21, fontWeight: "600", letterSpacing: -0.5 },
  cards: { gap: 12, marginTop: 4 }, card: { ...ui.group, overflow: "hidden" },
  summary: { minHeight: 88, padding: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  titleBlock: { flex: 1, minWidth: 0, gap: 5 }, title: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "600" },
  caption: { color: colors.secondaryText, fontSize: 12, lineHeight: 18 }, body: { color: colors.secondaryText, fontSize: 13, lineHeight: 21 },
  details: { paddingHorizontal: 18, paddingBottom: 18, gap: 16 }, frequency: { color: colors.accent, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  dayTitle: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: "600" },
  exercise: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  exerciseName: { flex: 1, minWidth: 0, color: colors.text, fontSize: 13, lineHeight: 20 },
  target: { flexShrink: 1, maxWidth: "44%", color: colors.secondaryText, fontSize: 12, lineHeight: 18, textAlign: "right" },
  use: { minHeight: 50, padding: 14, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  useText: { color: colors.onAccent, fontSize: 15, fontWeight: "600" }
}));
