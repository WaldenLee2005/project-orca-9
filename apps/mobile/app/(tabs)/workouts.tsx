import { createThemedStyles } from "../../src/theme/designSystem";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  PanResponder,
  Platform,
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
  cancelEmptyWorkoutSession,
  completeWorkoutSession,
  createWorkoutSession,
  deleteWorkoutExercise,
  getActiveWorkoutSession,
  getCompletedWorkoutSessions,
  getWorkoutSessionExercises,
  CompletedWorkoutSession,
  StoredSessionExercise,
  validateActualSets,
  getActualSets,
  type WorkoutSet
} from "../../src/storage/workoutsRepository";
import { getStreakSummary, markTodayAsRestDay, StreakSummary } from "../../src/storage/streaksRepository";
import { useAppTheme, useThemeStyles } from "../../src/theme/ThemeProvider";
import { ExerciseBrowser } from "../../src/features/exercises/ExerciseBrowser";
import { ScreenHeading } from "../../src/components/ScreenHeading";
import { StreakCard } from "../../src/components/StreakCard";
import { formatProgramPrescription, formatDuration, getPendingProgramExercises, getProgramDayName, getScheduledDayIndex, localDateKey, toWorkoutProgramPlan, type ProgramExercise, type WorkoutProgramPlan, type TrainingProgram } from "../../src/features/programs/programModel";
import { getProgramLibrary, getTrainingProgram } from "../../src/storage/programsRepository";
import { subscribeToTrainingChanges } from "../../src/storage/trainingChanges";

import { CoachedSetLogger } from "../../src/features/coach/CoachedSetLogger";
import { ReadinessCheck } from "../../src/features/coach/CoachControls";
import { CoachOverview } from "../../src/features/coach/CoachOverview";
import { DEFAULT_READINESS, type Readiness } from "../../src/features/coach/coachModel";
import { SavedSetNotes } from "../../src/features/workouts/SavedSetNotes";

type SessionStep = "start" | "active" | "picker" | "custom" | "logger";

type SessionLogEntry = StoredSessionExercise;

const supportsNativeAnimatedDriver = Platform.OS !== "web";

