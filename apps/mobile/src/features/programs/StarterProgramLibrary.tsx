import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useThemeStyles } from "../../theme/ThemeProvider";
import { createThemedStyles } from "../../theme/designSystem";
import { STARTER_PROGRAMS, starterSetSummary, type StarterProgram } from "./starterPrograms";

export function StarterProgramLibrary({ onPreview, disabled }: { onPreview: (starter: StarterProgram) => void; disabled: boolean }) {
  const { styles } = useThemeStyles(themedStyles);
  return <View style={styles.library}>
    <Text accessibilityRole="header" style={styles.heading}>Starter programs</Text>
    <Text style={styles.caption}>Choose a plan to see its exercises and schedule.</Text>
    <View style={styles.cards}>{STARTER_PROGRAMS.map((starter) => <StarterCard key={starter.id} starter={starter}
      onPreview={() => onPreview(starter)} disabled={disabled} />)}</View>
  </View>;
}

function StarterCard({ starter, onPreview, disabled }: {
  starter: StarterProgram; onPreview: () => void; disabled: boolean;
}) {
  const { styles, colors } = useThemeStyles(themedStyles);
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${starter.name}`} accessibilityState={{ disabled }} disabled={disabled} onPress={onPreview}
      style={({ pressed }) => [styles.summary, { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{starter.name}</Text>
        <Text style={styles.caption}>{starter.cadence}</Text>
        <Text style={styles.caption}>{starterSetSummary(starter)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.accent} />
    </Pressable>
  </View>;
}

const themedStyles = createThemedStyles((colors, ui) => ({
  library: { marginTop: 28, gap: 10 }, heading: { color: colors.text, fontSize: 21, fontWeight: "600", letterSpacing: -0.5 },
  cards: { gap: 12, marginTop: 4 }, card: { ...ui.group, overflow: "hidden" },
  summary: { minHeight: 88, padding: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  titleBlock: { flex: 1, minWidth: 0, gap: 5 }, title: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "600" },
  caption: { color: colors.secondaryText, fontSize: 12, lineHeight: 18 }
}));
