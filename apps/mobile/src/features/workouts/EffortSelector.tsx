import { Pressable, Text, View } from "react-native";
import type { WorkoutSet } from "../../storage/workoutsRepository";
import { useThemeStyles } from "../../theme/ThemeProvider";
import { createThemedStyles } from "../../theme/designSystem";

const options = [[null, "Skip"], ["easy", "Easy"], ["moderate", "Right"], ["hard", "Hard"]] as const;

export function EffortSelector({ value, onChange, setNumber, disabled = false }: {
  value: WorkoutSet["effort"]; onChange: (value: WorkoutSet["effort"]) => void; setNumber: number; disabled?: boolean;
}) {
  const { styles, colors } = useThemeStyles(themedStyles);
  return <View style={styles.field}>
    <Text style={styles.label}>Effort · optional</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel={`Effort for set ${setNumber}`} style={[styles.track, disabled && styles.disabled]}>
      {options.map(([effort, label]) => {
        const selected = (value ?? null) === effort;
        return <Pressable key={String(effort)} accessibilityRole="radio" accessibilityLabel={`${effort === "moderate" ? "About right" : label} effort for set ${setNumber}`}
          accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => onChange(effort)}
          style={({ pressed }) => [styles.option, selected && styles.selected, pressed && { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.optionText, selected && { color: colors.accent }]}>{label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const themedStyles = createThemedStyles((colors) => ({
  field: { gap: 6 }, label: { color: colors.secondaryText, fontSize: 12, lineHeight: 18 },
  track: { flexDirection: "row", backgroundColor: colors.surfaceInset, borderRadius: 10, padding: 3, gap: 2 },
  option: { flex: 1, minWidth: 0, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  selected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  optionText: { color: colors.secondaryText, fontSize: 13, fontWeight: "600" }, disabled: { opacity: 0.45 }
}));
