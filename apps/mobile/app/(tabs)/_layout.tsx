import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useAppTheme } from "../../src/theme/ThemeProvider";

type TabIconName = keyof typeof Ionicons.glyphMap;

const tabIcons: Record<string, TabIconName> = {
  workouts: "barbell-outline",
  exercises: "search-outline",
  programs: "calendar-outline",
  progress: "trending-up-outline",
  profile: "person-circle-outline"
};

export default function TabLayout() {
  const theme = useAppTheme();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.mutedText,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 0.5,
          height: 84,
          paddingBottom: 14,
          paddingTop: 10
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          lineHeight: 13
        },
        tabBarItemStyle: {
          minWidth: 68,
          paddingHorizontal: 0
        },
        tabBarIcon: ({ color }) => (
          <Ionicons name={tabIcons[route.name] ?? "ellipse-outline"} size={22} color={color} />
        )
      })}
    >
      <Tabs.Screen name="workouts" options={{ title: "Session" }} />
      <Tabs.Screen name="exercises" options={{ title: "Exercises" }} />
      <Tabs.Screen name="programs" options={{ title: "Programs" }} />
      <Tabs.Screen name="progress" options={{ title: "Progress" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
