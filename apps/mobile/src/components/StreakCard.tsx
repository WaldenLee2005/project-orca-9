import { useThemeStyles } from "../theme/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getDateKey, type StreakSummary } from "../storage/streaksRepository";
import { createThemedStyles } from "../theme/designSystem";

export function StreakCard({ streak, onRest }: { streak: StreakSummary | null; onRest: () => void }) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const activeDays = streak?.currentActiveDays ?? 0;
  const restDays = streak?.currentRestDays ?? 0;
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    return { key: getDateKey(date), label: date.toLocaleDateString("en-US", { weekday: "narrow" }), active: streak?.activeDates.includes(getDateKey(date)) };
  });
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flame}><Ionicons name="flame-outline" size={24} color={colors.warm} /></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.label}>Your consistency</Text>
          <Text style={styles.value}>{streak?.currentStreak ?? 0}<Text style={styles.unit}> day streak</Text></Text>
          <Text style={styles.breakdown} accessibilityLabel={`${activeDays} active day${activeDays === 1 ? "" : "s"} and ${restDays} rest day${restDays === 1 ? "" : "s"} in your current streak`}>
            ({activeDays} active / {restDays} rest)
          </Text>
        </View>
      </View>
      <View style={styles.week}>
        {week.map((day) => (
          <View key={day.key} style={styles.day} accessibilityLabel={`${day.key}${day.active ? ": streak maintained" : ": no activity logged"}`}>
            <View style={[styles.dayDot, day.active && { backgroundColor: colors.accent, boxShadow: "none" }, day.key === getDateKey(today) && { borderColor: colors.accent, borderWidth: 1.5 }]}>
              {day.active ? <Ionicons name="checkmark" size={16} color={colors.onAccent} /> : <View style={styles.dot} />}
            </View>
            <Text style={styles.dayLabel}>{day.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.footer}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.note}>{streak?.todayStatus === "rest" ? "Today is for recovery." : "Rest days count, too."}</Text>
          <Text style={styles.small}>Planned recovery protects your streak.</Text>
        </View>
        {streak?.todayStatus === "open" ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Mark rest day" onPress={onRest} style={({ pressed }) => [styles.restButton, pressed && ui.input]}>
            <Ionicons name="leaf-outline" size={16} color={colors.accent} />
            <Text style={styles.restText}>Rest day</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const themedStyles = createThemedStyles((colors, ui) => ({
  card: { ...ui.group, padding: 18, marginTop: 16, width: "100%" },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  flame: { height: 36, width: 28, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, fontWeight: "500", color: colors.secondaryText },
  value: { fontSize: 24, fontWeight: "600", letterSpacing: -0.5, color: colors.text },
  unit: { fontSize: 17, fontWeight: "500", letterSpacing: -0.3 },
  breakdown: { fontSize: 12, lineHeight: 17, color: colors.mutedText },
  week: { flexDirection: "row", justifyContent: "space-between", marginTop: 24, marginBottom: 22 },
  day: { alignItems: "center", gap: 8 },
  dayDot: { ...ui.input, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border },
  dayLabel: { fontSize: 11, color: colors.secondaryText, fontWeight: "600" },
  footer: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  note: { fontSize: 12, fontWeight: "600", color: colors.accent },
  small: { fontSize: 11, lineHeight: 16, color: colors.secondaryText },
  restButton: { ...ui.control, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12 },
  restText: { color: colors.accent, fontSize: 12, fontWeight: "700" }
}));
