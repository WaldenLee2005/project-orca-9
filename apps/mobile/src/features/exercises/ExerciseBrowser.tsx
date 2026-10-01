import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { sessionExercises, type CatalogExercise } from "../workouts/repdbSessionExercises";
import { useAppTheme, useThemeStyles } from "../../theme/ThemeProvider";
import { filterExercises } from "./exerciseSearch";
import { createThemedStyles } from "../../theme/designSystem";

const categories = [...new Set(sessionExercises.map((exercise) => exercise.category))].sort();
const equipmentOptions = [...new Set(sessionExercises.map((exercise) => exercise.equipment))].sort();

export function RepDbCredit() {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const theme = useAppTheme();
  return (
    <Text accessibilityRole="link" onPress={() => Linking.openURL("https://repdb.co/free-exercise-dataset")}
      style={[styles.credit, { color: theme.colors.secondaryText }]}>
      Exercise data by RepDB (repdb.co)
    </Text>
  );
}

export function ExerciseBrowser({ header, onSelect, addedCounts, initialQuery = "" }: { header: ReactNode; onSelect: (exercise: CatalogExercise) => void; addedCounts?: Record<string, number>; initialQuery?: string }) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const theme = useAppTheme();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const results = useMemo(() => filterExercises(sessionExercises, query, category, equipment), [query, category, equipment]);
  function resetSearch() { setQuery(""); setCategory(null); setEquipment(null); }

  return (
    <FlatList style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}
      data={results} keyExtractor={(exercise) => exercise.id}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={8} maxToRenderPerBatch={10} windowSize={5}
      ListHeaderComponent={
        <View style={styles.header}>
          {header}
          <View style={[styles.searchRow, { borderColor: isSearchFocused ? theme.colors.accent : "transparent" }]}>
            <Ionicons name="search-outline" size={20} color={theme.colors.secondaryText} />
            <TextInput accessibilityLabel="Search exercises" placeholder="Name, muscle, or equipment"
              placeholderTextColor={theme.colors.mutedText} value={query} onChangeText={setQuery}
              onFocus={() => setIsSearchFocused(true)} onBlur={() => setIsSearchFocused(false)}
              autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={[styles.input, { color: theme.colors.text }]} />
            {query ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")} style={styles.iconButton}>
                <Ionicons name="close-circle" size={20} color={theme.colors.secondaryText} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.tools}>
            <Text accessibilityLiveRegion="polite" style={[styles.count, { color: theme.colors.secondaryText }]}>{results.length} of {sessionExercises.length} exercises</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }}
              onPress={() => setShowFilters((value) => !value)} style={styles.filterButton}>
              <Ionicons name="options-outline" size={18} color={theme.colors.text} />
              <Text style={[styles.label, { color: theme.colors.text }]}>Filters{category || equipment ? " •" : ""}</Text>
            </Pressable>
          </View>
          {showFilters ? (
            <View style={styles.filters}>
              <FilterRow title="Muscle group" allLabel="All muscles" options={categories} selected={category} onSelect={setCategory} />
              <FilterRow title="Equipment" allLabel="All equipment" options={equipmentOptions} selected={equipment} onSelect={setEquipment} />
            </View>
          ) : null}
          {category || equipment ? (
            <Pressable accessibilityRole="button" onPress={resetSearch} style={styles.resetButton}>
              <Text style={[styles.label, { color: theme.colors.text }]}>Clear search & filters</Text>
            </Pressable>
          ) : null}
          <RepDbCredit />
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No exercises found</Text>
          <Text style={[styles.emptyCopy, { color: theme.colors.secondaryText }]}>Try another name, muscle, or equipment, or clear your filters.</Text>
          <Pressable accessibilityRole="button" onPress={resetSearch} style={styles.resetButton}>
            <Text style={[styles.label, { color: theme.colors.text }]}>Reset search</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item, index }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}${addedCounts?.[item.id] ? `, ${addedCounts[item.id]} added` : ""}`} onPress={() => onSelect(item)}
          style={({ pressed }) => [styles.card, index === 0 && styles.firstRow, index === results.length - 1 && styles.lastRow, { opacity: pressed ? 0.75 : 1 }]}>
          <View style={styles.imagePanel}><Image source={item.image} resizeMode="contain" style={styles.image} /></View>
          <View style={styles.cardCopy}>
            <Text style={[styles.name, { color: theme.colors.text }]}>{item.name}</Text>
            <Text style={[styles.meta, { color: theme.colors.secondaryText }]}>{item.category} · {item.equipment}</Text>
          </View>
          {addedCounts?.[item.id] ? <View style={styles.addedBadge}><Ionicons name="checkmark" size={16} color={colors.accent} /><Text style={styles.addedText}>{addedCounts[item.id] > 1 ? `×${addedCounts[item.id]}` : "Added"}</Text></View> : <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />}
        </Pressable>
      )}
    />
  );
}

function FilterRow({ title, allLabel, options, selected, onSelect }: {
  title: string; allLabel: string; options: string[]; selected: string | null; onSelect: (value: string | null) => void;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const theme = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.label, { color: theme.colors.secondaryText }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
        {[null, ...options].map((option) => (
          <Pressable key={option ?? "all"} accessibilityRole="button" accessibilityState={{ selected: selected === option }}
            onPress={() => onSelect(option)} style={[styles.chip, { borderColor: theme.colors.border,
              backgroundColor: selected === option ? theme.colors.accentSoft : theme.colors.surface }]}>
            <Text style={[styles.label, { color: selected === option ? theme.colors.accent : theme.colors.text }]}>{option ?? allLabel}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const themedStyles = createThemedStyles((colors, ui) => ({
  content: { ...ui.content },
  header: { gap: 14, marginBottom: 20 },
  searchRow: { ...ui.control, flexDirection: "row", alignItems: "center", borderWidth: 1.5, paddingLeft: 14, minHeight: 48 },
  input: { flex: 1, minWidth: 0, fontSize: 16, padding: 12 },
  iconButton: { alignItems: "center", justifyContent: "center", width: 44, height: 44 },
  tools: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 6 },
  filterButton: { ...ui.control, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 14 },
  label: { fontSize: 12, fontWeight: "600" }, count: { fontSize: 12, color: colors.secondaryText }, filters: { gap: 16 },
  chip: { ...ui.control, borderWidth: 0, minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: 14, marginVertical: 6 },
  credit: { fontSize: 11, textDecorationLine: "underline", paddingVertical: 8 },
  row: { gap: 14, marginBottom: 22 },
  card: { backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, minHeight: 88 },
  firstRow: { borderTopLeftRadius: 16, borderTopRightRadius: 16 }, lastRow: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderBottomWidth: 0 },
  addedBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  addedText: { color: colors.accent, fontSize: 11, fontWeight: "500" },
  imagePanel: { width: 56, height: 56, backgroundColor: colors.surfaceInset, borderRadius: 10, overflow: "hidden" }, image: { width: "100%", height: "100%" },
  cardCopy: { flex: 1, minWidth: 0, gap: 5 }, name: { fontSize: 16, fontWeight: "500", lineHeight: 22 }, meta: { fontSize: 12, lineHeight: 18 },
  empty: { ...ui.input, alignItems: "center", padding: 28, gap: 12 }, emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptyCopy: { fontSize: 14, lineHeight: 22, textAlign: "center" }, resetButton: { minHeight: 44, justifyContent: "center" }
}));
