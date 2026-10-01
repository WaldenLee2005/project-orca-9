import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ExerciseBrowser, RepDbCredit } from "../../src/features/exercises/ExerciseBrowser";
import type { CatalogExercise } from "../../src/features/workouts/repdbSessionExercises";
import { useAppTheme, useThemeStyles } from "../../src/theme/ThemeProvider";
import { createThemedStyles } from "../../src/theme/designSystem";
import { ScreenHeading } from "../../src/components/ScreenHeading";

export default function ExercisesScreen() {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const theme = useAppTheme();
  const router = useRouter();
  const [selected, setSelected] = useState<CatalogExercise | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flex: 1, display: selected ? "none" : "flex" }}>
        <ExerciseBrowser onSelect={setSelected} header={
          <ScreenHeading eyebrow="Orca · Library" title="Exercises" subtitle="Search by name, muscle, or equipment." />
        } />
      </View>
      {selected ? (
        <ScrollView contentContainerStyle={styles.detail} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
            <Text style={[styles.eyebrow, { color: theme.colors.text }]}>Exercise search</Text>
          </Pressable>
          <View style={styles.imagePanel}><Image source={selected.image} resizeMode="contain" style={styles.image} /></View>
          <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>{selected.category} · {selected.equipment}</Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>{selected.name}</Text>
          <Text style={[styles.copy, { color: theme.colors.secondaryText }]}>{selected.description}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.navigate({ pathname: "/workouts", params: { exerciseId: selected.id } })}
            style={[styles.primaryButton, { backgroundColor: theme.colors.accent }]}>
            <Text style={[styles.eyebrow, { color: theme.colors.onAccent }]}>Use in Session</Text>
          </Pressable>
          <Text style={[styles.eyebrow, { color: theme.colors.text }]}>How to perform</Text>
          {selected.instructions.map((instruction, index) => (
            <Text key={index} style={[styles.copy, { color: theme.colors.secondaryText }]}>{index + 1}. {instruction}</Text>
          ))}
          <RepDbCredit />
        </ScrollView>
      ) : null}
    </View>
  );
}

const themedStyles = createThemedStyles((colors, ui) => ({
  eyebrow: { fontSize: 12, fontWeight: "600", color: colors.accent },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "600", letterSpacing: -0.7 },
  copy: { fontSize: 14, lineHeight: 21 },
  detail: { ...ui.content, gap: 20, maxWidth: 700 },
  back: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  imagePanel: { ...ui.group, aspectRatio: 1.5, maxHeight: 320, padding: 10 }, image: { width: "100%", height: "100%", borderRadius: 18 },
  primaryButton: { ...ui.primary, minHeight: 54, justifyContent: "center", alignItems: "center", padding: 16 }
}));
