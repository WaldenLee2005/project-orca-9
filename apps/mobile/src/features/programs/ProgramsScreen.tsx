import { useThemeStyles } from "../../theme/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { AppState, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ScreenHeading } from "../../components/ScreenHeading";
import { ExerciseBrowser } from "../exercises/ExerciseBrowser";
import { ProgramExerciseList, type ProgramScrollMetrics } from "./ProgramExerciseList";
import { getDaySlotLabel, getProgramDayName, getScheduledDayIndex, isProgramLoadCoachingEnabled, localDateKey, PROGRAM_LIMITS, type ProgramDay, type ProgramDraft, type TrainingProgram, type ProgramExercise, type ProgramSchedule } from "./programModel";
import { emptyProgramDay, ProgramScheduleEditor } from "./ProgramScheduleEditor";
import { sessionExercises, type CatalogExercise } from "../workouts/repdbSessionExercises";
import { createLocalId } from "../../storage/database";
import { deleteTrainingProgram, getProgramLibrary, saveTrainingProgram, setActiveTrainingProgram } from "../../storage/programsRepository";
import { getActiveWorkoutSession, getCompletedProgramDays } from "../../storage/workoutsRepository";
import { subscribeToTrainingChanges } from "../../storage/trainingChanges";
import { createThemedStyles } from "../../theme/designSystem";
import { ProgramImportScreen } from "./ProgramImportScreen";
import { StarterProgramLibrary } from "./StarterProgramLibrary";
import { ProgramDaysOverview } from "./ProgramOverview";
import { createStarterProgram, STARTER_GUIDANCE, type StarterProgram } from "./starterPrograms";
import { LoadCoachingToggle } from "../coach/CoachControls";

