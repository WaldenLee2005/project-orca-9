import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  SessionExercise,
  sessionExercises
} from "../../src/features/workouts/repdbSessionExercises";
import { useAppTheme } from "../../src/theme/ThemeProvider";

type SessionStep = "start" | "picker" | "logger";

export default function WorkoutsScreen() {
  const theme = useAppTheme();
  const [step, setStep] = useState<SessionStep>("start");
  const [selectedExercise, setSelectedExercise] = useState<SessionExercise | null>(null);
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(8);
  const [weight, setWeight] = useState(135);

  const categories = useMemo(() => {
    return sessionExercises.reduce<Record<string, SessionExercise[]>>((groups, exercise) => {
      groups[exercise.category] = [...(groups[exercise.category] ?? []), exercise];
      return groups;
    }, {});
  }, []);

  function selectExercise(exercise: SessionExercise) {
    setSelectedExercise(exercise);
    setStep("logger");
  }

  if (step === "start") {
    return (
      <View style={[styles.startContainer, { backgroundColor: theme.colors.background }]}>
        <View style={styles.startHeader}>
          <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>Today</Text>
          <Text style={[styles.startTitle, { color: theme.colors.text }]}>Session</Text>
          <Text style={[styles.startCopy, { color: theme.colors.secondaryText }]}>
            Start a lift, pick the movement, and log the working numbers.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => setStep("picker")}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: theme.colors.accent,
              opacity: pressed ? 0.82 : 1
            }
          ]}
        >
          <Ionicons name="play" size={18} color={theme.colors.onAccent} />
          <Text style={[styles.primaryButtonText, { color: theme.colors.onAccent }]}>Start Session</Text>
        </Pressable>

        <View style={[styles.startStats, { borderColor: theme.colors.border }]}>
          {["Warm up", "Choose lift", "Log sets"].map((item) => (
            <View key={item} style={styles.startStatItem}>
              <Text style={[styles.startStatText, { color: theme.colors.secondaryText }]}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (step === "logger" && selectedExercise) {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.loggerContent}
      >
        <Pressable accessibilityRole="button" onPress={() => setStep("picker")} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
          <Text style={[styles.backText, { color: theme.colors.text }]}>Exercises</Text>
        </Pressable>

        <View style={styles.detailHero}>
          <View style={styles.detailImagePanel}>
            <Image source={selectedExercise.image} resizeMode="contain" style={styles.detailImage} />
          </View>
          <View style={styles.heroText}>
            <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>{selectedExercise.category}</Text>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{selectedExercise.name}</Text>
            <Text style={[styles.heroMeta, { color: theme.colors.secondaryText }]}>
              {selectedExercise.equipment} / {selectedExercise.focus}
            </Text>
          </View>
        </View>

        <View style={styles.controls}>
          <SliderControl label="Sets" value={sets} min={1} max={12} step={1} onChange={setSets} />
          <SliderControl label="Reps" value={reps} min={1} max={30} step={1} onChange={setReps} />
          <SliderControl
            label="Weight"
            value={weight}
            min={0}
            max={300}
            step={0.5}
            suffix="lb"
            majorEvery={25}
            onChange={setWeight}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: theme.colors.accent,
              opacity: pressed ? 0.82 : 1
            }
          ]}
        >
          <Ionicons name="checkmark" size={20} color={theme.colors.onAccent} />
          <Text style={[styles.saveButtonText, { color: theme.colors.onAccent }]}>Save Exercise</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.pickerContent}
    >
      <View style={styles.pickerHeader}>
        <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>Session</Text>
        <Text style={[styles.pickerTitle, { color: theme.colors.text }]}>Choose Exercise</Text>
      </View>

      {Object.entries(categories).map(([category, exercises]) => (
        <View key={category} style={styles.categorySection}>
          <Text style={[styles.categoryTitle, { color: theme.colors.text }]}>{category}</Text>
          <View style={styles.exerciseGrid}>
            {exercises.map((exercise) => (
              <Pressable
                accessibilityRole="button"
                key={exercise.id}
                onPress={() => selectExercise(exercise)}
                style={({ pressed }) => [
                  styles.exerciseCard,
                  {
                    borderColor: theme.colors.border,
                    opacity: pressed ? 0.78 : 1
                  }
                ]}
              >
                <View style={styles.exerciseImagePanel}>
                  <Image source={exercise.image} resizeMode="contain" style={styles.exerciseImage} />
                </View>
                <View style={styles.exerciseText}>
                  <Text style={[styles.exerciseName, { color: theme.colors.text }]}>{exercise.name}</Text>
                  <Text style={[styles.exerciseMeta, { color: theme.colors.secondaryText }]}>
                    {exercise.equipment}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

type SliderControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  majorEvery?: number;
  onChange: (value: number) => void;
};

function SliderControl({ label, value, min, max, step, suffix, majorEvery, onChange }: SliderControlProps) {
  const theme = useAppTheme();
  const [trackWidth, setTrackWidth] = useState(1);
  const tickCount = Math.round((max - min) / step);
  const valueRatio = (value - min) / (max - min);
  const displayValue = suffix ? `${formatSliderValue(value)} ${suffix}` : formatSliderValue(value);
  const resolvedMajorEvery = majorEvery ?? Math.max(step, Math.round((max - min) / 5));

  const ticks = useMemo(() => {
    return Array.from({ length: tickCount + 1 }, (_, index) => {
      const tickValue = min + index * step;
      return {
        index,
        isMajor: isMajorTick(tickValue, min, resolvedMajorEvery)
      };
    });
  }, [min, resolvedMajorEvery, step, tickCount]);

  function valueFromLocation(locationX: number) {
    const rawRatio = Math.min(1, Math.max(0, locationX / trackWidth));
    const steppedValue = min + Math.round((rawRatio * (max - min)) / step) * step;
    return Number(Math.min(max, Math.max(min, steppedValue)).toFixed(2));
  }

  function handleTrackPress(event: GestureResponderEvent) {
    onChange(valueFromLocation(event.nativeEvent.locationX));
  }

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(Math.max(1, event.nativeEvent.layout.width));
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => onChange(valueFromLocation(event.nativeEvent.locationX)),
        onPanResponderMove: (event) => onChange(valueFromLocation(event.nativeEvent.locationX))
      }),
    [max, min, onChange, step, trackWidth]
  );

  return (
    <View style={[styles.controlPanel, { borderColor: theme.colors.border }]}>
      <View style={styles.controlHeader}>
        <Text style={[styles.controlLabel, { color: theme.colors.secondaryText }]}>{label}</Text>
        <Text style={[styles.controlValue, { color: theme.colors.text }]}>{displayValue}</Text>
      </View>

      <Pressable accessibilityRole="adjustable" onPress={handleTrackPress} onLayout={handleLayout}>
        <View style={styles.sliderHitArea} {...panResponder.panHandlers}>
          <View style={[styles.sliderTrack, { backgroundColor: theme.colors.border }]}>
            <View style={[styles.sliderFill, { width: `${valueRatio * 100}%`, backgroundColor: theme.colors.accent }]} />
            <View style={styles.tickRow}>
              {ticks.map((tick) => (
                <View
                  key={`${label}-${tick.index}`}
                  style={[
                    styles.tick,
                    tick.isMajor ? styles.majorTick : styles.minorTick,
                    { backgroundColor: tick.isMajor ? theme.colors.text : theme.colors.mutedText }
                  ]}
                />
              ))}
            </View>
            <View
              style={[
                styles.sliderThumb,
                {
                  backgroundColor: theme.colors.accent,
                  left: `${valueRatio * 100}%`
                }
              ]}
            />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function formatSliderValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isMajorTick(value: number, min: number, majorEvery: number) {
  const offset = Number((value - min).toFixed(2));
  return Math.abs(offset % majorEvery) < 0.01 || Math.abs((offset % majorEvery) - majorEvery) < 0.01;
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    minHeight: 44,
    paddingRight: 12
  },
  backText: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  categorySection: {
    gap: 12,
    marginTop: 30
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  controlHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  controlLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  controlPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: 18,
    padding: 18
  },
  controlValue: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "right"
  },
  controls: {
    gap: 12,
    marginTop: 18
  },
  detailHero: {
    gap: 18,
    marginTop: 8
  },
  detailImage: {
    height: "100%",
    width: "100%"
  },
  detailImagePanel: {
    aspectRatio: 1,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    overflow: "hidden",
    width: "100%"
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  exerciseCard: {
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 238,
    overflow: "hidden",
    width: "48%"
  },
  exerciseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12
  },
  exerciseImage: {
    height: "100%",
    width: "100%"
  },
  exerciseImagePanel: {
    aspectRatio: 1,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    overflow: "hidden",
    width: "100%"
  },
  exerciseMeta: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 6,
    textTransform: "uppercase"
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18
  },
  exerciseText: {
    minHeight: 74,
    padding: 12
  },
  heroMeta: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 8
  },
  heroText: {
    maxWidth: 520
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 39,
    marginTop: 8,
    textTransform: "uppercase"
  },
  loggerContent: {
    paddingBottom: 118,
    paddingHorizontal: 20,
    paddingTop: 64
  },
  majorTick: {
    height: 24,
    width: 2
  },
  minorTick: {
    height: 12,
    width: 1
  },
  pickerContent: {
    paddingBottom: 118,
    paddingHorizontal: 20,
    paddingTop: 72
  },
  pickerHeader: {
    gap: 10
  },
  pickerTitle: {
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 39,
    textTransform: "uppercase"
  },
  primaryButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 34,
    minHeight: 56,
    minWidth: 220,
    paddingHorizontal: 24,
    paddingVertical: 14
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  saveButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 56,
    paddingHorizontal: 24,
    paddingVertical: 14
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  screen: {
    flex: 1
  },
  sliderFill: {
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0
  },
  sliderHitArea: {
    justifyContent: "center",
    minHeight: 54
  },
  sliderThumb: {
    borderColor: "#000000",
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    marginLeft: -12,
    position: "absolute",
    top: -10,
    width: 24
  },
  sliderTrack: {
    height: 4,
    justifyContent: "center",
    position: "relative"
  },
  startContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: 112,
    paddingHorizontal: 24,
    paddingTop: 72
  },
  startCopy: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
    maxWidth: 340,
    textAlign: "center"
  },
  startHeader: {
    alignItems: "center"
  },
  startStats: {
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginTop: 34,
    maxWidth: 360,
    width: "100%"
  },
  startStatItem: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 62,
    paddingHorizontal: 8
  },
  startStatText: {
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    textTransform: "uppercase"
  },
  startTitle: {
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 10,
    textAlign: "center",
    textTransform: "uppercase"
  },
  tick: {
    alignSelf: "center"
  },
  tickRow: {
    alignItems: "center",
    bottom: -10,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    position: "absolute",
    right: 0
  }
});
