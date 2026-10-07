import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../../src/theme/ThemeProvider";

type TabIconName = keyof typeof Ionicons.glyphMap;

const tabIcons: Record<string, TabIconName> = {
  workouts: "barbell-outline",
  exercises: "search-outline",
  programs: "calendar-outline",
  progress: "trending-up-outline",
  feed: "people-outline",
  profile: "person-outline"
};

export default function TabLayout() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.mutedText,
        tabBarLabelPosition: "below-icon",
        tabBarStyle: {
          boxShadow: "none",
          elevation: 0,
          shadowOpacity: 0,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 58 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6
        },
        tabBarIconStyle: {
          height: 26,
          marginBottom: 3
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
          lineHeight: 13
        },
        tabBarItemStyle: {
          minWidth: 48,
          paddingHorizontal: 0
        },
        tabBarIcon: ({ color }) => (
          <Ionicons name={tabIcons[route.name] ?? "ellipse-outline"} size={23} color={color} />
        )
      })}
    >
      <Tabs.Screen name="workouts" options={{ title: "Session" }} />
      <Tabs.Screen name="exercises" options={{ title: "Exercises" }} />
      <Tabs.Screen name="programs" options={{ title: "Programs" }} />
      <Tabs.Screen name="progress" options={{ title: "Progress" }} />
      <Tabs.Screen name="feed" options={{ title: "Feed" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