export default function ProgramsScreen() {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const router = useRouter();
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [starterName, setStarterName] = useState<string | null>(null);
  const [importScheduleConfirmed, setImportScheduleConfirmed] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [previewProgramId, setPreviewProgramId] = useState<string | null>(null);
  const [previewStarter, setPreviewStarter] = useState<StarterProgram | null>(null);
  const [activeProgramId, setActiveProgramId] = useState<string | null>(null);
  const [activeSchedule, setActiveSchedule] = useState<ProgramSchedule | null>(null);
  const [restartedAt, setRestartedAt] = useState<string | null>(null);
  const [completedDays, setCompletedDays] = useState<Array<{ programId: string; dayId: string }>>([]);
  const [scheduleDate, setScheduleDate] = useState(localDateKey());
  const [followConfirm, setFollowConfirm] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [lastAdded, setLastAdded] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [blockedProgram, setBlockedProgram] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const baseline = useRef("");
  const busy = useRef(false);
  const loadVersion = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollMetrics = useRef<ProgramScrollMetrics>({ offset: 0, height: 0, contentHeight: 0, top: 0 });
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true, lastDate = localDateKey();
    setIsLoading(true);
    setBlockedProgram(null);
    async function refresh() {
      const version = ++loadVersion.current;
      const date = localDateKey();
      try {
        const [result, completed] = await Promise.all([getProgramLibrary(), getCompletedProgramDays(date)]);
        if (!active || version !== loadVersion.current) return;
        if (date !== localDateKey()) { lastDate = localDateKey(); void refresh(); return; }
        setPrograms(result.programs); setActiveProgramId(result.activeProgramId); setCompletedDays(completed); setScheduleDate(date); setLibraryError(null);
        setActiveSchedule(result.activeSchedule ?? null); setRestartedAt(result.restartedAt ?? null);
      } catch (cause) {
        if (active && version === loadVersion.current) setLibraryError(cause instanceof Error ? cause.message : "Could not load your programs. Please try again.");
      } finally { if (active && version === loadVersion.current) setIsLoading(false); }
    }
    setError(null);
    void refresh();
    const unsubscribe = subscribeToTrainingChanges(() => { void refresh(); });
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    const timer = setInterval(() => { const today = localDateKey(); if (today !== lastDate) { lastDate = today; void refresh(); } }, 30000);
    return () => { active = false; unsubscribe(); subscription.remove(); clearInterval(timer); };
  }, [reloadKey]));

  const activeProgram = programs.find((program) => program.id === activeProgramId);
  const activeDayIndex = activeProgram ? getScheduledDayIndex(activeSchedule ?? activeProgram.schedule, activeProgram.days.length, scheduleDate) : -1;
  const activeDay = activeProgram?.days[activeDayIndex];
  const activeDayCompleted = Boolean(activeProgram && activeDay && completedDays.some((day) => day.programId === activeProgram.id && day.dayId === activeDay.id));
  const displayedPrograms = [...programs].sort((a, b) => Number(b.id === activeProgramId) - Number(a.id === activeProgramId));
  const savedPreview = programs.find((program) => program.id === previewProgramId);
  const starterPreview = useMemo(() => {
    if (!previewStarter) return null;
    let id = 0;
    return createStarterProgram(previewStarter.id, scheduleDate, sessionExercises, (prefix) => `preview-${prefix}-${++id}`);
  }, [previewStarter, scheduleDate]);
  const overview = savedPreview ?? starterPreview;

  const selectedDay = draft?.days[selectedDayIndex];
  const addedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedDay?.exercises.forEach((entry) => { counts[entry.exerciseId] = (counts[entry.exerciseId] ?? 0) + 1; });
    return counts;
  }, [selectedDay?.exercises]);

  function updateDay(update: Partial<ProgramDay>) {
    setDraft((current) => current ? { ...current, days: current.days.map((day, index) => index === selectedDayIndex ? { ...day, ...update } : day) } : current);
  }

  function openEditor(program?: TrainingProgram) {
    if (!program) { setPreviewProgramId(null); setPreviewStarter(null); }
    setImported(false); setImportScheduleConfirmed(false); setStarterName(null);
    const next: ProgramDraft = program
      ? { id: program.id, name: program.name, loadCoachingEnabled: isProgramLoadCoachingEnabled(program), schedule: { ...program.schedule }, days: program.days.map((day) => ({ ...day, exercises: day.exercises.map((entry) => ({ ...entry, target: { ...entry.target }, ...(entry.load ? { load: { ...entry.load } } : {}) })) })) }
      : { name: "", loadCoachingEnabled: false, schedule: { mode: "weekly", startDate: localDateKey() }, days: Array.from({ length: 7 }, emptyProgramDay) };
    baseline.current = JSON.stringify(next);
    scrollMetrics.current.offset = 0;
    setDraft(next); setSelectedDayIndex(0); setPicking(false); setError(null); setNotice(null); setDiscarding(false); setDeleting(null); setFollowConfirm(null);
  }

  function useStarter(starter: StarterProgram) {
    if (busy.current || isLoading) return;
    try {
      const next = createStarterProgram(starter.id, localDateKey(), sessionExercises, createLocalId);
      // A preset is an unsaved draft, so leaving it also requires confirmation.
      baseline.current = ""; scrollMetrics.current.offset = 0;
      setDraft(next); setStarterName(starter.name); setImported(false); setImportScheduleConfirmed(false);
      setSelectedDayIndex(0); setPicking(false); setError(null); setNotice(null); setDiscarding(false); setDeleting(null); setFollowConfirm(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open this starter program."); }
  }

  function closeEditor() {
    if (busy.current || isDragging) return;
    if (JSON.stringify(draft) !== baseline.current) { setDiscarding(true); return; }
    setDraft(null); setError(null);
  }

  function closeOverview() {
    if (busy.current) return;
    setPreviewProgramId(null); setPreviewStarter(null); setFollowConfirm(null); setDeleting(null); setBlockedProgram(null); setError(null); setNotice(null);
  }

  function addExercise(exercise: CatalogExercise) {
    if (!draft || !selectedDay || selectedDay.kind !== "training") return;
    if (selectedDay.exercises.length >= PROGRAM_LIMITS.exercises) {
      setError(`A day can contain up to ${PROGRAM_LIMITS.exercises} exercises.`); return;
    }
    const entry: ProgramExercise = { id: createLocalId("program-exercise"), exerciseId: exercise.id, exerciseName: exercise.name, sets: 3, target: { kind: "reps", reps: 8 } };
    setDraft((current) => current ? { ...current, days: current.days.map((day) => day.id === selectedDay.id && day.exercises.length < PROGRAM_LIMITS.exercises
      ? { ...day, exercises: [...day.exercises, entry] } : day) } : current);
    setLastAdded(`${exercise.name} added.`); setError(null);
  }

  async function save() {
    if (!draft || busy.current || isDragging) return;
    if (imported && !importScheduleConfirmed) { setError("Confirm the imported schedule and rest days before saving."); return; }
    busy.current = true; ++loadVersion.current; setIsSaving(true); setError(null);
    try {
      const program = await saveTrainingProgram(draft);
      setPrograms((current) => [program, ...current.filter((item) => item.id !== program.id)]);
      setDraft(null); setPreviewProgramId(program.id); setPreviewStarter(null); setNotice("Program saved."); setDiscarding(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your program. Your changes are still here."); }
    finally { busy.current = false; setIsSaving(false); setIsLoading(false); }
  }

  async function removeProgram(program: TrainingProgram) {
    if (busy.current) return;
    busy.current = true; ++loadVersion.current; setIsSaving(true); setError(null);
    try {
      await deleteTrainingProgram(program.id);
      if (activeProgramId === program.id) setActiveProgramId(null);
      setPrograms((current) => current.filter((item) => item.id !== program.id));
      setPreviewProgramId(null);
      setDeleting(null); setNotice(`${program.name} deleted. Workout history is unchanged.`);
    } catch { setError("Could not delete that program. Please try again."); }
    finally { busy.current = false; setIsSaving(false); setIsLoading(false); }
  }

  async function followProgram(id: string | null) {
    if (busy.current) return;
    busy.current = true; ++loadVersion.current; setIsSaving(true); setError(null);
    try {
      await setActiveTrainingProgram(id);
      setActiveProgramId(id); setFollowConfirm(null);
      const name = programs.find((program) => program.id === id)?.name;
      setNotice(id ? `${name ?? "Program"} is now active.` : "Program deactivated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change the active schedule."); }
    finally { busy.current = false; setIsSaving(false); setIsLoading(false); }
  }

  async function activateStarter(starter: StarterProgram) {
    if (busy.current) return;
    busy.current = true; ++loadVersion.current; setIsSaving(true); setError(null);
    try {
      const next = createStarterProgram(starter.id, localDateKey(), sessionExercises, createLocalId);
      const program = await saveTrainingProgram(next);
      // Keep the saved copy reviewable even if the separate activation write fails.
      setPrograms((current) => [program, ...current.filter((item) => item.id !== program.id)]);
      setPreviewProgramId(program.id); setPreviewStarter(null); setFollowConfirm(null);
      await setActiveTrainingProgram(program.id);
      setActiveProgramId(program.id); setNotice(`${program.name} is now active.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not activate this program. Please try again."); }
    finally { busy.current = false; setIsSaving(false); setIsLoading(false); }
  }

  async function startProgram(program: TrainingProgram, day: ProgramDay) {
    if (busy.current) return;
    busy.current = true; setStarting(program.id); setError(null); setBlockedProgram(null);
    try {
      if (await getActiveWorkoutSession()) { setBlockedProgram(program.id); return; }
      router.push({ pathname: "/workouts", params: { programId: program.id, programDayId: day.id } });
    } catch { setError("Could not check your active session. Please try again."); }
    finally { busy.current = false; setStarting(null); }
  }

  if (importing) return <ProgramImportScreen onCancel={() => setImporting(false)} onReview={(next) => {
    const fresh = { ...next, days: next.days.map((day) => ({ ...day, id: createLocalId("program-day"), exercises: day.exercises.map((entry) => ({ ...entry, id: createLocalId("program-exercise"), target: { ...entry.target } })) })) };
    baseline.current = ""; scrollMetrics.current.offset = 0;
    setDraft(fresh); setSelectedDayIndex(Math.max(0, fresh.days.findIndex((day) => day.kind === "training")));
    setImported(true); setStarterName(null); setImportScheduleConfirmed(false); setImporting(false); setPicking(false); setDiscarding(false); setError(null); setNotice(null);
  }} />;

  if (draft && selectedDay && picking) {
    return <ExerciseBrowser onSelect={addExercise} addedCounts={addedCounts} header={
      <View style={styles.pickerHeader}>
        <Action label={`Done adding · ${selectedDay.exercises.length}`} icon="checkmark" onPress={() => { scrollMetrics.current.offset = 0; setPicking(false); setLastAdded(""); }} primary />
        <ScreenHeading eyebrow={`Orca · ${getProgramDayName(draft, selectedDay)}`} title="Add exercises" subtitle="Tap an exercise to add it to this day." />
        {lastAdded ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{lastAdded}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>
    } />;
  }

  if (draft && selectedDay) {
    return (
      <ScrollView key={`editor-${draft.id ?? "new"}`} ref={scrollRef} style={styles.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
        scrollEnabled={!isDragging} scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => { scrollMetrics.current.offset = nativeEvent.contentOffset.y; }}
        onContentSizeChange={(_width, height) => { scrollMetrics.current.contentHeight = height; }}
        onLayout={({ nativeEvent }) => { scrollMetrics.current.height = nativeEvent.layout.height; }}>
        <Pressable accessibilityRole="button" disabled={isSaving || isDragging} onPress={closeEditor} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.text} /><Text style={styles.backText}>{overview ? "Overview" : "Programs"}</Text>
        </Pressable>
        <ScreenHeading eyebrow="Orca · Program builder" title={draft.id ? "Edit program" : "New program"} subtitle="Choose a schedule, rest days, and exercise targets." />
        {starterName ? <View style={styles.starterNote}>
          <Text style={styles.label}>Your copy of {starterName}</Text>
          <Text style={styles.body}>Review the start date and each day below. Everything is editable. Save your copy, then activate it to automatically load workouts and protect rest days without logging.</Text>
          <Text style={styles.caption}>{STARTER_GUIDANCE}</Text>
        </View> : null}
        {discarding ? <Confirm title="Discard unsaved changes?" description="Your saved program will stay unchanged." confirmLabel="Discard changes" disabled={isSaving}
          onCancel={() => setDiscarding(false)} onConfirm={() => { setDraft(null); setDiscarding(false); setError(null); }} /> : null}
        <View style={styles.namePanel}>
          <Text style={styles.label}>Program name</Text>
          <TextInput accessibilityLabel="Program name" value={draft.name} onChangeText={(name) => setDraft((current) => current ? { ...current, name } : current)}
            placeholder="e.g. My strength program" placeholderTextColor={colors.mutedText} maxLength={PROGRAM_LIMITS.name} editable={!isSaving && !isDragging}
            autoCapitalize="sentences" returnKeyType="done" selectionColor={colors.accent} style={styles.nameInput} />
        </View>
        <LoadCoachingToggle scope="program" enabled={isProgramLoadCoachingEnabled(draft)} disabled={isSaving || isDragging}
          onChange={(loadCoachingEnabled) => setDraft((current) => current ? { ...current, loadCoachingEnabled } : current)} />
        <ProgramScheduleEditor draft={draft} onChange={setDraft} selectedIndex={selectedDayIndex} onSelect={setSelectedDayIndex} disabled={isSaving || isDragging} />
        {imported ? <Pressable accessibilityRole="checkbox" accessibilityLabel="Confirm imported schedule and rest days" accessibilityState={{ checked: importScheduleConfirmed }}
          disabled={isSaving || isDragging} onPress={() => setImportScheduleConfirmed(!importScheduleConfirmed)} style={[styles.namePanel, { flexDirection: "row", gap: 12, alignItems: "center" }]}>
          <Ionicons name={importScheduleConfirmed ? "checkbox" : "square-outline"} size={26} color={colors.accent} />
          <Text style={[styles.body, { flex: 1 }]}>I've checked the imported schedule, start date and every training/rest day. Saving keeps this program inactive until I activate it.</Text>
        </Pressable> : null}
        {selectedDay.kind === "training" ? <>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Exercises <Text style={styles.count}>{selectedDay.exercises.length}</Text></Text>
          <Text style={styles.caption}>{selectedDay.exercises.reduce((sum, entry) => sum + entry.sets, 0)} planned sets</Text>
        </View>
        {selectedDay.exercises.length ? <>
          <Text style={styles.reorderHint}>Drag the handle to reorder. Use the arrows for precise moves.</Text>
          <ProgramExerciseList key={selectedDay.id} entries={selectedDay.exercises} onChange={(exercises) => updateDay({ exercises })}
            scrollRef={scrollRef} scrollMetrics={scrollMetrics} onDraggingChange={setIsDragging} disabled={isSaving} />
        </> : <View style={styles.emptyEditor}><Ionicons name="barbell-outline" size={30} color={colors.accent} /><Text style={styles.body}>Add your first exercise, then choose sets and a rep or time target.</Text></View>}
          <Action label="Add exercises" icon="add" onPress={() => { setPicking(true); setError(null); }} disabled={isSaving || isDragging || selectedDay.exercises.length >= PROGRAM_LIMITS.exercises} />
        </> : null}
        <View style={[styles.editorActions, { marginTop: 28 }]}>
          {draft.id === activeProgramId ? <Text style={styles.caption}>Saving updates your active schedule from today. Earlier rest days and workout history stay unchanged.</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Action label={isSaving ? "Saving program…" : "Save program"} icon="checkmark" onPress={save} primary disabled={isSaving || isDragging || (imported && !importScheduleConfirmed)} />
          <Text style={styles.caption}>Saved on this device. No account required. Rep and time targets are per set.</Text>
        </View>
      </ScrollView>
    );
  }

  if (overview) {
    const isActive = savedPreview?.id === activeProgramId;
    const overviewId = savedPreview?.id ?? previewStarter!.id;
    const disabled = isLoading || isSaving || Boolean(starting) || Boolean(libraryError);
    const overviewSchedule = isActive ? activeSchedule ?? overview.schedule : overview.schedule;
    const todayIndex = getScheduledDayIndex(overviewSchedule, overview.days.length, scheduleDate);
    return <ScrollView key={`overview-${overviewId}`} style={styles.screen} contentContainerStyle={ui.content}>
      <Pressable accessibilityRole="button" disabled={isSaving || Boolean(starting)} onPress={closeOverview} style={styles.back}>
        <Ionicons name="chevron-back" size={20} color={colors.text} /><Text style={styles.backText}>Programs</Text>
      </Pressable>
      <ScreenHeading eyebrow={previewStarter ? "Orca · Starter program" : "Orca · Your program"} title={overview.name} subtitle={scheduleSummary(overview)} />
      <Text style={styles.overviewDate}>Starts {overview.schedule.startDate}</Text>
      <Text style={styles.caption}>Load coaching {isProgramLoadCoachingEnabled(overview) ? "on" : "off"} for this program</Text>
      <View style={styles.overviewActions}>
        <Action label={isSaving ? "Please wait…" : isActive ? "Active program" : "Activate program"} icon={isActive ? "checkmark-circle" : "play"} primary
          accessibilityLabel={isActive ? `${overview.name} is active` : `Activate ${overview.name}`} disabled={disabled || isActive}
          onPress={() => { setFollowConfirm(overviewId); setError(null); setNotice(null); }} />
        <Action label="Edit program" accessibilityLabel={`Edit program ${overview.name}`} icon="create-outline" disabled={disabled}
          onPress={() => savedPreview ? openEditor(savedPreview) : useStarter(previewStarter!)} />
      </View>
      {followConfirm === overviewId && !isActive ? <View accessibilityLiveRegion="polite" style={styles.confirm}>
        <Text style={styles.confirmTitle}>{activeProgram ? `Switch to ${overview.name}?` : `Activate ${overview.name}?`}</Text>
        <Text style={styles.body}>{previewStarter ? "Saves your own copy starting today. " : ""}{activeProgram ? `Replaces ${activeProgram.name}. ` : ""}Session follows this schedule and rest days protect your streak. Your current workout stays unchanged.</Text>
        <Action label={activeProgram ? "Confirm switch" : "Confirm activation"} icon="checkmark" primary disabled={isSaving}
          onPress={() => savedPreview ? followProgram(savedPreview.id) : activateStarter(previewStarter!)} />
        <Action label="Cancel" icon="close" disabled={isSaving} onPress={() => setFollowConfirm(null)} />
      </View> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{notice}</Text> : null}
      {error || libraryError ? <View style={styles.feedbackPanel}><Text accessibilityRole="alert" style={styles.error}>{error ?? libraryError}</Text>
        {libraryError ? <Action label="Retry loading" icon="refresh" onPress={() => setReloadKey((value) => value + 1)} /> : null}</View> : null}
      {blockedProgram === overviewId ? <View style={styles.feedbackPanel}><Text style={styles.body}>Finish your unfinished workout before starting another day. If no exercises are saved, you can exit it instead.</Text>
        <Action label="Go to active session" icon="arrow-forward" onPress={() => router.push("/workouts")} /></View> : null}
      {isActive && restartedAt ? <Text style={styles.caption}>Restarted after a missed day. Following the program's day order.</Text> : null}
      <ProgramDaysOverview program={{ ...overview, schedule: overviewSchedule }} todayIndex={todayIndex} disabled={disabled}
        completedDayIds={savedPreview ? completedDays.filter((day) => day.programId === savedPreview.id).map((day) => day.dayId) : undefined}
        onStartDay={savedPreview ? (day) => { void startProgram(savedPreview, day); } : undefined} />
      {savedPreview ? <View style={styles.managementActions}>
        {isActive ? <Action label="Deactivate program" icon="power-outline" disabled={disabled} onPress={() => { setFollowConfirm(overviewId); setNotice(null); }} /> : null}
        {followConfirm === overviewId && isActive ? <View accessibilityLiveRegion="polite" style={styles.confirm}>
          <Text style={styles.confirmTitle}>Deactivate {overview.name}?</Text>
          <Text style={styles.body}>Future sessions use manual tracking. Your current workout and earlier workout/rest history stay saved.</Text>
          <Action label="Confirm deactivation" icon="checkmark" primary disabled={isSaving} onPress={() => followProgram(null)} />
          <Action label="Keep active" icon="close" disabled={isSaving} onPress={() => setFollowConfirm(null)} />
        </View> : null}
        <Action label="Delete program" icon="trash-outline" disabled={disabled} onPress={() => setDeleting(overviewId)} />
        {deleting === overviewId ? <Confirm title={`Delete ${overview.name}?`} description="Removes this program and stops it if active. Your workout and earlier history stay saved. This can’t be undone."
          confirmLabel="Delete program" disabled={isSaving} onConfirm={() => removeProgram(savedPreview)} onCancel={() => setDeleting(null)} /> : null}
      </View> : <Text style={styles.footer}>Nothing is saved until you activate or save an edited copy.</Text>}
    </ScrollView>;
  }

  return (
    <ScrollView key="program-list" style={styles.screen} contentContainerStyle={ui.content}>
      <ScreenHeading eyebrow="Orca · Your training" title="Programs" subtitle="Your schedule, exercises, and rest days." />
      {!isLoading && !libraryError ? <View style={styles.activePanel}>
        <View style={styles.statusRow}><Ionicons name={activeProgram ? "checkmark-circle" : "barbell-outline"} size={22} color={colors.accent} />
          <Text style={styles.activeLabel}>{activeProgram ? "Active program" : "No active program"}</Text></View>
        <Text style={styles.programName}>{activeProgram?.name ?? "Track your way"}</Text>
        {activeProgram ? <>
          <Text style={styles.dayTitle}>{activeDay ? `Today · ${getDaySlotLabel((activeSchedule ?? activeProgram.schedule).mode, activeDayIndex)}${activeDay.name ? ` · ${activeDay.name}` : ""}` : `Starts ${activeProgram.schedule.startDate}`}</Text>
          <Text style={styles.body}>{activeDayCompleted ? "Completed today" : activeDay?.kind === "training" ? `${activeDay.exercises.length} exercises · ${activeDay.exercises.reduce((sum, entry) => sum + entry.sets, 0)} sets` : activeDay?.kind === "rest" ? "Rest day · Your streak is protected" : "Manual tracking until the start date"}</Text>
          {restartedAt === scheduleDate ? <Text style={styles.caption}>Missed a program day. Restarted at Day 1 today.</Text> : null}
          {!activeDayCompleted ? <Action label="Open today's session" icon="arrow-forward" primary onPress={() => router.push("/workouts")} disabled={isSaving || Boolean(starting)} /> : null}
          <Action label="View program" icon="list-outline" onPress={() => { setPreviewProgramId(activeProgram.id); setPreviewStarter(null); setError(null); setNotice(null); }} disabled={isSaving || Boolean(starting)} />
        </> : <Text style={styles.body}>Choose a program to fill your workouts automatically, or track your own sessions.</Text>}
      </View> : null}
      <Action label="Create program" icon="add" primary onPress={() => openEditor()} disabled={isLoading || isSaving || Boolean(starting)} />
      <View style={{ marginTop: 14 }}><Action label="Import program" icon="download-outline" onPress={() => { setImporting(true); setError(null); setNotice(null); }} disabled={isLoading || isSaving || Boolean(starting)} /></View>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{notice}</Text> : null}
      {error || libraryError ? <View style={styles.feedbackPanel}><Text accessibilityRole="alert" style={styles.error}>{error ?? libraryError}</Text><Action label="Retry loading" icon="refresh" onPress={() => setReloadKey((value) => value + 1)} /></View> : null}
      {isLoading ? <Text style={styles.feedback}>Loading your programs…</Text> : !programs.length && !error && !libraryError ? <Text style={styles.feedback}>No saved programs yet. Choose a starter below, import a plan, or create your own.</Text> : null}
      {programs.length ? <Text accessibilityRole="header" style={[styles.sectionTitle, { marginTop: 30 }]}>Your programs</Text> : null}
      <View style={styles.programList}>
        {displayedPrograms.map((program) => <Pressable key={program.id} accessibilityRole="button" accessibilityLabel={`View program ${program.name}`}
          accessibilityState={{ disabled: isSaving || Boolean(starting) }} disabled={isSaving || Boolean(starting)}
          onPress={() => { setPreviewProgramId(program.id); setPreviewStarter(null); setFollowConfirm(null); setDeleting(null); setBlockedProgram(null); setError(null); setNotice(null); }}
          style={({ pressed }) => [styles.programCard, styles.programSummary, { opacity: pressed ? 0.75 : 1 }]}>
          <View style={styles.programTitleBlock}>
            <Text style={styles.programName}>{program.name}</Text>
            <Text style={styles.caption}>{scheduleSummary(program)}</Text>
            {activeProgramId === program.id ? <Text style={styles.notice}>Active program</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.accent} />
        </Pressable>)}
      </View>
      <StarterProgramLibrary onPreview={(starter) => { setPreviewStarter(starter); setPreviewProgramId(null); setFollowConfirm(null); setError(null); setNotice(null); }} disabled={isLoading || isSaving || Boolean(starting)} />
      <Text style={styles.footer}>Programs stay on this device and work without an account.</Text>
    </ScrollView>
  );
}

function scheduleSummary(program: ProgramDraft) {
  return `${program.schedule.mode === "weekly" ? "Weekly" : `${program.days.length}-day cycle`} · ${program.days.filter((day) => day.kind === "training").length} training · ${program.days.filter((day) => day.kind === "rest").length} rest`;
}

function Action({ label, accessibilityLabel, icon, onPress, primary, disabled }: {
  label: string; accessibilityLabel?: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; primary?: boolean; disabled?: boolean;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, primary ? ui.primary : ui.control, { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}>
    <Ionicons name={icon} size={19} color={primary ? colors.onAccent : colors.accent} />
    <Text style={[styles.actionText, { color: primary ? colors.onAccent : colors.text }]}>{label}</Text>
  </Pressable>;
}

function Confirm({ title, description, confirmLabel, disabled, onConfirm, onCancel }: {
  title: string; description: string; confirmLabel: string; disabled: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  return <View accessibilityLiveRegion="polite" style={styles.confirm}>
    <Text style={styles.confirmTitle}>{title}</Text><Text style={styles.body}>{description}</Text>
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onConfirm} style={styles.confirmDelete}>
      <Text style={styles.confirmDeleteText}>{disabled ? "Please wait…" : confirmLabel}</Text>
    </Pressable>
    <Action label={confirmLabel === "Delete program" ? "Keep program" : "Keep editing"} icon="arrow-back" onPress={onCancel} disabled={disabled} />
  </View>;
}

const themedStyles = createThemedStyles((colors, ui) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  action: { minHeight: 52, paddingHorizontal: 18, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  actionText: { fontSize: 14, fontWeight: "700" }, back: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, marginBottom: 12, alignSelf: "flex-start" },
  backText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  emptyState: { ...ui.group, padding: 26, marginTop: 28, gap: 16 }, emptyEditor: { ...ui.input, alignItems: "center", padding: 24, gap: 16, marginBottom: 22 },
  body: { color: colors.secondaryText, fontSize: 13, lineHeight: 21 }, caption: { color: colors.secondaryText, fontSize: 12, lineHeight: 18 },
  feedback: { color: colors.secondaryText, fontSize: 13, lineHeight: 21, marginTop: 20 }, notice: { color: colors.accent, fontSize: 13 },
  feedbackPanel: { gap: 14, marginTop: 12 }, error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  footer: { color: colors.mutedText, fontSize: 12, lineHeight: 20, marginTop: 28, textAlign: "center" },
  namePanel: { gap: 12 }, label: { color: colors.secondaryText, fontSize: 13, fontWeight: "600" },
  starterNote: { ...ui.group, padding: 18, gap: 10, marginBottom: 24 },
  nameInput: { ...ui.input, color: colors.text, fontSize: 17, padding: 18, minHeight: 56 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 30, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: "600", letterSpacing: -0.5 }, count: { color: colors.accent, fontSize: 17 },
  reorderHint: { color: colors.mutedText, fontSize: 12, lineHeight: 19, marginBottom: 20 },
  editorActions: { gap: 20 }, pickerHeader: { gap: 22 },
  programList: { gap: 16, marginTop: 24 }, programCard: { ...ui.group, padding: 18, gap: 14 },
  programSummary: { flexDirection: "row", alignItems: "center" }, programTitleBlock: { flex: 1, minWidth: 0, gap: 5 },
  overviewDate: { color: colors.secondaryText, fontSize: 12, lineHeight: 18, marginTop: -16, marginBottom: 20 },
  overviewActions: { gap: 12 }, managementActions: { gap: 12, marginTop: 30 },
  activePanel: { ...ui.group, padding: 18, gap: 14, marginBottom: 24 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 }, activeLabel: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  programName: { color: colors.text, fontSize: 23, lineHeight: 30, fontWeight: "700", letterSpacing: -0.5 },
  dayTitle: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: "600", marginTop: 6 },
  confirm: { ...ui.input, padding: 20, gap: 16, marginVertical: 16 }, confirmTitle: { color: colors.text, fontSize: 17, lineHeight: 24, fontWeight: "600" },
  confirmDelete: { backgroundColor: colors.danger, borderRadius: 16, minHeight: 48, alignItems: "center", justifyContent: "center", padding: 12 },
  confirmDeleteText: { color: colors.onAccent, fontSize: 14, fontWeight: "700" }
}));
