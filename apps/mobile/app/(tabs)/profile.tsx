import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { PageScaffold } from "../../src/components/PageScaffold";
import { useAppTheme } from "../../src/theme/ThemeProvider";

export default function ProfileScreen() {
  const theme = useAppTheme();

  return (
    <View style={{ flex: 1 }}>
      <PageScaffold
        eyebrow="You"
        title="Profile"
        description="Goals, gear, schedule."
        actions={["Goals", "Equipment"]}
        highlights={["Name", "Level", "Schedule"]}
      />
      <Link href="/onboarding" asChild>
        <Text style={[styles.link, { color: theme.colors.accent, borderColor: theme.colors.border }]}>Onboarding</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    bottom: 104,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    fontWeight: "900",
    left: "50%",
    minHeight: 48,
    minWidth: 184,
    paddingHorizontal: 18,
    paddingVertical: 13,
    position: "absolute",
    textAlign: "center",
    textTransform: "uppercase",
    transform: [{ translateX: -92 }]
  }
});
