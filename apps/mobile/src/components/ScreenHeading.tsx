import { useThemeStyles } from "../theme/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { createThemedStyles } from "../theme/designSystem";

export function ScreenHeading({ eyebrow, title, subtitle }: {
  eyebrow: string; title: string; subtitle?: string; icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const themedStyles = createThemedStyles((colors, ui) => ({
  header: { gap: 7, marginBottom: 24 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  eyebrow: { color: colors.mutedText, fontSize: 12, fontWeight: "500", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { fontSize: 34, lineHeight: 41, letterSpacing: -0.8, color: colors.text, fontWeight: "700" },
  subtitle: { color: colors.secondaryText, fontSize: 15, lineHeight: 23, maxWidth: 440 }
}));
