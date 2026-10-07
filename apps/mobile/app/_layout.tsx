import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { DevDiagnosticsRoot } from "../src/dev/DevDiagnostics";
import { ThemeProvider, useAppTheme } from "../src/theme/ThemeProvider";
import { SafeAreaView } from "react-native-safe-area-context";
import { ReminderCoordinator } from "../src/features/reminders/ReminderCoordinator";
import { SocialFeedCoordinator } from "../src/features/social/SocialFeedCoordinator";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppNavigation />
    </ThemeProvider>
  );
}

function AppNavigation() {
  const { colors, isDark } = useAppTheme();
  return (
    <DevDiagnosticsRoot>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ReminderCoordinator />
      <SocialFeedCoordinator />
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background }
          }}
        />
      </SafeAreaView>
    </DevDiagnosticsRoot>
  );
}
