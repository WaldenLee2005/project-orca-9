import { createThemedStyles } from "../theme/designSystem";
import { StyleSheet, Text, View } from "react-native";
import { useAppTheme, useThemeStyles } from "../theme/ThemeProvider";

type PageScaffoldProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions: string[];
  highlights: string[];
};

export function PageScaffold({ eyebrow, title, description, actions, highlights }: PageScaffoldProps) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const theme = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>{eyebrow}</Text>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.description, { color: theme.colors.secondaryText }]}>{description}</Text>
      </View>

      <View style={styles.actionRow}>
        {actions.map((action, index) => (
          <View
            key={action}
            style={[
              styles.actionButton,
              {
                backgroundColor: index === 0 ? theme.colors.accent : theme.colors.background,
                borderColor: theme.colors.border
              }
            ]}
          >
            <Text style={[styles.actionText, { color: index === 0 ? theme.colors.onAccent : theme.colors.text }]}>
              {action}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.panel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        {highlights.map((item, index) => (
          <View
            key={item}
            style={[
              styles.highlightRow,
              {
                borderTopColor: theme.colors.border,
                borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth
              }
            ]}
          >
            <Text style={[styles.highlightText, { color: theme.colors.secondaryText }]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const themedStyles = createThemedStyles((colors, ui) => ({
  actionButton: {
    ...ui.control,
    alignItems: "center",
    borderWidth: 0,
    borderRadius: 18,
    minHeight: 50,
    justifyContent: "center",
    minWidth: 188,
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginTop: 30,
    width: "100%"
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    textTransform: "none"
  },
  container: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 112,
    paddingTop: 28,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
    maxWidth: 340,
    textAlign: "center"
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0,
    textAlign: "center",
    textTransform: "none"
  },
  header: {
    alignItems: "center",
    maxWidth: 520,
    width: "100%"
  },
  highlightRow: {
    alignItems: "center",
    paddingVertical: 18,
    width: "100%"
  },
  highlightText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
    textTransform: "none"
  },
  panel: {
    ...ui.group,
    borderRadius: 0,
    borderWidth: 0,
    marginTop: 30,
    maxWidth: 360,
    paddingHorizontal: 20,
    width: "100%"
  },
  title: {
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: 0,
    marginTop: 10,
    textAlign: "center",
    textTransform: "none"
  }
}));