export default function WorkoutsScreen() {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const theme = useAppTheme();
  const router = useRouter();
  const { exerciseId, programId, programDayId } = useLocalSearchParams<{ exerciseId?: string; programId?: string; programDayId?: string }>();
  const handledExerciseRequest = useRef<string | null>(null);
  const handledProgramRequest = useRef<string | null>(null);
  const savingExercise = useRef(false);
  const startingSession = useRef(false);
  const exitingSession = useRef(false);
  const trainingRefreshRequest = useRef(0);
  const isTrainingScreenFocused = useRef(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isSavingExercise, setIsSavingExercise] = useState(false);
  const [isExitingSession, setIsExitingSession] = useState(false);
  const [programPlan, setProgramPlan] = useState<WorkoutProgramPlan | null>(null);
  const [selectedProgramEntryId, setSelectedProgramEntryId] = useState<string | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [step, setStep] = useState<SessionStep>("start");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [loggedExercises, setLoggedExercises] = useState<SessionLogEntry[]>([]);
  const [previousSessions, setPreviousSessions] = useState<CompletedWorkoutSession[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [streak, setStreak] = useState<StreakSummary | null>(null);
  const [scheduledProgram, setScheduledProgram] = useState<TrainingProgram | null>(null);
  const [scheduleDate, setScheduleDate] = useState(localDateKey());
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<SessionExercise | null>(null);
  const [customExerciseName, setCustomExerciseName] = useState("");
  const [readiness, setReadiness] = useState<Readiness>({ ...DEFAULT_READINESS });

  const refreshTrainingState = useCallback(async function refresh(): Promise<void> {
    if (!isTrainingScreenFocused.current) return;
    const request = ++trainingRefreshRequest.current;
    const date = localDateKey();
    try {
      const [summary, library] = await Promise.all([getStreakSummary(), getProgramLibrary()]);
      if (!isTrainingScreenFocused.current || request !== trainingRefreshRequest.current) return;
      if (date !== localDateKey()) {
        await refresh();
        return;
      }
      setStreak(summary);
      setScheduleDate(date);
      setScheduleError(null);
      setScheduledProgram(library.programs.find((program) => program.id === library.activeProgramId) ?? null);
    } catch {
      if (isTrainingScreenFocused.current && request === trainingRefreshRequest.current) {
        setScheduleError("Could not refresh your schedule and streak. Return to this tab to retry.");
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const operation = trackDevOperation("Load active workout session", "Checking local workout storage for an unfinished session.");

    loadPreviousSessions();

    getActiveWorkoutSession()
      .then((activeSession) => {
        operation.resolve(activeSession ? "Restored an active session." : "No active session found.");
        if (!isMounted || !activeSession) {
          return;
        }

        setSessionId(activeSession.id);
        setSessionStartedAt(activeSession.startedAt);
        setLoggedExercises(activeSession.exercises);
        setProgramPlan(activeSession.programPlan ?? null);
        setStep("active");
      })
      .catch((error) => {
        operation.fail(error);
        if (isMounted) {
          setStorageError("Could not load your saved session.");
        }
      })
      .finally(() => {
        if (isMounted) setIsSessionReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useFocusEffect(useCallback(() => {
    isTrainingScreenFocused.current = true;
    let lastDate = localDateKey();
    void refreshTrainingState();
    const unsubscribe = subscribeToTrainingChanges(() => { void refreshTrainingState(); });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        lastDate = localDateKey();
        setReadiness({ ...DEFAULT_READINESS });
        void refreshTrainingState();
      }
    });
    const timer = setInterval(() => {
      const today = localDateKey();
      if (today !== lastDate) {
        lastDate = today;
        setReadiness({ ...DEFAULT_READINESS });
        void refreshTrainingState();
      }
    }, 30000);
    return () => {
      isTrainingScreenFocused.current = false;
      trainingRefreshRequest.current += 1;
      unsubscribe();
      subscription.remove();
      clearInterval(timer);
    };
  }, [refreshTrainingState]));

  useEffect(() => {
    if (!exerciseId) {
      handledExerciseRequest.current = null;
      return;
    }
    if (!isSessionReady || handledExerciseRequest.current === exerciseId) return;
    handledExerciseRequest.current = exerciseId;
    const exercise = sessionExercises.find((item) => item.id === exerciseId);
    router.setParams({ exerciseId: undefined });
    if (!exercise) return;

    // Wait for restoration before opening a library selection; never replace an active session.
    async function openExercise() {
      if (!sessionStartedAt && !await startSession()) return;
      selectExercise(exercise!);
    }
    void openExercise();
  }, [exerciseId, isSessionReady]);

  useEffect(() => {
    if (!programId) { handledProgramRequest.current = null; return; }
    const requestKey = `${programId}:${programDayId ?? "today"}`;
    if (!isSessionReady || handledProgramRequest.current === requestKey) return;
    handledProgramRequest.current = requestKey;
    router.setParams({ programId: undefined, programDayId: undefined });
    async function openProgram() {
      try {
        const program = await getTrainingProgram(programId!);
        if (!program) throw new Error("That program no longer exists. Create or select another program.");
        const session = await createWorkoutSession({ programPlan: toWorkoutProgramPlan(program, programDayId) });
        setSessionId(session.id);
        setSessionStartedAt(session.startedAt);
        setLoggedExercises(session.exercises);
        setProgramPlan(session.programPlan ?? null);
        setSelectedExercise(null);
        setSelectedProgramEntryId(null);
        setStorageError(null);
        setSessionNotice(null);
        setStep("active");
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : "Could not start that program. Please try again.");
      }
    }
    void openProgram();
  }, [programId, programDayId, isSessionReady]);

  const pendingProgramExercises = getPendingProgramExercises(programPlan, loggedExercises);
  const scheduledDay = scheduledProgram?.days[getScheduledDayIndex(scheduledProgram.schedule, scheduledProgram.days.length, scheduleDate)];

  async function saveRestDay() {
    try {
      await markTodayAsRestDay();
      await refreshTrainingState();
      setSessionNotice("Rest day logged. Your streak is protected.");
    } catch (error) {
      console.warn("Could not save rest day", error);
      setStorageError("Could not save today as a rest day.");
    }
  }

  async function loadPreviousSessions() {
    const operation = trackDevOperation("Load previous workout sessions", "Checking completed local workout sessions.");

    try {
      const sessions = await getCompletedWorkoutSessions();
      setPreviousSessions(sessions);
      operation.resolve(`${sessions.length} completed sessions loaded.`);
    } catch (error) {
      operation.fail(error);
    }
  }

  async function startSession(followActiveProgram = true) {
    if (startingSession.current || !isSessionReady) return false;
    // Resume saved work without creating another session or depending on a fresh storage write.
    if (sessionStartedAt) {
      setStorageError(null);
      setSessionNotice(null);
      setStep("active");
      return true;
    }
    startingSession.current = true;
    setIsStartingSession(true);
    setStorageError(null);
    setSessionNotice(null);

    const operation = trackDevOperation("Create workout session", followActiveProgram ? "Opening today's active-program workout or an unplanned session." : "Opening an unplanned workout.");

    try {
      const session = await createWorkoutSession(followActiveProgram ? { followActiveProgram: true } : undefined);
      setSessionId(session.id);
      setSessionStartedAt(session.startedAt);
      setLoggedExercises(session.exercises);
      setProgramPlan(session.programPlan ?? null);
      setSelectedExercise(null);
      setSelectedProgramEntryId(null);
      setStep("active");
      operation.resolve(`Created ${session.id}.`);
      return true;
    } catch (error) {
      operation.fail(error);
      setStorageError(error instanceof Error ? error.message : "Could not open your session. Please try again.");
      return false;
    } finally {
      startingSession.current = false;
      setIsStartingSession(false);
    }
  }

  function selectExercise(exercise: SessionExercise) {
    setSelectedProgramEntryId(null);
    setSelectedExercise(exercise);
    setReadiness((current) => ({ ...current, sameEquipment: false }));
    setStep("logger");
  }

  function selectProgramExercise(entry: ProgramExercise) {
    const exercise = sessionExercises.find((item) => item.id === entry.exerciseId);
    if (!exercise) { setStorageError(`${entry.exerciseName} is no longer in the exercise library. Edit the program to replace it.`); return; }
    setSelectedExercise(exercise);
    setSelectedProgramEntryId(entry.id);
    setReadiness((current) => ({ ...current, sameEquipment: false }));
    setStorageError(null);
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

  function isLocalLoggedExercise(entry: SessionLogEntry) {
    return entry.id.startsWith("local-workout-exercise-");
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
      operation.resolve("Deleted from local workout storage.");
    } catch (error) {
      operation.fail(error);
      setLoggedExercises(previousExercises);
      setStorageError("Could not delete that exercise.");
    }
  }

  async function saveExerciseToSession(actualSets: WorkoutSet[]) {
    if (!selectedExercise || savingExercise.current) {
      return;
    }
    const measurement = { sets: actualSets.length, reps: actualSets[0]?.reps, weight: actualSets[0]?.weight, durationSeconds: actualSets[0]?.durationSeconds ?? null,
      actualSets, prescription: programPlan?.exercises.find((item) => item.id === selectedProgramEntryId) };
    try { validateActualSets(actualSets); }
    catch (error) { setStorageError((error as Error).message); return; }
    savingExercise.current = true;
    setIsSavingExercise(true);

    if (!sessionId) {
      setLoggedExercises((current) => [
        ...current,
        {
          id: `local-workout-exercise-${Date.now()}`,
          exercise: selectedExercise,
          ...measurement,
          savedAt: new Date().toISOString(),
          programEntryId: selectedProgramEntryId
        }
      ]);
      setSessionNotice(null);
      setStorageError("Exercise saved for this app session only. Local storage is still unavailable.");
      setSelectedExercise(null);
      setSelectedProgramEntryId(null);
      setStep("active");
      savingExercise.current = false;
      setIsSavingExercise(false);
      return;
    }

    const operation = trackDevOperation("Save exercise to session", selectedExercise.name);

    try {
      const storedExercise = await addExerciseToWorkoutSession({
        sessionId,
        exercise: selectedExercise,
        ...measurement,
        programEntryId: selectedProgramEntryId
      });

      if (storedExercise) {
        setLoggedExercises((current) => [...current, storedExercise]);
      }

      setSessionNotice(null);
      setStorageError(null);
      setSelectedExercise(null);
      setSelectedProgramEntryId(null);
      setStep("active");
      operation.resolve(storedExercise ? `Saved ${storedExercise.id}.` : "Repository returned no exercise.");
    } catch (error) {
      operation.fail(error);
      setStorageError("Could not save that exercise.");
    } finally {
      savingExercise.current = false;
      setIsSavingExercise(false);
    }
  }

  async function saveSession() {
    if (isSavingSession || exitingSession.current) {
      return;
    }

    if (loggedExercises.length === 0) {
      setSessionNotice(null);
      setStorageError("Add at least one exercise before saving the session.");
      return;
    }

    const operation = trackDevOperation("Complete workout session", `${loggedExercises.length} exercises`);
    setIsSavingSession(true);

    try {
      let resolvedSessionId = sessionId;

      if (!resolvedSessionId) {
        const session = await createWorkoutSession();
        resolvedSessionId = session.id;
        setSessionId(session.id);
        setSessionStartedAt(session.startedAt);
      }

      for (const entry of loggedExercises.filter(isLocalLoggedExercise)) {
        await addExerciseToWorkoutSession({
          sessionId: resolvedSessionId,
          exercise: entry.exercise,
          sets: entry.sets,
          reps: entry.reps,
          weight: entry.weight,
          durationSeconds: entry.durationSeconds ?? null,
          actualSets: entry.actualSets,
          prescription: entry.prescription,
          programEntryId: entry.programEntryId
        });
      }

      await completeWorkoutSession(resolvedSessionId);
      setSessionId(null);
      setSessionStartedAt(null);
      setLoggedExercises([]);
      setSelectedExercise(null);
      setSelectedProgramEntryId(null);
      setProgramPlan(null);
      setStorageError(null);
      setSessionNotice("Session saved.");
      setReadiness({ ...DEFAULT_READINESS });
      await loadPreviousSessions();
      await refreshTrainingState();
      setStep("start");
      operation.resolve(`Completed ${resolvedSessionId}.`);
    } catch (error) {
      operation.fail(error);
      setSessionNotice(null);
      setStorageError("Could not save the session yet.");
    } finally {
      setIsSavingSession(false);
    }
  }

  async function exitSession() {
    if (isSavingSession || savingExercise.current || exitingSession.current) return;
    if (loggedExercises.length > 0) {
      setStorageError(null);
      setSessionNotice("Session paused. Resume whenever you’re ready.");
      setStep("start");
      return;
    }

    exitingSession.current = true;
    setIsExitingSession(true);
    const operation = trackDevOperation("Exit empty workout session", "Cancelling only an unfinished session with no saved exercises.");
    try {
      const cancelled = sessionId ? await cancelEmptyWorkoutSession(sessionId) : true;
      const activeSession = cancelled ? null : await getActiveWorkoutSession();
      setSessionId(activeSession?.id ?? null);
      setSessionStartedAt(activeSession?.startedAt ?? null);
      setLoggedExercises(activeSession?.exercises ?? []);
      setProgramPlan(activeSession?.programPlan ?? null);
      setSelectedExercise(null);
      setSelectedProgramEntryId(null);
      setStorageError(null);
      setSessionNotice(activeSession ? "Session paused. Resume whenever you’re ready." : "Session exited.");
      setStep("start");
      operation.resolve(activeSession ? "Saved workout preserved for resume." : "Empty session exited without completing a workout.");
    } catch (error) {
      operation.fail(error);
      setStorageError("Could not exit your empty session. Please try again.");
    } finally {
      exitingSession.current = false;
      setIsExitingSession(false);
    }
  }

  if (step === "start") {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.startContent}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeading eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} title="Today" />
        <View style={styles.startHero}>
          <View style={styles.startHeader}>
            <View style={styles.heroTopRow}><Text style={[styles.eyebrow, { color: theme.colors.mutedText }]}>{sessionStartedAt ? "UNFINISHED SESSION" : scheduledProgram ? "YOUR PROGRAM" : "YOUR SESSION"}</Text><Ionicons name="calendar-outline" size={20} color={theme.colors.mutedText} /></View>
            <Text style={[styles.startTitle, { color: theme.colors.text }]}>{sessionStartedAt ? programPlan?.programName ?? "Your workout" : scheduledDay && scheduledProgram ? getProgramDayName(scheduledProgram, scheduledDay) : "Ready to train?"}</Text>
            <Text style={[styles.startCopy, { color: theme.colors.secondaryText }]}>
              {sessionStartedAt ? `${programPlan?.dayName ? `${programPlan.dayName} · ` : ""}${loggedExercises.length} ${loggedExercises.length === 1 ? "exercise" : "exercises"} saved. Your unfinished workout is ready to resume.` : scheduledDay?.kind === "training" ? `${scheduledProgram!.name} · ${scheduledDay.exercises.length} exercises · ${scheduledDay.exercises.reduce((sum, entry) => sum + entry.sets, 0)} sets` : scheduledDay?.kind === "rest" ? `${scheduledProgram!.name} · Scheduled recovery. Your streak is protected. You can still start an extra workout.` : scheduledProgram ? `Your program starts ${scheduledProgram.schedule.startDate}. Until then, you can log an unplanned workout.` : "Choose your exercises and record each completed set. No account required."}
            </Text>
            {sessionNotice ? <Text style={[styles.noticeText, { color: theme.colors.secondaryText }]}>{sessionNotice}</Text> : null}
            {storageError ? <Text style={[styles.errorText, { color: theme.colors.accent }]}>{storageError}</Text> : null}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!isSessionReady || isStartingSession}
            onPress={() => { void startSession(); }}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: theme.colors.accent,
                opacity: pressed ? 0.82 : 1
              }
            ]}
          >
            <Ionicons name="play" size={18} color={theme.colors.onAccent} />
            <Text style={[styles.primaryButtonText, { color: theme.colors.onAccent }]}>{isStartingSession ? "Opening workout…" : isSessionReady ? sessionStartedAt ? "Resume workout" : scheduledDay?.kind === "rest" ? "Start an extra workout" : "Start workout" : "Loading session…"}</Text>
          </Pressable>
          {!sessionStartedAt && scheduledDay?.kind === "training" ? <Pressable
            accessibilityRole="button"
            accessibilityHint="Choose exercises yourself for this session. Your active program stays selected."
            disabled={!isSessionReady || isStartingSession}
            onPress={() => { void startSession(false); }}
            style={({ pressed }) => [styles.manualSessionButton, { opacity: !isSessionReady || isStartingSession ? 0.55 : pressed ? 0.78 : 1 }]}
          >
            <Text style={styles.manualSessionButtonText}>Start without program</Text>
          </Pressable> : null}
        </View>

        {!sessionStartedAt && scheduledDay?.kind === "training" ? <View style={styles.plannedSection}>
          <View style={styles.heroTopRow}><Text style={styles.programQueueTitle}>Planned exercises</Text><Text style={styles.programQueueHint}>Today</Text></View>
          <View style={styles.plannedGroup}>{scheduledDay.exercises.map((entry, index) => <View key={entry.id} style={[styles.plannedRow, index > 0 && styles.rowDivider]}>
            <View style={{ flex: 1, gap: 5 }}><Text style={styles.programQueueName}>{entry.exerciseName}</Text><Text style={styles.programQueueHint}>{formatProgramPrescription(entry)}</Text></View>
          </View>)}</View>
        </View> : null}
        <Pressable accessibilityRole="button" onPress={() => router.push("/programs")} style={styles.scheduleLink}>
          <Text style={styles.scheduleLinkText}>{scheduledProgram ? "Change or deactivate program" : "Select a training program"}</Text><Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </Pressable>
        {scheduleError ? <Text accessibilityRole="alert" style={styles.storageError}>{scheduleError}</Text> : null}
        <CoachOverview />
        <StreakCard streak={streak} onRest={saveRestDay} />

        <View style={styles.previousSessionsSection}>
          <View style={styles.previousSessionsHeader}>
            <Text style={[styles.previousSessionsTitle, { color: theme.colors.text }]}>Recent sessions</Text>
          </View>

          {previousSessions.length === 0 ? (
            <View style={[styles.emptySessionHistory, { borderColor: theme.colors.border }]}>
              <Text style={[styles.emptySessionHistoryText, { color: theme.colors.secondaryText }]}>
                Saved sessions will appear here after your first workout.
              </Text>
            </View>
          ) : (
            <View style={styles.previousSessionList}>
              {previousSessions.map((session) => (
                <PreviousSessionRow key={session.id} session={session} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    );
  }

  if (step === "active") {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.activeContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.activeHeader}>
          <View style={styles.heroTopRow}>
            <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>{programPlan ? "Program session" : "Active Session"}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityHint={loggedExercises.length > 0 ? "Return to Today and keep this unfinished workout ready to resume." : "Return to Today without saving a workout."}
              disabled={isSavingSession || isSavingExercise || isExitingSession}
              onPress={exitSession}
              style={({ pressed }) => [styles.exitSessionButton, { opacity: isSavingSession || isSavingExercise || isExitingSession ? 0.55 : pressed ? 0.78 : 1 }]}
            >
              <Ionicons name="exit-outline" size={18} color={colors.accent} />
              <Text style={styles.exitSessionText}>{isExitingSession ? "Exiting…" : "Exit session"}</Text>
            </Pressable>
          </View>
          <Text style={[styles.activeTitle, { color: theme.colors.text }]}>{programPlan?.programName ?? "Session Log"}</Text>
          {programPlan?.dayName ? <Text style={styles.programQueueHint}>{programPlan.dayName}</Text> : null}
          <Text style={[styles.activeMeta, { color: theme.colors.secondaryText }]}>
            Started {sessionStartedAt ? formatSessionTime(new Date(sessionStartedAt)) : "now"} / {loggedExercises.length} saved
          </Text>
          {storageError ? <Text style={[styles.errorText, { color: theme.colors.accent }]}>{storageError}</Text> : null}
        </View>

        {programPlan ? <View style={styles.programQueue}>
          <Text style={styles.programQueueTitle}>{pendingProgramExercises.length ? "Your planned exercises" : "All planned exercises logged."}</Text>
          <Text style={styles.programQueueHint}>{programPlan.exercises.length - pendingProgramExercises.length} of {programPlan.exercises.length} logged. Targets aren’t counted until you save each exercise.</Text>
          {pendingProgramExercises.map((entry) => <Pressable key={entry.id} accessibilityRole="button"
            accessibilityLabel={`Log ${entry.exerciseName}, ${formatProgramPrescription(entry)}`} disabled={isExitingSession || isSavingSession} onPress={() => selectProgramExercise(entry)} style={styles.programQueueRow}>
            <Text style={styles.programQueueOrder}>{programPlan.exercises.findIndex((item) => item.id === entry.id) + 1}</Text>
            <View style={{ flex: 1, gap: 6 }}><Text style={styles.programQueueName}>{entry.exerciseName}</Text>
              <Text style={styles.programQueueHint}>{formatProgramPrescription(entry)}</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.accent} />
          </Pressable>)}
        </View> : null}

        <View style={styles.sessionList}>
          {loggedExercises.length === 0 && !programPlan ? (
            <View style={styles.emptyActiveSession}>
              <Ionicons name="barbell-outline" size={32} color={theme.colors.accent} />
              <Text style={[styles.emptyActiveTitle, { color: theme.colors.text }]}>Your session starts here.</Text>
              <Text style={[styles.emptyActiveCopy, { color: theme.colors.secondaryText }]}>Find your first exercise and make this session your own.</Text>
            </View>
          ) : null}
          {loggedExercises.map((entry, index) => (
            <SessionEntryRow
              entry={entry}
              index={index}
              key={entry.id}
              onDelete={deleteLoggedExercise}
              onNoteSaved={(setNumber, note) => setLoggedExercises((current) => current.map((item) => item.id === entry.id ? withSetNote(item, setNumber, note) : item))}
            />
          ))}

          <Pressable
            accessibilityRole="button"
            disabled={isExitingSession || isSavingSession}
            onPress={() => setStep("picker")}
            style={({ pressed }) => [
              styles.addExerciseButton,
              {
                backgroundColor: theme.colors.accent,
                opacity: isExitingSession || isSavingSession ? 0.55 : pressed ? 0.82 : 1
              }
            ]}
          >
            <Ionicons name="add" size={20} color={theme.colors.onAccent} />
            <Text style={[styles.addExerciseText, { color: theme.colors.onAccent }]}>Add Exercise</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isSavingSession || isExitingSession}
            onPress={saveSession}
            style={({ pressed }) => [
              styles.saveSessionButton,
              {
                borderColor: theme.colors.border,
                opacity: isSavingSession || isExitingSession ? 0.55 : pressed ? 0.78 : 1
              }
            ]}
          >
            <Ionicons name="save-outline" size={20} color={theme.colors.text} />
            <Text style={[styles.saveSessionText, { color: theme.colors.text }]}>
              {isSavingSession ? "Saving Session" : "Save Session"}
            </Text>
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
        keyboardShouldPersistTaps="handled"
      >
        <Pressable accessibilityRole="button" onPress={() => setStep("picker")} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
          <Text style={[styles.backText, { color: theme.colors.text }]}>Exercises</Text>
        </Pressable>

        <View style={styles.detailHero}>
          <View style={styles.heroText}>
            <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>Custom</Text>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Add Exercise</Text>
            <Text style={[styles.heroMeta, { color: theme.colors.secondaryText }]}>Name the movement, then record each completed set.</Text>
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
        keyboardShouldPersistTaps="handled"
      >
        <Pressable accessibilityRole="button" disabled={isSavingExercise} onPress={() => setStep(selectedProgramEntryId ? "active" : "picker")} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
          <Text style={[styles.backText, { color: theme.colors.text }]}>{selectedProgramEntryId ? "Session" : "Exercises"}</Text>
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

        {selectedProgramEntryId ? <View style={styles.programQueue}>
          <Text style={styles.programQueueTitle}>Planned target</Text>
          <Text style={styles.programQueueHint}>{(() => { const entry = programPlan?.exercises.find((item) => item.id === selectedProgramEntryId); return entry ? formatProgramPrescription(entry) : ""; })()}</Text>
        </View> : null}
        <CoachedSetLogger key={`${selectedExercise.id}:${selectedProgramEntryId ?? "manual"}`} exerciseId={selectedExercise.id}
          entry={programPlan?.exercises.find((item) => item.id === selectedProgramEntryId)} readiness={readiness} onReadiness={setReadiness}
          saving={isSavingExercise} onSave={saveExerciseToSession} />
        {storageError ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.danger }]}>{storageError}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <ExerciseBrowser onSelect={selectExercise} header={
      <View>
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

      </View>
    } />
  );
}

function formatSessionTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatSessionDate(date: Date) {
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatVolume(value: number) {
  return Math.round(value).toLocaleString();
}

function withSetNote(entry: StoredSessionExercise, setNumber: number, note: string | null): StoredSessionExercise {
  return { ...entry, actualSets: getActualSets(entry).map((set, index) => index + 1 === setNumber ? { ...set, note } : set) };
}

type PreviousSessionRowProps = {
  session: CompletedWorkoutSession;
};

function PreviousSessionRow({ session }: PreviousSessionRowProps) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const theme = useAppTheme();
  const completedAt = new Date(session.completedAt);
  const exerciseLabel = session.exerciseCount === 1 ? "exercise" : "exercises";
  const setLabel = session.totalSets === 1 ? "set" : "sets";
  const volumeUnit = Math.round(session.totalVolume) === 1 ? "lb" : "lbs";
  const [expanded, setExpanded] = useState(false);
  const [exercises, setExercises] = useState<StoredSessionExercise[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadRequest = useRef(0);
  useEffect(() => () => { loadRequest.current += 1; }, []);
  async function loadExercises() {
    const request = ++loadRequest.current;
    setLoading(true); setError("");
    try {
      const data = await getWorkoutSessionExercises(session.id);
      if (request === loadRequest.current) setExercises(data);
    } catch {
      if (request === loadRequest.current) setError("Could not load the sets and notes. Please try again.");
    } finally { if (request === loadRequest.current) setLoading(false); }
  }

  return (
    <View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
      accessibilityLabel={`Workout ${formatSessionDate(completedAt)} at ${formatSessionTime(completedAt)}, ${session.totalSets} ${setLabel}`}
      accessibilityHint="Open saved exercises, sets, and private notes."
      onPress={() => { setExpanded(!expanded); if (!expanded && !exercises && !loading) void loadExercises(); }}
      style={[styles.previousSessionRow, { borderColor: theme.colors.border }]}>
      <View style={styles.previousSessionMeta}>
        <Text style={[styles.previousSessionDate, { color: theme.colors.text }]}>
          {formatSessionDate(completedAt)} / {formatSessionTime(completedAt)}
        </Text>
        <Text style={[styles.previousSessionDetails, { color: theme.colors.secondaryText }]}>
          {session.exerciseCount} {exerciseLabel} / {session.totalSets} {setLabel}{session.totalDurationSeconds > 0 ? ` / ${formatDuration(session.totalDurationSeconds)} timed work` : ""}
        </Text>
      </View>
      <View style={styles.previousSessionVolume}>
        <Text style={[styles.previousSessionVolumeValue, { color: theme.colors.text }]}>
          {session.totalVolume === 0 && session.totalDurationSeconds > 0 ? formatDuration(session.totalDurationSeconds) : `${formatVolume(session.totalVolume)} ${volumeUnit}`}
        </Text>
        <Text style={[styles.previousSessionVolumeLabel, { color: theme.colors.mutedText }]}>{session.totalVolume === 0 && session.totalDurationSeconds > 0 ? "Timed work" : "Volume"}</Text>
      </View>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedText} style={{ marginLeft: 8 }} />
    </Pressable>
    <View style={[styles.historyDetails, !expanded && { display: "none" }]}>
      {loading ? <Text style={styles.programQueueHint}>Loading sets and notes…</Text> : null}
      {error ? <>
        <Text accessibilityRole="alert" style={styles.storageError}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => { void loadExercises(); }} style={styles.exitSessionButton}><Text style={styles.exitSessionText}>Try again</Text></Pressable>
      </> : null}
      {exercises?.map((entry) => <View key={entry.id} style={styles.historyExercise}>
        <Text style={styles.programQueueName}>{entry.exercise.name}</Text>
        <SavedSetNotes entry={entry} expandedInitially onNoteSaved={(setNumber, note) => setExercises((current) => current?.map((item) => item.id === entry.id ? withSetNote(item, setNumber, note) : item) ?? null)} />
      </View>)}
    </View>
    </View>
  );
}

