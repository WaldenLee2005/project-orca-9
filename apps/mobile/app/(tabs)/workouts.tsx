import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  LayoutChangeEvent,
  PanResponder,
  TextInput,
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
import { trackDevOperation } from "../../src/dev/devDiagnosticsStore";
import {
  addExerciseToWorkoutSession,
  createWorkoutSession,
  deleteWorkoutExercise,
  getActiveWorkoutSession,
  StoredSessionExercise
} from "../../src/storage/workoutsRepository";
import { useAppTheme } from "../../src/theme/ThemeProvider";

type SessionStep = "start" | "active" | "picker" | "custom" | "logger";

type SessionLogEntry = StoredSessionExercise;

export default function WorkoutsScreen() {
  const theme = useAppTheme();
  const [step, setStep] = useState<SessionStep>("start");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [loggedExercises, setLoggedExercises] = useState<SessionLogEntry[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<SessionExercise | null>(null);
  const [customExerciseName, setCustomExerciseName] = useState("");
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(8);
  const [weight, setWeight] = useState(135);

  const categories = useMemo(() => {
    return sessionExercises.reduce<Record<string, SessionExercise[]>>((groups, exercise) => {
      groups[exercise.category] = [...(groups[exercise.category] ?? []), exercise];
      return groups;
    }, {});
  }, []);

  useEffect(() => {
    let isMounted = true;
    const operation = trackDevOperation("Load active workout session", "Checking SQLite for an unfinished session.");

    getActiveWorkoutSession()
      .then((activeSession) => {
        operation.resolve(activeSession ? "Restored an active session." : "No active session found.");
        if (!isMounted || !activeSession) {
          return;
        }

        setSessionId(activeSession.id);
        setSessionStartedAt(activeSession.startedAt);
        setLoggedExercises(activeSession.exercises);
        setStep("active");
      })
      .catch((error) => {
        operation.fail(error);
        if (isMounted) {
          setStorageError("Could not load your saved session.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function startSession() {
    const localStartedAt = new Date().toISOString();

    setStorageError(null);
    setSessionId(null);
    setSessionStartedAt(localStartedAt);
    setLoggedExercises([]);
    setSelectedExercise(null);
    setStep("active");

    const operation = trackDevOperation("Create workout session", "Opening a new local SQLite session.");

    try {
      const session = await createWorkoutSession();
      setSessionId(session.id);
      setSessionStartedAt(session.startedAt);
      operation.resolve(`Created ${session.id}.`);
    } catch (error) {
      operation.fail(error);
      setStorageError("Session is active, but it could not be saved locally yet.");
    }
  }

  function selectExercise(exercise: SessionExercise) {
    setSelectedExercise(exercise);
    setSets(3);
    setReps(8);
    setWeight(135);
    setStep("logger");
  }

  function createCustomExercise() {
    const trimmedName = customExerciseName.trim();
    if (!trimmedName) {
      return;
    }

    selectExercise({
      id: `custom-${Date.now()}`,
      name: trimmedName,
      category: "Custom",
      focus: "Custom exercise",
      equipment: "Custom",
      image: sessionExercises[0].image
    });
    setCustomExerciseName("");
  }

  async function deleteLoggedExercise(entryId: string) {
    const previousExercises = loggedExercises;
    setLoggedExercises((current) => current.filter((entry) => entry.id !== entryId));

    if (entryId.startsWith("local-workout-exercise-")) {
      return;
    }

    const operation = trackDevOperation("Delete logged exercise", entryId);

    try {
      await deleteWorkoutExercise(entryId);
      setStorageError(null);
      operation.resolve("Deleted from SQLite.");
    } catch (error) {
      operation.fail(error);
      setLoggedExercises(previousExercises);
      setStorageError("Could not delete that exercise.");
    }
  }

  async function saveExerciseToSession() {
    if (!selectedExercise) {
      return;
    }

    if (!sessionId) {
      setLoggedExercises((current) => [
        ...current,
        {
          id: `local-workout-exercise-${Date.now()}`,
          exercise: selectedExercise,
          sets,
          reps,
          weight,
          savedAt: new Date().toISOString()
        }
      ]);
      setStorageError("Exercise saved for this app session only. Local storage is still unavailable.");
      setSelectedExercise(null);
      setStep("active");
      return;
    }

    const operation = trackDevOperation("Save exercise to session", selectedExercise.name);

    try {
      const storedExercise = await addExerciseToWorkoutSession({
        sessionId,
        exercise: selectedExercise,
        sets,
        reps,
        weight
      });

      if (storedExercise) {
        setLoggedExercises((current) => [...current, storedExercise]);
      }

      setStorageError(null);
      setSelectedExercise(null);
      setStep("active");
      operation.resolve(storedExercise ? `Saved ${storedExercise.id}.` : "Repository returned no exercise.");
    } catch (error) {
      operation.fail(error);
      setStorageError("Could not save that exercise.");
    }
  }

  if (step === "start") {
    return (
      <View style={[styles.startContainer, { backgroundColor: theme.colors.background }]}>
        <View style={styles.startHeader}>
          <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>Today</Text>
          <Text style={[styles.startTitle, { color: theme.colors.text }]}>Session</Text>
          <Text style={[styles.startCopy, { color: theme.colors.secondaryText }]}> 
            Start a lift, add exercises as you work, and keep every saved set in order.
          </Text>
          {storageError ? <Text style={[styles.errorText, { color: theme.colors.accent }]}>{storageError}</Text> : null}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={startSession}
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
          {["Start", "Add exercise", "Save stats"].map((item) => (
            <View key={item} style={styles.startStatItem}>
              <Text style={[styles.startStatText, { color: theme.colors.secondaryText }]}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (step === "active") {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.activeContent}
      >
        <View style={styles.activeHeader}>
          <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>Active Session</Text>
          <Text style={[styles.activeTitle, { color: theme.colors.text }]}>Session Log</Text>
          <Text style={[styles.activeMeta, { color: theme.colors.secondaryText }]}> 
            Started {sessionStartedAt ? formatSessionTime(new Date(sessionStartedAt)) : "now"} / {loggedExercises.length} saved
          </Text>
          {storageError ? <Text style={[styles.errorText, { color: theme.colors.accent }]}>{storageError}</Text> : null}
        </View>

        <View style={styles.sessionList}>
          {loggedExercises.map((entry, index) => (
            <SessionEntryRow
              entry={entry}
              index={index}
              key={entry.id}
              onDelete={deleteLoggedExercise}
            />
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={() => setStep("picker")}
            style={({ pressed }) => [
              styles.addExerciseButton,
              {
                backgroundColor: theme.colors.accent,
                opacity: pressed ? 0.82 : 1
              }
            ]}
          >
            <Ionicons name="add" size={20} color={theme.colors.onAccent} />
            <Text style={[styles.addExerciseText, { color: theme.colors.onAccent }]}>Add Exercise</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (step === "custom") {
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
          <View style={styles.heroText}>
            <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>Custom</Text>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Add Exercise</Text>
            <Text style={[styles.heroMeta, { color: theme.colors.secondaryText }]}>Name the movement, then log it with the same session sliders.</Text>
          </View>
        </View>

        <View style={[styles.customNamePanel, { borderColor: theme.colors.border }]}> 
          <Text style={[styles.controlLabel, { color: theme.colors.secondaryText }]}>Exercise Name</Text>
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setCustomExerciseName}
            placeholder="e.g. Cable Y Raise"
            placeholderTextColor={theme.colors.mutedText}
            returnKeyType="done"
            style={[styles.customNameInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
            value={customExerciseName}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={createCustomExercise}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: theme.colors.accent,
              opacity: pressed ? 0.82 : 1
            }
          ]}
        >
          <Ionicons name="arrow-forward" size={20} color={theme.colors.onAccent} />
          <Text style={[styles.saveButtonText, { color: theme.colors.onAccent }]}>Continue</Text>
        </Pressable>
      </ScrollView>
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
          <View style={styles.heroText}>
            <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>{selectedExercise.category}</Text>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{selectedExercise.name}</Text>
            <Text style={[styles.heroMeta, { color: theme.colors.secondaryText }]}> 
              {selectedExercise.equipment} / {selectedExercise.focus}
            </Text>
          </View>
        </View>

        <View style={styles.controls}>
          <SliderControl label="Sets" value={sets} min={1} max={12} step={1} majorEvery={5} onChange={setSets} />
          <SliderControl label="Reps" value={reps} min={1} max={31} step={1} majorEvery={5} onChange={setReps} />
          <SliderControl
            label="Weight"
            value={weight}
            min={0}
            max={300}
            step={0.5}
            suffix="lb"
            majorEvery={5}
            onChange={setWeight}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={saveExerciseToSession}
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
      <Pressable accessibilityRole="button" onPress={() => setStep("active")} style={styles.backButton}>
        <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        <Text style={[styles.backText, { color: theme.colors.text }]}>Session</Text>
      </Pressable>

      <View style={styles.pickerHeader}>
        <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>Add Exercise</Text>
        <Text style={[styles.pickerTitle, { color: theme.colors.text }]}>Choose Exercise</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setStep("custom")}
        style={({ pressed }) => [
          styles.customExerciseButton,
          {
            borderColor: theme.colors.border,
            opacity: pressed ? 0.72 : 1
          }
        ]}
      >
        <Ionicons name="create-outline" size={22} color={theme.colors.text} />
        <View style={styles.customExerciseTextGroup}>
          <Text style={[styles.customExerciseTitle, { color: theme.colors.text }]}>Custom Exercise</Text>
          <Text style={[styles.customExerciseCopy, { color: theme.colors.secondaryText }]}>Add a movement that is not in the catalog.</Text>
        </View>
      </Pressable>

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

function formatSessionTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

type SessionEntryRowProps = {
  entry: SessionLogEntry;
  index: number;
  onDelete: (entryId: string) => void;
};

function SessionEntryRow({ entry, index, onDelete }: SessionEntryRowProps) {
  const theme = useAppTheme();
  const rowTranslateX = useRef(new Animated.Value(0));
  const deleteRevealWidth = 86;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_, gesture) => {
          rowTranslateX.current.setValue(Math.max(-deleteRevealWidth, Math.min(0, gesture.dx)));
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldReveal = gesture.dx < -deleteRevealWidth / 2;
          Animated.spring(rowTranslateX.current, {
            friction: 8,
            tension: 70,
            toValue: shouldReveal ? -deleteRevealWidth : 0,
            useNativeDriver: true
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(rowTranslateX.current, {
            friction: 8,
            tension: 70,
            toValue: 0,
            useNativeDriver: true
          }).start();
        }
      }),
    []
  );

  return (
    <View style={styles.sessionSwipeShell}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onDelete(entry.id)}
        style={[styles.deleteReveal, { backgroundColor: "#FFFFFF" }]}
      >
        <Ionicons name="trash-outline" size={22} color={theme.colors.onAccent} />
      </Pressable>
      <Animated.View
        style={[
          styles.sessionEntry,
          {
            borderColor: theme.colors.border,
            transform: [{ translateX: rowTranslateX.current }]
          }
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.sessionEntryHeader}>
          <Text style={[styles.sessionEntryIndex, { color: theme.colors.mutedText }]}>#{index + 1}</Text>
          <Text style={[styles.sessionEntryTime, { color: theme.colors.mutedText }]}>
            {formatSessionTime(new Date(entry.savedAt))}
          </Text>
        </View>
        <Text style={[styles.sessionEntryName, { color: theme.colors.text }]}>{entry.exercise.name}</Text>
        <Text style={[styles.sessionEntryStats, { color: theme.colors.secondaryText }]}> 
          {entry.sets} sets / {entry.reps} reps / {formatSliderValue(entry.weight)} lb
        </Text>
      </Animated.View>
    </View>
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
  const [draftValue, setDraftValue] = useState(value);
  const draftValueRef = useRef(value);
  const valueRef = useRef(value);
  const dragStartValue = useRef(value);
  const isDragging = useRef(false);
  const railTranslateX = useRef(new Animated.Value(0));
  const tickCount = Math.round((max - min) / step);
  const tickSpacing = step < 1 ? 9 : 18;
  const isSubStepRuler = step < 1;
  const selectedIndex = Math.round((draftValue - min) / step);
  const displayValue = suffix ? `${formatSliderValue(draftValue)} ${suffix}` : formatSliderValue(draftValue);
  const resolvedMajorEvery = majorEvery ?? 5;
  const markerOffset = Math.round(trackWidth / 2 - tickSpacing / 2);
  const firstIndex = 0;
  const lastIndex = tickCount;
  const baseRailX = markerOffset - (selectedIndex - firstIndex) * tickSpacing;

  const ticks = useMemo(() => {

    return Array.from({ length: lastIndex - firstIndex + 1 }, (_, offset) => {
      const index = firstIndex + offset;
      const tickValue = min + index * step;
      return {
        index,
        isMajor: index === 0 || index === tickCount || isMajorTick(tickValue, min, resolvedMajorEvery),
        isWholeStep: step < 1 && Number.isInteger(tickValue)
      };
    });
  }, [firstIndex, lastIndex, min, resolvedMajorEvery, step, tickCount]);

  useEffect(() => {
    valueRef.current = value;
    if (!isDragging.current) {
      draftValueRef.current = value;
      setDraftValue(value);
    }
  }, [value]);

  useEffect(() => {
    if (isDragging.current) {
      railTranslateX.current.setValue(baseRailX);
      return;
    }

    Animated.timing(railTranslateX.current, {
      duration: 110,
      toValue: baseRailX,
      useNativeDriver: true
    }).start();
  }, [baseRailX]);

  function clampToStep(rawValue: number) {
    const steppedValue = min + Math.round((rawValue - min) / step) * step;
    return Number(Math.min(max, Math.max(min, steppedValue)).toFixed(2));
  }

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(Math.max(1, event.nativeEvent.layout.width));
  }

  function valueFromDrag(dx: number) {
    return clampToStep(dragStartValue.current - (dx / tickSpacing) * step);
  }

  function updateDraftValue(nextValue: number) {
    draftValueRef.current = nextValue;
    setDraftValue(nextValue);
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 2,
        onStartShouldSetPanResponder: () => false,
        onPanResponderGrant: () => {
          isDragging.current = true;
          dragStartValue.current = draftValueRef.current;
          railTranslateX.current.stopAnimation();
        },
        onPanResponderMove: (_, gesture) => {
          updateDraftValue(valueFromDrag(gesture.dx));
        },
        onPanResponderRelease: (_, gesture) => {
          const nextValue = valueFromDrag(gesture.dx);
          isDragging.current = false;
          updateDraftValue(nextValue);
          onChange(nextValue);
        },
        onPanResponderTerminate: () => {
          isDragging.current = false;
          updateDraftValue(valueRef.current);
        }
      }),
    [max, min, onChange, step, tickSpacing]
  );

  return (
    <View style={[styles.controlPanel, { borderColor: theme.colors.border }]}> 
      <View style={styles.controlHeader}>
        <Text style={[styles.controlLabel, { color: theme.colors.secondaryText }]}>{label}</Text>
        <Text style={[styles.controlValue, { color: theme.colors.text }]}>{displayValue}</Text>
      </View>

      <View accessibilityRole="adjustable" onLayout={handleLayout} style={styles.sliderHitArea} {...panResponder.panHandlers}>
        <View style={styles.rulerWindow}>
          <Animated.View
            style={[
              styles.tickRow,
              {
                transform: [{ translateX: railTranslateX.current }]
              }
            ]}
          >
            {ticks.map((tick) => (
              <View key={`${label}-${tick.index}`} style={[styles.tickCell, { width: tickSpacing }]}>
                <View
                  style={[
                    styles.tick,
                    tick.isMajor ? styles.majorTick : tick.isWholeStep ? styles.mediumTick : isSubStepRuler ? styles.subStepTick : styles.minorTick,
                    {
                      backgroundColor: theme.colors.secondaryText,
                      opacity: tick.isMajor ? 1 : 0.62
                    }
                  ]}
                />
              </View>
            ))}
          </Animated.View>
          <View pointerEvents="none" style={[styles.fixedSliderMarkerDot, { backgroundColor: theme.colors.accent }]} />
        </View>
      </View>
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
  activeContent: {
    paddingBottom: 118,
    paddingHorizontal: 20,
    paddingTop: 72
  },
  activeHeader: {
    gap: 10
  },
  activeMeta: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  activeTitle: {
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 39,
    textTransform: "uppercase"
  },
  addExerciseButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 24,
    paddingVertical: 14
  },
  addExerciseText: {
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase"
  },
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
  deleteReveal: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    top: 0,
    width: 86
  },
  customExerciseButton: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    minHeight: 72,
    padding: 14
  },
  customExerciseCopy: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 4
  },
  customExerciseTextGroup: {
    flex: 1
  },
  customExerciseTitle: {
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  customNameInput: {
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textTransform: "uppercase"
  },
  customNamePanel: {
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 18,
    padding: 18
  },
  detailHero: {
    gap: 18,
    marginTop: 8
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
  errorText: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 4,
    textTransform: "uppercase"
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
    height: 28,
    width: 2
  },
  mediumTick: {
    height: 18,
    width: 1
  },
  minorTick: {
    height: 16,
    width: 1
  },
  subStepTick: {
    height: 9,
    width: 1
  },
  pickerContent: {
    paddingBottom: 118,
    paddingHorizontal: 20,
    paddingTop: 72
  },
  pickerHeader: {
    gap: 10,
    marginTop: 8
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
  sessionEntry: {
    backgroundColor: "#000000",
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  sessionEntryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },

  sessionEntryIndex: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  sessionEntryName: {
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
    marginTop: 10,
    textTransform: "uppercase"
  },
  sessionEntryStats: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 6
  },
  sessionEntryTime: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  sessionList: {
    gap: 12,
    marginTop: 18
  },
  sessionSwipeShell: {
    overflow: "hidden",
    position: "relative"
  },
  fixedSliderMarkerDot: {
    borderColor: "#000000",
    borderRadius: 14,
    borderWidth: 2,
    height: 30,
    left: "50%",
    marginLeft: -10,
    marginTop: -15,
    position: "absolute",
    top: "50%",
    width: 20
  },
  rulerWindow: {
    height: 64,
    overflow: "hidden",
    position: "relative"
  },
  sliderHitArea: {
    justifyContent: "center",
    minHeight: 64
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
  tickCell: {
    alignItems: "center",
    height: 64,
    justifyContent: "center"
  },
  tickRow: {
    alignItems: "center",
    flexDirection: "row",
    height: 64
  }
});
