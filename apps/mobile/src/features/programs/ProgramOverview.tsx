import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeStyles } from "../../theme/ThemeProvider";
import { createThemedStyles } from "../../theme/designSystem";
import { formatProgramPrescription, getDaySlotLabel, getProgramDayName, type ProgramDay, type ProgramDraft, type TrainingProgram } from "./programModel";

type ProgramDaysOverviewProps = {
  program: ProgramDraft | TrainingProgram;
  todayIndex?: number;
  completedDayIds?: readonly string[];
  onStartDay?: (day: ProgramDay) => void;
  disabled?: boolean;
};

/** A read-only schedule; editing and activation belong to the program screen. */
export function ProgramDaysOverview({ program, todayIndex, completedDayIds = [], onStartDay, disabled = false }: ProgramDaysOverviewProps) {
  const { styles, colors } = useThemeStyles(themedStyles);
  return <View style={styles.days}>
    {program.days.map((day, index) => {
      const slot = getDaySlotLabel(program.schedule.mode, index);
      const name = getProgramDayName(program, day);
      const title = name === slot ? slot : `${slot} · ${name}`;
      return <View key={day.id} style={styles.day}>
        <View style={styles.dayHeading}>
          <Text accessibilityRole="header" style={styles.dayTitle}>{title}</Text>
          {todayIndex === index ? <Text style={styles.today}>Today</Text> : null}
          {completedDayIds.includes(day.id) ? <Text style={styles.today}>Completed today</Text> : null}
        </View>
        {day.kind === "rest" ? <View style={styles.rest}>
          <Ionicons name="moon-outline" size={17} color={colors.secondaryText} />
          <Text style={styles.restText}>Rest day · No exercises scheduled</Text>
        </View> : <View>
          {day.exercises.length ? day.exercises.map((entry, exerciseIndex) => <View key={entry.id} style={styles.exercise}>
            <Text style={styles.order}>{exerciseIndex + 1}</Text>
            <View style={styles.exerciseDetails}>
              <Text style={styles.exerciseName}>{entry.exerciseName}</Text>
              <Text style={styles.target}>{formatProgramPrescription(entry)}{entry.load ? ` · ${entry.load.weight} lb${entry.load.convention === "perHand" ? " / hand" : ""}` : ""}</Text>
            </View>
          </View>) : <Text style={styles.empty}>No exercises added yet.</Text>}
          {onStartDay && day.exercises.length && !completedDayIds.includes(day.id) ? <Pressable accessibilityRole="button" accessibilityLabel={`Start ${title}`} accessibilityState={{ disabled }}
            disabled={disabled} onPress={() => onStartDay(day)} style={({ pressed }) => [styles.start, { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]}>
            <Ionicons name="play-outline" size={17} color={colors.accent} /><Text style={styles.startText}>Start this day</Text>
          </Pressable> : null}
        </View>}
      </View>;
    })}
  </View>;
}

const themedStyles = createThemedStyles((colors, ui) => ({
  days: { gap: 12, marginTop: 20 },
  day: { ...ui.group, padding: 18 },
  dayHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 8 },
  dayTitle: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: "600", flexShrink: 1 },
  today: { color: colors.accent, backgroundColor: colors.accentSoft, overflow: "hidden", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  exercise: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  order: { width: 20, color: colors.mutedText, fontSize: 12, lineHeight: 21, textAlign: "center" },
  exerciseDetails: { flex: 1, minWidth: 0, gap: 3 },
  exerciseName: { color: colors.text, fontSize: 14, lineHeight: 21 },
  target: { color: colors.secondaryText, fontSize: 12, lineHeight: 19 },
  rest: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingTop: 2 },
  restText: { flex: 1, color: colors.secondaryText, fontSize: 13, lineHeight: 20 },
  empty: { color: colors.secondaryText, fontSize: 13, lineHeight: 20, paddingVertical: 10 },
  start: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 10, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  startText: { color: colors.accent, fontSize: 13, lineHeight: 20, fontWeight: "600" }
}));
