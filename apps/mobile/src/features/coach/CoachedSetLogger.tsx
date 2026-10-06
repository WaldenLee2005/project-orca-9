import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NumberField, DurationFields } from "../programs/ExerciseTargetEditor";
import type { ProgramExercise } from "../programs/programModel";
import { getCoachHistory, getSavedExerciseHistory, MAX_SET_NOTE_LENGTH, validateActualSets, type ExerciseExposure, type WorkoutSet } from "../../storage/workoutsRepository";
import { evaluateCoach, type Readiness } from "./coachModel";
import { CoachButton, ReadinessCheck, themedCoachStyles } from "./CoachControls";
import { useThemeStyles } from "../../theme/ThemeProvider";
import { applyCoachSetProposal, preserveWorkoutSetNotes } from "../workouts/setDraftNotes";
import { WeightRuler } from "../workouts/WeightRuler";
import { EffortSelector } from "../workouts/EffortSelector";
import { fillUntouchedDraftWeights, getLastSavedExerciseWeight, getRecentExerciseWeight, type LastSavedExerciseWeight, type RecentExerciseWeight } from "../workouts/weightHistory";

export function CoachedSetLogger({ exerciseId, exerciseName, entry, readiness, onReadiness, coachingEnabled = false, saving, onSave, loadHistory = getCoachHistory, loadSavedHistory = getSavedExerciseHistory }: {
  exerciseId: string; exerciseName?: string; entry?: ProgramExercise; readiness: Readiness; onReadiness: (value: Readiness) => void;
  saving: boolean; onSave: (sets: WorkoutSet[]) => Promise<void>;
  loadHistory?: () => Promise<ExerciseExposure[]>;
  loadSavedHistory?: typeof getSavedExerciseHistory;
  coachingEnabled?: boolean;
}) {
  const { styles: s, colors } = useThemeStyles(themedCoachStyles);
  const [timed, setTimed] = useState(entry?.target.kind === "duration");
  const seed = (): WorkoutSet => ({ weight: entry?.load?.weight ?? NaN, reps: entry?.target.kind === "duration" ? 0 : entry?.target.kind === "repRange" ? entry.target.min : entry?.target.reps ?? 8,
    durationSeconds: entry?.target.kind === "duration" ? entry.target.seconds : null, effort: null, warmup: false, note: null });
  const [sets, setSets] = useState<WorkoutSet[]>(() => Array.from({ length: entry?.sets ?? 3 }, seed));
  const [history, setHistory] = useState<ExerciseExposure[] | null>(null);
  const [savedHistory, setSavedHistory] = useState<ExerciseExposure[] | null>(null);
  const [lastWeight, setLastWeight] = useState<LastSavedExerciseWeight | null>(null);
  const [recentWeight, setRecentWeight] = useState<RecentExerciseWeight | null>(null);
  const weightsEdited = useRef(new Set<number>());
  const weightPrefillRead = useRef(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(new Date());
  const [applied, setApplied] = useState<{ key: string; before: WorkoutSet[] } | null>(null);
  const inFlight = useRef(false);
  const current = useRef({ readiness, entry, coachingEnabled }); current.current = { readiness, entry, coachingEnabled };
  const mounted = useRef(true);
  const proposal = coachingEnabled && entry && history ? evaluateCoach({ entry, history, readiness, now }) : null;

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let refreshVersion = 0;
    async function refresh() {
      const version = ++refreshVersion;
      setNow(new Date());
      const reads = await Promise.allSettled([
        Promise.resolve().then(loadHistory),
        Promise.resolve().then(() => loadSavedHistory(exerciseId, exerciseName))
      ]);
      if (!active || version !== refreshVersion) return;
      setHistory(reads[0].status === "fulfilled" ? reads[0].value : null);
      setSavedHistory(reads[1].status === "fulfilled" ? reads[1].value : null);
      setHistoryError(reads.some((read) => read.status === "rejected")
        ? "Some previous weights could not be read. You can still choose and log your weights manually." : "");
    }
    void refresh();
    const app = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    const timer = setInterval(() => { if (mounted.current) setNow(new Date()); }, 30000);
    return () => { active = false; mounted.current = false; app.remove(); clearInterval(timer); };
  }, [loadHistory, loadSavedHistory, exerciseId, exerciseName]);

  useEffect(() => {
    if (history !== null && !timed) setRecentWeight(getRecentExerciseWeight(history, exerciseId, { now: Date.now(), load: entry?.load, exerciseName }));
  }, [history, exerciseId, exerciseName, entry, timed]);

  useEffect(() => {
    if (savedHistory === null || weightPrefillRead.current || saving || checking || timed) return;
    weightPrefillRead.current = true;
    const last = getLastSavedExerciseWeight(savedHistory, exerciseId, { now: Date.now(), load: entry?.load, exerciseName });
    setLastWeight(last);
    if (last) setSets((drafts) => fillUntouchedDraftWeights(drafts, last.weight, weightsEdited.current, { replaceSeeded: true }));
  }, [savedHistory, exerciseId, exerciseName, entry, timed, saving, checking]);

  useEffect(() => {
    if (applied && proposal?.key !== applied.key) {
      setSets((currentSets) => preserveWorkoutSetNotes(applied.before, currentSets)); setApplied(null);
      setNotice("The recommendation changed. Your pre-coach values were restored; review again.");
    }
  }, [proposal?.key, applied]);

  function edit(next: WorkoutSet[]) {
    // After a row is added/removed, old numeric indices cannot identify an
    // untouched weight safely. Never let a late history read shift a choice.
    if (next.length !== sets.length) {
      weightsEdited.current = new Set(next.flatMap((set, index) => {
        const originalIndex = sets.indexOf(set);
        return originalIndex < 0 || weightsEdited.current.has(originalIndex) ? [index] : [];
      }));
    }
    setSets(next); setApplied(null); setNotice("Manual values. Save only what you actually complete.");
  }
  function update(index: number, patch: Partial<WorkoutSet>) {
    if ("weight" in patch) weightsEdited.current.add(index);
    edit(sets.map((set, i) => i === index ? { ...set, ...patch } : set));
  }
  function updateNote(index: number, note: string) { setSets((currentSets) => currentSets.map((set, i) => i === index ? { ...set, note } : set)); }
  async function apply() {
    if (!coachingEnabled || !entry || !proposal?.canApply || inFlight.current || applied) return;
    inFlight.current = true; setChecking(true); setError("");
    const preview = proposal;
    try {
      const freshHistory = await loadHistory();
      if (!mounted.current || !current.current.coachingEnabled) return;
      const fresh = evaluateCoach({ entry: current.current.entry!, history: freshHistory, readiness: current.current.readiness, now: new Date() });
      setHistory(freshHistory); setNow(new Date());
      if (fresh.key !== preview.key || !fresh.canApply) {
        setNotice("New information changed this recommendation. Review the refreshed card first."); return;
      }
      setApplied({ key: fresh.key, before: sets });
      weightPrefillRead.current = true;
      const nextSets = applyCoachSetProposal(fresh, sets, seed);
      setSets(nextSets);
      setNotice(`Applied to this exercise today only. Record actual results below; your program has not changed.${nextSets.length > fresh.sets ? " Extra draft sets with notes were kept. Remove any you did not complete." : ""}`);
    } catch { setError("Could not verify the latest history. No recommendation was applied."); }
    finally { inFlight.current = false; if (mounted.current) setChecking(false); }
  }
  async function save() {
    try { validateActualSets(sets); setError(""); await onSave(sets); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save sets."); }
  }
  const disabled = saving || checking;
  return <View style={{ gap: 14 }}>
    {coachingEnabled ? <ReadinessCheck value={readiness} onChange={onReadiness} disabled={disabled} /> : null}
    {coachingEnabled && entry ? <View style={s.card}>
      <Text style={s.title}>Today's recommendation</Text>
      {entry.load ? <>
        <Text style={s.copy}>{entry.load.equipmentKey} · {entry.load.convention === "perHand" ? "weight per hand" : "total weight"} · {entry.load.increment} lb steps</Text>
        <CoachButton label="Same equipment and weight convention" selected={readiness.sameEquipment} disabled={disabled} onPress={() => onReadiness({ ...readiness, sameEquipment: !readiness.sameEquipment })} />
      </> : <Text style={s.copy}>Log your actual sets to establish a starting point. Load suggestions need comparable performance and a known weight convention.</Text>}
      {proposal ? <>
        <Text style={s.eyebrow}>{proposal.title}</Text><Text style={s.copy}>{proposal.explanation}</Text>
        {proposal.daysAway != null && proposal.daysAway >= 14 ? <View style={{ gap: 8 }}><Text style={s.copy}>About the missing logs</Text>
          <View style={s.row}>{([ ["unknown", "Not sure"], ["break", "I took a break"], ["elsewhere", "Trained elsewhere"] ] as const).map(([gap, label]) =>
            <CoachButton key={gap} label={label} selected={readiness.gap === gap} disabled={disabled} onPress={() => onReadiness({ ...readiness, gap })} />)}</View></View> : null}
        {proposal.canApply ? <>
          <Text style={s.title}>{proposal.sets} sets · {proposal.weight == null ? "keep your weights" : `${proposal.weight} lb`}</Text>
          <Text style={s.copy}>Rep goals stay the same. Prototype rules—not a guarantee of a safe load.</Text>
          <View style={s.row}><CoachButton label={checking ? "Checking…" : applied ? "Applied for today" : "Use for today"} selected={!!applied} disabled={disabled || !!applied} onPress={apply} />
            <CoachButton label={applied ? "Undo suggestion" : "Keep my values"} disabled={disabled} onPress={() => { if (applied) setSets((currentSets) => preserveWorkoutSetNotes(applied.before, currentSets)); setApplied(null); setNotice("Your values are unchanged by the coach. Edit below as needed."); }} /></View>
        </> : null}
      </> : <Text style={s.copy}>{history === null ? "Loading local performance…" : "No recommendation."}</Text>}
    </View> : null}
    <Text style={s.title}>Record each completed set</Text>
    <Text style={s.copy}>Swipe the weight scale or tap the value to type. Remove sets you did not complete. Use 0 lb for no external load.</Text>
    {!entry ? <View style={s.row}>{[false, true].map((value) => <CoachButton key={String(value)} label={value ? "Timed" : "Reps"} selected={timed === value} disabled={disabled}
      onPress={() => { setTimed(value); edit(sets.map((set) => ({ ...set, reps: value ? 0 : 8, durationSeconds: value ? 45 : null }))); }} />)}</View> : null}
    {sets.map((set, index) => <View key={index} style={[s.card, { marginVertical: 0, padding: 16, gap: 12 }]}>
      <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}><Text style={s.eyebrow}>SET {index + 1}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove set ${index + 1}`} accessibilityState={{ disabled: disabled || sets.length === 1 }}
          disabled={disabled || sets.length === 1} onPress={() => edit(sets.filter((_, i) => i !== index))}
          style={{ width: 44, height: 44, justifyContent: "center", alignItems: "center", opacity: disabled || sets.length === 1 ? 0.45 : 1 }}>
          <Ionicons name="close" size={20} color={colors.secondaryText} />
        </Pressable></View>
      <WeightRuler label={`Weight lb · set ${index + 1}`} value={set.weight} disabled={disabled}
        onInteract={() => weightsEdited.current.add(index)} onChange={(weight) => update(index, { weight })} />
      <View style={[s.row, { alignItems: "flex-end" }]}>
        {!timed ? <NumberField label={`Reps · set ${index + 1}`} value={set.reps} max={100} disabled={disabled} onChange={(reps) => update(index, { reps })} /> : null}
        <CoachButton label="Warm-up" selected={!!set.warmup} disabled={disabled} onPress={() => update(index, { warmup: !set.warmup })} />
      </View>
      {timed ? <DurationFields seconds={set.durationSeconds ?? 45} context={`for set ${index + 1}`} disabled={disabled} onChange={(durationSeconds) => update(index, { durationSeconds, reps: 0 })} /> : null}
      <EffortSelector value={set.effort} setNumber={index + 1} disabled={disabled} onChange={(effort) => update(index, { effort })} />
      <SetNoteField value={set.note} setNumber={index + 1} disabled={disabled} onChange={(note) => updateNote(index, note)} />
    </View>)}
    {lastWeight ? <Text style={s.copy}>Last saved: {lastWeight.weight} lb. Adjust for today's sets.</Text> : null}
    {recentWeight ? <Text style={s.copy}>Recent average: {recentWeight.weight} lb · {recentWeight.sessionCount} {recentWeight.sessionCount === 1 ? "workout" : "workouts"}. Adjust for today's sets.</Text> : null}
    {recentWeight && sets.some((set) => set.weight !== recentWeight.weight) ? <CoachButton label={`Use recent ${recentWeight.weight} lb for all sets`} disabled={disabled}
      onPress={() => {
        weightsEdited.current = new Set(sets.map((_, index) => index));
        edit(sets.map((set) => ({ ...set, weight: recentWeight.weight })));
      }} /> : null}
    {sets.some((set) => !Number.isFinite(set.weight)) ? <View style={{ gap: 6 }}>
      {!recentWeight && !Number.isFinite(sets[0]?.weight) ? <Text style={s.copy}>First time logging this lift? Tap Select weight to enter a starting weight.</Text> : null}
      {Number.isFinite(sets[0]?.weight) ? <CoachButton label={`Use ${sets[0].weight} lb for empty sets`} disabled={disabled}
        onPress={() => {
          sets.forEach((set, index) => { if (!Number.isFinite(set.weight)) weightsEdited.current.add(index); });
          edit(sets.map((set) => Number.isFinite(set.weight) ? set : { ...set, weight: sets[0].weight }));
        }} /> : null}
    </View> : null}
    <CoachButton label="Add set (copy last values)" disabled={disabled || sets.length >= 12} onPress={() => edit([...sets, { ...sets[sets.length - 1], effort: null, note: null }])} />
    {notice ? <Text accessibilityLiveRegion="polite" style={s.copy}>{notice}</Text> : null}
    {historyError ? <Text accessibilityRole="alert" style={s.error}>{historyError}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <CoachButton label={saving ? "Saving exercise…" : "Save completed exercise"} selected disabled={disabled} onPress={save} />
  </View>;
}

function SetNoteField({ value, setNumber, onChange, disabled }: {
  value?: string | null; setNumber: number; onChange: (value: string) => void; disabled: boolean;
}) {
  const { styles: s, colors } = useThemeStyles(themedCoachStyles);
  const [expanded, setExpanded] = useState(!!value);
  const label = `Note to self · set ${setNumber} (optional)`;
  const action = expanded ? "Hide note to self" : value ? "Edit note to self" : "Add note to self";
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${action} · set ${setNumber}`} accessibilityState={{ expanded, disabled }}
      disabled={disabled} onPress={() => setExpanded(!expanded)} style={[s.button, { alignSelf: "flex-start" }, disabled && { opacity: 0.45 }]}>
      <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>{action}</Text>
    </Pressable>
    {expanded ? <>
      <Text style={s.copy}>{label}</Text>
      <TextInput accessibilityLabel={label} accessibilityHint="Optional private note about this set. Leave blank to save without a note."
        multiline textAlignVertical="top" maxLength={MAX_SET_NOTE_LENGTH} value={value ?? ""} editable={!disabled}
        onChangeText={onChange} placeholder="Anything to remember about this set" placeholderTextColor={colors.mutedText}
        style={[s.input, { minHeight: 96, lineHeight: 22 }, disabled && { opacity: 0.45 }]} />
      {value ? <CoachButton label={`Clear note · set ${setNumber}`} disabled={disabled} onPress={() => onChange("")} /> : null}
    </> : null}
  </View>;
}
