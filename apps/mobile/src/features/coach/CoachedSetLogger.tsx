import { useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import { NumberField, DurationFields } from "../programs/ExerciseTargetEditor";
import type { ProgramExercise } from "../programs/programModel";
import { getCoachHistory, validateActualSets, type ExerciseExposure, type WorkoutSet } from "../../storage/workoutsRepository";
import { evaluateCoach, type Readiness } from "./coachModel";
import { CoachButton, DecimalField, ReadinessCheck, themedCoachStyles } from "./CoachControls";
import { useThemeStyles } from "../../theme/ThemeProvider";

export function CoachedSetLogger({ exerciseId, entry, readiness, onReadiness, saving, onSave, loadHistory = getCoachHistory }: {
  exerciseId: string; entry?: ProgramExercise; readiness: Readiness; onReadiness: (value: Readiness) => void;
  saving: boolean; onSave: (sets: WorkoutSet[]) => Promise<void>;
  loadHistory?: () => Promise<ExerciseExposure[]>;
}) {
  const { styles: s } = useThemeStyles(themedCoachStyles);
  const [timed, setTimed] = useState(entry?.target.kind === "duration");
  const seed = (): WorkoutSet => ({ weight: entry?.load?.weight ?? NaN, reps: entry?.target.kind === "duration" ? 0 : entry?.target.kind === "repRange" ? entry.target.min : entry?.target.reps ?? 8,
    durationSeconds: entry?.target.kind === "duration" ? entry.target.seconds : null, effort: null, warmup: false });
  const [sets, setSets] = useState<WorkoutSet[]>(() => Array.from({ length: entry?.sets ?? 3 }, seed));
  const [history, setHistory] = useState<ExerciseExposure[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(new Date());
  const [applied, setApplied] = useState<{ key: string; before: WorkoutSet[] } | null>(null);
  const inFlight = useRef(false);
  const current = useRef({ readiness, entry }); current.current = { readiness, entry };
  const mounted = useRef(true);
  const proposal = entry && history ? evaluateCoach({ entry, history, readiness, now }) : null;

  useEffect(() => {
    mounted.current = true;
    async function refresh() {
      setNow(new Date());
      try { const data = await loadHistory(); if (mounted.current) { setHistory(data); setError(""); } }
      catch { if (mounted.current) { setHistory(null); setError("History could not be read. Coaching is unavailable; you can still log manually."); } }
    }
    void refresh();
    const app = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    const timer = setInterval(() => { if (mounted.current) setNow(new Date()); }, 30000);
    return () => { mounted.current = false; app.remove(); clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (applied && proposal?.key !== applied.key) {
      setSets(applied.before); setApplied(null);
      setNotice("The recommendation changed. Your pre-coach values were restored; review again.");
    }
  }, [proposal?.key, applied]);

  function edit(next: WorkoutSet[]) { setSets(next); setApplied(null); setNotice("Manual values. Save only what you actually complete."); }
  function update(index: number, patch: Partial<WorkoutSet>) { edit(sets.map((set, i) => i === index ? { ...set, ...patch } : set)); }
  async function apply() {
    if (!entry || !proposal?.canApply || inFlight.current || applied) return;
    inFlight.current = true; setChecking(true); setError("");
    const preview = proposal;
    try {
      const freshHistory = await loadHistory();
      if (!mounted.current) return;
      const fresh = evaluateCoach({ entry: current.current.entry!, history: freshHistory, readiness: current.current.readiness, now: new Date() });
      setHistory(freshHistory); setNow(new Date());
      if (fresh.key !== preview.key || !fresh.canApply || fresh.weight == null) {
        setNotice("New information changed this recommendation. Review the refreshed card first."); return;
      }
      setApplied({ key: fresh.key, before: sets });
      setSets(Array.from({ length: fresh.sets }, () => ({ ...seed(), weight: fresh.weight!, effort: null })));
      setNotice("Applied to this exercise today only. Record actual results below; your program has not changed.");
    } catch { setError("Could not verify the latest history. No recommendation was applied."); }
    finally { inFlight.current = false; if (mounted.current) setChecking(false); }
  }
  async function save() {
    try { validateActualSets(sets); setError(""); await onSave(sets); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save sets."); }
  }
  const disabled = saving || checking;
  return <View style={{ gap: 14 }}>
    <ReadinessCheck value={readiness} onChange={onReadiness} disabled={disabled} />
    {entry ? <View style={s.card}>
      <Text style={s.title}>Today's recommendation</Text>
      {entry.load ? <>
        <Text style={s.copy}>{entry.load.equipmentKey} · {entry.load.convention === "perHand" ? "weight per hand" : "total weight"} · {entry.load.increment} lb steps</Text>
        <CoachButton label="Same equipment and weight convention" selected={readiness.sameEquipment} disabled={disabled} onPress={() => onReadiness({ ...readiness, sameEquipment: !readiness.sameEquipment })} />
      </> : <Text style={s.copy}>For load recommendations, edit this exercise in Programs and set up load coaching.</Text>}
      {proposal ? <>
        <Text style={s.eyebrow}>{proposal.title}</Text><Text style={s.copy}>{proposal.explanation}</Text>
        {proposal.daysAway != null && proposal.daysAway >= 14 ? <View style={{ gap: 8 }}><Text style={s.copy}>About the missing logs</Text>
          <View style={s.row}>{([ ["unknown", "Not sure"], ["break", "I took a break"], ["elsewhere", "Trained elsewhere"] ] as const).map(([gap, label]) =>
            <CoachButton key={gap} label={label} selected={readiness.gap === gap} disabled={disabled} onPress={() => onReadiness({ ...readiness, gap })} />)}</View></View> : null}
        {proposal.canApply ? <>
          <Text style={s.title}>{proposal.sets} sets · {proposal.weight} lb</Text>
          <Text style={s.copy}>Rep goals stay the same. Prototype rules—not a guarantee of a safe load.</Text>
          <View style={s.row}><CoachButton label={checking ? "Checking…" : applied ? "Applied for today" : "Use for today"} selected={!!applied} disabled={disabled || !!applied} onPress={apply} />
            <CoachButton label={applied ? "Undo suggestion" : "Keep my values"} disabled={disabled} onPress={() => { if (applied) setSets(applied.before); setApplied(null); setNotice("Your values are unchanged by the coach. Edit below as needed."); }} /></View>
        </> : null}
      </> : <Text style={s.copy}>{history === null ? "Loading local performance…" : "No recommendation."}</Text>}
    </View> : null}
    <Text style={s.title}>Record each completed set</Text>
    <Text style={s.copy}>Targets are starting points, not completed work. Remove sets you did not complete. Weight is in lb; enter 0 for no external load.</Text>
    {!entry ? <View style={s.row}>{[false, true].map((value) => <CoachButton key={String(value)} label={value ? "Timed" : "Reps"} selected={timed === value} disabled={disabled}
      onPress={() => { setTimed(value); edit(sets.map((set) => ({ ...set, reps: value ? 0 : 8, durationSeconds: value ? 45 : null }))); }} />)}</View> : null}
    {sets.map((set, index) => <View key={index} style={s.card}>
      <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}><Text style={s.eyebrow}>SET {index + 1}</Text>
        <CoachButton label={`Remove set ${index + 1}`} disabled={disabled || sets.length === 1} onPress={() => edit(sets.filter((_, i) => i !== index))} /></View>
      <View style={s.row}><DecimalField label={`Weight lb · set ${index + 1}`} value={set.weight} disabled={disabled} onChange={(weight) => update(index, { weight })} />
        {!timed ? <NumberField label={`Reps · set ${index + 1}`} value={set.reps} max={100} disabled={disabled} onChange={(reps) => update(index, { reps })} /> : null}</View>
      {timed ? <DurationFields seconds={set.durationSeconds ?? 45} context={`for set ${index + 1}`} disabled={disabled} onChange={(durationSeconds) => update(index, { durationSeconds, reps: 0 })} /> : null}
      <View style={s.row}>{([ [null, "Effort: skip"], ["easy", "Easy"], ["moderate", "About right"], ["hard", "Hard"] ] as const).map(([effort, label]) =>
        <CoachButton key={String(effort)} label={label} selected={(set.effort ?? null) === effort} disabled={disabled} onPress={() => update(index, { effort })} />)}
        <CoachButton label="Warm-up set" selected={!!set.warmup} disabled={disabled} onPress={() => update(index, { warmup: !set.warmup })} /></View>
    </View>)}
    <CoachButton label="Add set (copy last values)" disabled={disabled || sets.length >= 12} onPress={() => edit([...sets, { ...sets[sets.length - 1], effort: null }])} />
    {notice ? <Text accessibilityLiveRegion="polite" style={s.copy}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <CoachButton label={saving ? "Saving exercise…" : "Save completed exercise"} selected disabled={disabled} onPress={save} />
  </View>;
}
