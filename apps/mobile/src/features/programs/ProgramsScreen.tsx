import { useThemeStyles } from "../../theme/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenHeading } from "../../components/ScreenHeading";
import { ExerciseBrowser } from "../exercises/ExerciseBrowser";
import { ProgramExerciseList, type ProgramScrollMetrics } from "./ProgramExerciseList";
import { formatProgramPrescription, getDaySlotLabel, getProgramDayName, getScheduledDayIndex, localDateKey, PROGRAM_LIMITS, type ProgramDay, type ProgramDraft, type TrainingProgram, type ProgramExercise } from "./programModel";
import { emptyProgramDay, ProgramDayPicker, ProgramScheduleEditor } from "./ProgramScheduleEditor";
import { sessionExercises, type CatalogExercise } from "../workouts/repdbSessionExercises";
import { createLocalId } from "../../storage/database";
import { deleteTrainingProgram, getProgramLibrary, saveTrainingProgram, setActiveTrainingProgram } from "../../storage/programsRepository";
import { getActiveWorkoutSession } from "../../storage/workoutsRepository";
import { createThemedStyles } from "../../theme/designSystem";
import { ProgramImportScreen } from "./ProgramImportScreen";
import { StarterProgramLibrary } from "./StarterProgramLibrary";
import { createStarterProgram, STARTER_GUIDANCE, type StarterProgram } from "./starterPrograms";

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
  const [previewDays, setPreviewDays] = useState<Record<string, number>>({});
  const [activeProgramId, setActiveProgramId] = useState<string | null>(null);
  const [followConfirm, setFollowConfirm] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [lastAdded, setLastAdded] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [blockedProgram, setBlockedProgram] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const baseline = useRef("");
  const busy = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollMetrics = useRef<ProgramScrollMetrics>({ offset: 0, height: 0, contentHeight: 0, top: 0 });
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setIsLoading(true);
    setBlockedProgram(null);
    getProgramLibrary().then((result) => {
      if (active) { setPrograms(result.programs); setActiveProgramId(result.activeProgramId); setError(null); }
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load your programs. Please try again.");
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [reloadKey]));

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
    setImported(false); setImportScheduleConfirmed(false); setStarterName(null);
    const next: ProgramDraft = program
      ? { id: program.id, name: program.name, schedule: { ...program.schedule }, days: program.days.map((day) => ({ ...day, exercises: day.exercises.map((entry) => ({ ...entry, target: { ...entry.target } })) })) }
      : { name: "", schedule: { mode: "weekly", startDate: localDateKey() }, days: Array.from({ length: 7 }, emptyProgramDay) };
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
    busy.current = true; setIsSaving(true); setError(null);
    try {
      const program = await saveTrainingProgram(draft);
      setPrograms((current) => [program, ...current.filter((item) => item.id !== program.id)]);
      setDraft(null); setNotice(`${program.name} saved on this device.${activeProgramId === program.id ? " Active schedule updated from today; earlier streak history is unchanged." : " Turn it on to automatically load today's exercises and protect rest days."}`); setDiscarding(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your program. Your changes are still here."); }
    finally { busy.current = false; setIsSaving(false); }
  }

  async function removeProgram(program: TrainingProgram) {
    if (busy.current) return;
    busy.current = true; setIsSaving(true); setError(null);
    try {
      await deleteTrainingProgram(program.id);
      if (activeProgramId === program.id) setActiveProgramId(null);
      setPrograms((current) => current.filter((item) => item.id !== program.id));
      setDeleting(null); setNotice(`${program.name} deleted. Workout history is unchanged.`);
    } catch { setError("Could not delete that program. Please try again."); }
    finally { busy.current = false; setIsSaving(false); }
  }

  async function followProgram(id: string | null) {
    if (busy.current) return;
    busy.current = true; setIsSaving(true); setError(null);
    try {
      await setActiveTrainingProgram(id);
      setActiveProgramId(id); setFollowConfirm(null);
      setNotice(id ? "Program on. Start Session loads today’s exercises, and planned rest days protect your streak from today or the start date, whichever is later." : "Program off from today. Existing workouts and earlier rest-day history are unchanged.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change the active schedule."); }
    finally { busy.current = false; setIsSaving(false); }
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
          <Ionicons name="chevron-back" size={20} color={colors.text} /><Text style={styles.backText}>Programs</Text>
        </Pressable>
        <ScreenHeading eyebrow="Orca · Program builder" title={draft.id ? "Edit program" : "New program"} subtitle="Choose a schedule, rest days, and exercise targets." />
        {starterName ? <View style={styles.starterNote}>
          <Text style={styles.label}>Your copy of {starterName}</Text>
          <Text style={styles.body}>Review the start date and each day below. Everything is editable. Saving leaves the program OFF; turn it on to automatically load workouts and protect rest days without logging.</Text>
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
        <ProgramScheduleEditor draft={draft} onChange={setDraft} selectedIndex={selectedDayIndex} onSelect={setSelectedDayIndex} disabled={isSaving || isDragging} />
        {imported ? <Pressable accessibilityRole="checkbox" accessibilityLabel="Confirm imported schedule and rest days" accessibilityState={{ checked: importScheduleConfirmed }}
          disabled={isSaving || isDragging} onPress={() => setImportScheduleConfirmed(!importScheduleConfirmed)} style={[styles.namePanel, { flexDirection: "row", gap: 12, alignItems: "center" }]}>
          <Ionicons name={importScheduleConfirmed ? "checkbox" : "square-outline"} size={26} color={colors.accent} />
          <Text style={[styles.body, { flex: 1 }]}>I've checked the imported schedule, start date and every training/rest day. Saving keeps this program OFF until I turn it on.</Text>
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

  return (
    <ScrollView key="program-list" style={styles.screen} contentContainerStyle={ui.content}>
      <ScreenHeading eyebrow="Orca · Your training" title="Programs" subtitle="Your schedule, exercises, and rest days." />
      <Action label="Create program" icon="add" primary onPress={() => openEditor()} disabled={isLoading || isSaving || Boolean(starting)} />
      <View style={{ marginTop: 14 }}><Action label="Import program" icon="download-outline" onPress={() => { setImporting(true); setError(null); setNotice(null); }} disabled={isLoading || isSaving || Boolean(starting)} /></View>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{notice}</Text> : null}
      {error ? <View style={styles.feedbackPanel}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Action label="Retry loading" icon="refresh" onPress={() => setReloadKey((value) => value + 1)} /></View> : null}
      <StarterProgramLibrary onUse={useStarter} disabled={isLoading || isSaving || Boolean(starting)} />
      {isLoading ? <Text style={styles.feedback}>Loading your programs…</Text> : !programs.length && !error ? <Text style={styles.feedback}>No saved programs yet. Start with a preset above, import a plan, or create your own.</Text> : null}
      {programs.length ? <Text accessibilityRole="header" style={[styles.sectionTitle, { marginTop: 30 }]}>Your programs</Text> : null}
      <View style={styles.programList}>
        {programs.map((program) => {
          const todayIndex = getScheduledDayIndex(program.schedule, program.days.length);
          const index = Math.min(previewDays[program.id] ?? Math.max(0, todayIndex), program.days.length - 1);
          const day = program.days[index];
          const isActive = activeProgramId === program.id;
          return (
          <View style={styles.programCard} key={program.id}>
            <Text style={styles.programName}>{program.name}</Text>
            <Text style={styles.caption}>{program.schedule.mode === "weekly" ? "Weekly" : `Every ${program.days.length} ${program.days.length === 1 ? "day" : "days"}`} · {program.days.filter((item) => item.kind === "training").length} training · {program.days.filter((item) => item.kind === "rest").length} rest</Text>
            <Text style={isActive ? styles.notice : styles.caption}>{isActive ? "Program ON" : "Program OFF"} · Starts {program.schedule.startDate}</Text>
            <Text style={styles.caption}>{isActive ? "Start Session loads today’s exercises. Planned rest days protect your streak automatically." : "Turn on to load today’s workout and protect scheduled rest days. Only one program can be on."}</Text>
            <Action label={isActive ? "Turn program off" : "Turn program on"} accessibilityLabel={`${isActive ? "Turn off" : "Turn on"} ${program.name}`} icon="power-outline"
              disabled={isSaving || Boolean(starting)} onPress={() => setFollowConfirm(program.id)} />
            {followConfirm === program.id ? <View style={styles.confirm}>
              <Text style={styles.confirmTitle}>{isActive ? "Turn this program off?" : "Turn this program on?"}</Text>
              <Text style={styles.body}>{isActive ? "Automatic workouts and rest protection stop from today. Your current workout and earlier history stay unchanged." : `${activeProgramId ? "This turns your other program off. " : ""}Start Session will load the exercises for the current weekday or cycle day. Planned rest days count automatically from today or the start date, whichever is later. Missed training days still break the streak. Any workout already in progress stays unchanged.`}</Text>
              <Action label={isActive ? "Confirm turn off" : "Confirm turn on"} icon="checkmark" primary disabled={isSaving} onPress={() => followProgram(isActive ? null : program.id)} />
              <Action label="Cancel" icon="close" disabled={isSaving} onPress={() => setFollowConfirm(null)} />
            </View> : null}
            <ProgramDayPicker program={program} selectedIndex={index} onSelect={(value) => setPreviewDays((current) => ({ ...current, [program.id]: value }))} disabled={isSaving || Boolean(starting)} />
            <Text style={styles.dayTitle}>{getProgramDayName(program, day)}{day.name ? ` · ${getDaySlotLabel(program.schedule.mode, index)}` : ""}{index === todayIndex ? " · Today" : ""}</Text>
            {day.kind === "training" ? <>
            <View style={styles.preview}>
              {day.exercises.map((entry, order) => <View style={styles.previewRow} key={entry.id}>
                <Text style={styles.previewOrder}>{order + 1}</Text><Text style={styles.previewName}>{entry.exerciseName}</Text>
                <Text style={styles.previewGoal}>{formatProgramPrescription(entry)}</Text>
              </View>)}
            </View>
            <Action label={starting === program.id ? "Opening workout…" : "Start this day"} accessibilityLabel={`Start ${getProgramDayName(program, day)} in ${program.name}`} icon="play" primary
              disabled={isSaving || Boolean(starting)} onPress={() => startProgram(program, day)} />
            </> : <Text style={styles.body}>{isActive ? "Planned recovery. Your streak is protected on this day while the schedule is active." : "Planned recovery. Turn this program on for automatic rest protection."}</Text>}
            {blockedProgram === program.id ? <View style={styles.feedbackPanel}><Text style={styles.body}>You already have an active workout. Finish it before starting a program.</Text>
              <Action label="Go to active session" icon="arrow-forward" onPress={() => router.push("/workouts")} /></View> : null}
            <View style={styles.cardActions}>
              <Action label="Edit program" accessibilityLabel={`Edit program ${program.name}`} icon="create-outline" onPress={() => openEditor(program)} disabled={isSaving || Boolean(starting)} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete program ${program.name}`} onPress={() => setDeleting(program.id)} disabled={isSaving || Boolean(starting)} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={20} color={colors.secondaryText} />
              </Pressable>
            </View>
            {deleting === program.id ? <Confirm title={`Delete ${program.name}?`} description="This removes the program and stops it if active. Earlier rest days and workout history stay unchanged. This can’t be undone."
              confirmLabel="Delete program" disabled={isSaving} onConfirm={() => removeProgram(program)} onCancel={() => setDeleting(null)} /> : null}
          </View>
        ); })}
      </View>
      <Text style={styles.footer}>Programs stay on this device and work without an account.</Text>
    </ScrollView>
  );
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
  programName: { color: colors.text, fontSize: 23, lineHeight: 30, fontWeight: "700", letterSpacing: -0.5 },
  dayTitle: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: "600", marginTop: 6 },
  preview: { marginVertical: 6 }, previewRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  previewOrder: { color: colors.accent, width: 17, fontSize: 12, fontWeight: "700" },
  previewName: { flex: 1, minWidth: 0, color: colors.secondaryText, fontSize: 13, lineHeight: 19 }, previewGoal: { flexShrink: 1, maxWidth: "48%", textAlign: "right", color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  cardActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 14 },
  deleteButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  confirm: { ...ui.input, padding: 20, gap: 16, marginVertical: 16 }, confirmTitle: { color: colors.text, fontSize: 17, lineHeight: 24, fontWeight: "600" },
  confirmDelete: { backgroundColor: colors.danger, borderRadius: 16, minHeight: 48, alignItems: "center", justifyContent: "center", padding: 12 },
  confirmDeleteText: { color: colors.onAccent, fontSize: 14, fontWeight: "700" }
}));