type SessionEntryRowProps = {
  entry: SessionLogEntry;
  index: number;
  onDelete: (entryId: string) => void;
  onNoteSaved: (setNumber: number, note: string | null) => void;
};

function SessionEntryRow({ entry, index, onDelete, onNoteSaved }: SessionEntryRowProps) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
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
            useNativeDriver: supportsNativeAnimatedDriver
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(rowTranslateX.current, {
            friction: 8,
            tension: 70,
            toValue: 0,
            useNativeDriver: supportsNativeAnimatedDriver
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
        style={[styles.deleteReveal, { backgroundColor: theme.colors.danger }]}
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
          {getActualSets(entry).map((set, i) => `${i + 1}: ${set.durationSeconds != null ? formatDuration(set.durationSeconds) : `${set.reps} reps`} × ${set.weight} lb${set.warmup ? " (warm-up)" : ""}`).join(" · ")}
        </Text>
      </Animated.View>
      <View style={styles.savedNotes}><SavedSetNotes entry={entry} onNoteSaved={onNoteSaved} /></View>
    </View>
  );
}

const themedStyles = createThemedStyles((colors, ui) => ({
  historyDetails: { gap: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  historyExercise: { gap: 4 },
  savedNotes: { paddingHorizontal: 20, paddingBottom: 12 },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" },
  exitSessionButton: { alignItems: "center", flexDirection: "row", gap: 6, minHeight: 44, paddingHorizontal: 8 },
  exitSessionText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  plannedSection: { gap: 12, marginTop: 24 },
  plannedGroup: { ...ui.group, paddingHorizontal: 16 },
  plannedRow: { paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  scheduleLink: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  scheduleLinkText: { color: colors.accent, fontSize: 14, fontWeight: "500" },
  todayProgram: { ...ui.group, padding: 22, marginTop: 26, gap: 12 },
  programQueueLabel: { color: colors.accent, fontSize: 11, fontWeight: "700", letterSpacing: 0.7 },
  todayProgramTitle: { color: colors.text, fontSize: 22, fontWeight: "600" },
  todayProgramButton: { ...ui.primary, minHeight: 48, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 4 },
  todayProgramButtonText: { color: colors.onAccent, fontSize: 13, fontWeight: "700" },
  storageError: { color: colors.danger, fontSize: 13, lineHeight: 21, marginTop: 16 },
  programQueue: { ...ui.group, padding: 22, gap: 16, marginTop: 24 },
  programQueueTitle: { color: colors.text, fontSize: 20, fontWeight: "600" },
  programQueueHint: { color: colors.secondaryText, fontSize: 12, lineHeight: 19 },
  programQueueRow: { paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 76 },
  programQueueOrder: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  programQueueName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  emptyActiveSession: { ...ui.input, padding: 28, gap: 14, alignItems: "center" },
  emptyActiveTitle: { fontSize: 18, fontWeight: "600", textAlign: "center" },
  emptyActiveCopy: { fontSize: 14, lineHeight: 22, textAlign: "center" },
  heroSymbol: { ...ui.input, alignItems: "center", justifyContent: "center", width: 78, height: 78, borderRadius: 39, marginBottom: 24 },
  activeContent: {
    ...ui.content,
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
    fontSize: 30,
    fontWeight: "600",
    lineHeight: 39,
    textTransform: "none"
  },
  addExerciseButton: {
    ...ui.primary,
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
    fontWeight: "600",
    textTransform: "none"
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    minHeight: 44,
    paddingRight: 12,
    paddingBottom: 4,
  },
  backText: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "none"
  },
  categorySection: {
    gap: 12,
    marginTop: 30
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "600",
    textTransform: "none"
  },
  controlHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  controlLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "none"
  },
  controlPanel: {
    ...ui.group,
    borderWidth: 0,
    gap: 18,
    padding: 22,
  },
  controlValue: {
    fontSize: 30,
    fontWeight: "600",
    textAlign: "right",
    color: colors.accent,
  },
  controls: {
    gap: 22,
    marginTop: 26,
  },
  deleteReveal: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    top: 0,
    width: 86,
    borderRadius: 22,
  },
  customExerciseButton: {
    ...ui.control,
    alignItems: "center",
    borderWidth: 0,
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
    minHeight: 72,
    padding: 14,
    borderRadius: 18,
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
    fontWeight: "600",
    textTransform: "none"
  },
  customNameInput: {
    ...ui.input,
    borderWidth: 0,
    fontSize: 18,
    fontWeight: "500",
    marginTop: 12,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textTransform: "none"
  },
  customNamePanel: {
    ...ui.group,
    borderWidth: 0,
    marginTop: 18,
    padding: 18
  },
  detailHero: {
    gap: 18,
    marginTop: 8
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  exerciseCard: {
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 238,
    overflow: "hidden",
    width: "48%"
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 4,
    textTransform: "none"
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
    backgroundColor: colors.accentSoft,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%"
  },
  exerciseMeta: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 6,
    textTransform: "none"
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18
  },
  exerciseText: {
    minHeight: 74,
    padding: 12
  },
  heroMeta: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    marginTop: 8
  },
  heroText: {
    maxWidth: 520
  },
  heroTitle: {
    fontSize: 29,
    fontWeight: "600",
    lineHeight: 36,
    marginTop: 8,
    textTransform: "none"
  },
  loggerContent: {
    ...ui.content,
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
  noticeText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 4,
    textTransform: "none"
  },
  previousSessionDate: {
    fontSize: 15,
    fontWeight: "600",
    textTransform: "none"
  },
  previousSessionDetails: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 17,
    marginTop: 6,
    textTransform: "none"
  },
  previousSessionList: {
    ...ui.group,
    paddingHorizontal: 16,
  },
  previousSessionMeta: {
    flex: 1,
    paddingRight: 16
  },
  previousSessionRow: {
    borderRadius: 0,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 78,
    paddingHorizontal: 0,
    paddingVertical: 12,
  },
  previousSessionsHeader: {
    gap: 4,
  },
  previousSessionsSection: {
    gap: 14,
    marginTop: 34,
    width: "100%"
  },
  previousSessionsTitle: {
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 27,
    textTransform: "none"
  },
  previousSessionVolume: {
    alignItems: "flex-end"
  },
  previousSessionVolumeLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
    textTransform: "none"
  },
  previousSessionVolumeValue: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.accent,
  },
  emptySessionHistory: {
    ...ui.input,
    alignItems: "center",
    borderWidth: 0,
    minHeight: 78,
    justifyContent: "center",
    padding: 24,
  },
  emptySessionHistoryText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
    textTransform: "none"
  },
  pickerContent: {
    ...ui.content,
  },
  pickerHeader: {
    gap: 10,
    marginTop: 8
  },
  pickerTitle: {
    fontSize: 29,
    fontWeight: "600",
    lineHeight: 36,
    textTransform: "none"
  },
  primaryButton: {
    ...ui.primary,
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 24,
    minHeight: 56,
    minWidth: 0,
    paddingHorizontal: 24,
    paddingVertical: 14,
    width: "100%",
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "none"
  },
  manualSessionButton: {
    ...ui.control,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  manualSessionButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  saveButton: {
    ...ui.primary,
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
    fontWeight: "600",
    textTransform: "none"
  },
  restDayButton: {
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  restDayButtonText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "none"
  },
  saveSessionButton: {
    ...ui.control,
    alignItems: "center",
    borderWidth: 0,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 24,
    paddingVertical: 14
  },
  saveSessionText: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "none"
  },
  screen: {
    flex: 1
  },
  sessionEntry: {
    backgroundColor: colors.surface,
    borderWidth: 0,
    minHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
    padding: 20,
  },
  sessionEntryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },

  sessionEntryIndex: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "none"
  },
  sessionEntryName: {
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: 10,
    textTransform: "none"
  },
  sessionEntryStats: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 6
  },
  sessionEntryTime: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "none"
  },
  sessionList: {
    gap: 20,
    marginTop: 26,
  },
  sessionSwipeShell: {
    ...ui.group,
    overflow: "visible",
    position: "relative",
    borderRadius: 22,
  },
  fixedSliderMarkerDot: {
    borderColor: colors.surface,
    borderRadius: 14,
    borderWidth: 2,
    height: 30,
    left: "50%",
    marginLeft: -10,
    marginTop: -15,
    position: "absolute",
    top: "50%",
    width: 20,
  },
  rulerWindow: {
    ...ui.input,
    height: 64,
    overflow: "hidden",
    position: "relative"
  },
  sliderHitArea: {
    justifyContent: "center",
    minHeight: 64
  },
  startContent: {
    ...ui.content,
  },
  startHero: {
    ...ui.group,
    padding: 20,
  },
  streakCard: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
    maxWidth: 360,
    padding: 16,
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth
  },
  streakCardCopy: {
    flex: 1
  },
  streakDescription: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3
  },
  streakValue: {
    fontSize: 24,
    fontWeight: "600",
    marginTop: 4
  },
  startCopy: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 340,
    textAlign: "left"
  },
  startHeader: {
    alignItems: "stretch"
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
    fontWeight: "600",
    textAlign: "center",
    textTransform: "none"
  },
  startTitle: {
    fontSize: 27,
    fontWeight: "600",
    letterSpacing: -0.7,
    marginTop: 10,
    textAlign: "left",
    textTransform: "none",
    lineHeight: 34,
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
}));
