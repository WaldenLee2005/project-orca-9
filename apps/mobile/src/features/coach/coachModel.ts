import type { ProgramExercise } from "../programs/programModel";
import type { ExerciseExposure, WorkoutSet } from "../../storage/workoutsRepository";

export const COACH_POLICY = { version: "local-prototype-2", gapDays: 14, qualifyingSessions: 2 } as const;
export type Readiness = { feeling: "unknown" | "good" | "low" | "concern"; gap: "unknown" | "break" | "elsewhere"; sameEquipment: boolean; lighter: boolean };
export const DEFAULT_READINESS: Readiness = { feeling: "unknown", gap: "unknown", sameEquipment: false, lighter: false };
export type CoachReason = "concern" | "setup" | "calibrate" | "gap" | "return" | "readiness" | "lighter" | "struggling" | "hold" | "progress";
export type CoachProposal = { key: string; reason: CoachReason; title: string; explanation: string; weight: number | null; sets: number; daysAway: number | null; canApply: boolean };
export type CoachContext = { entry: ProgramExercise; history: ExerciseExposure[]; readiness: Readiness; now: Date };

function day(time: string | Date) {
  const date = new Date(time);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}
function validSet(set: WorkoutSet) {
  return set && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 10000 && Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 100 && set.durationSeconds == null;
}
function working(exposure: ExerciseExposure) { return exposure.actualSets.filter((set) => !set.warmup); }
function compatible(a: ProgramExercise | undefined, b: ProgramExercise) {
  return a?.load && b.load && a.load.unit === b.load.unit && a.load.convention === b.load.convention &&
    a.load.equipmentKey.trim().toLowerCase() === b.load.equipmentKey.trim().toLowerCase() &&
    JSON.stringify(a.target) === JSON.stringify(b.target) && a.sets === b.sets;
}

/** No network, prompts, streaks, writes, or randomness. Review-only prototype heuristics. */
export function evaluateCoach({ entry, history, readiness, now }: CoachContext): CoachProposal {
  const relevant = history.filter((item) => item.exerciseId === entry.exerciseId && item.actualSets.some((set) => !set.warmup) && Number.isFinite(Date.parse(item.performedAt)) && Date.parse(item.performedAt) <= now.getTime())
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  const daysAway = relevant[0] ? day(now) - day(relevant[0].performedAt) : null;
  // Full evidence fingerprint: history edits, settings, readiness, and date invalidate a preview.
  const key = JSON.stringify([COACH_POLICY.version, day(now), entry, relevant, readiness]);
  function proposal(reason: CoachReason, title: string, explanation: string, weight: number | null = null, sets = entry.sets, setsOnly = false): CoachProposal {
    return { key, reason, title, explanation, weight, sets, daysAway, canApply: reason !== "concern" && (weight != null || (setsOnly && sets < entry.sets)) };
  }
  if (readiness.feeling === "concern") return proposal("concern", "Pause progression", "Pain, injury or illness needs more than a load formula. No training adjustment is recommended here. Seek appropriate professional guidance; logging remains available.");
  if (!Number.isFinite(now.getTime()) || entry.target.kind === "duration") {
    return proposal("setup", "Keep this one manual", "Timed movements stay manual in this prototype. Record the work you actually complete.");
  }
  if (!entry.load) {
    const shorter = Math.max(1, entry.sets - 1);
    if (daysAway != null && daysAway >= COACH_POLICY.gapDays) {
      if (readiness.gap !== "break") return proposal("gap", "Check in after time away", readiness.gap === "elsewhere"
        ? "Training elsewhere adds context, but no comparable loads. Keep your weights manual; no adjustment is offered without a confirmed break."
        : `No results for this exercise in ${daysAway} days. Confirm a break or outside training before reviewing a shorter session.`);
      return proposal("return", "Review a shorter return", "A confirmed break blocks increases. You can review one fewer planned set today while keeping every weight and rep value you entered. This is not a medical clearance.", null, shorter, true);
    }
    if (readiness.feeling === "low" || readiness.lighter) return proposal(readiness.feeling === "low" ? "readiness" : "lighter", "Review fewer sets today", "You can review one fewer planned set. Your entered weights and reps stay the same; this changes today's draft only.", null, shorter, true);
    return proposal("calibrate", "Build a reliable baseline", "Record your actual weights, working sets and effort. Numeric load suggestions need trustworthy load and equipment settings; no weight is guessed. You can still request a shorter session above.");
  }
  if (!readiness.sameEquipment) {
    return proposal("setup", "Confirm the equipment", "Numeric load suggestions need confirmation of the same equipment and weight convention. Bodyweight and assisted movements stay manual in this prototype.");
  }
  const load = entry.load;
  if (!Number.isFinite(load.weight) || load.weight < 0 || load.weight > 10000 || load.unit !== "lb" || !Number.isFinite(load.increment) || load.increment < 0.5 || load.increment > 50) return proposal("setup", "Keep weights manual", "These saved load settings cannot support numeric suggestions. Record and review your actual weights manually.");
  const comparable = relevant.filter((item) => compatible(item.prescription, entry) && item.actualSets.length > 0 && working(item).length > 0 && item.actualSets.every(validSet));
  // Don't bypass a newer incompatible or incomplete result to reuse older success.
  const latest = comparable[0] === relevant[0] ? comparable[0] : undefined;
  const baseline = latest ? Math.min(...working(latest).map((set) => set.weight)) : load.weight;
  const safeBaseline = Math.min(load.weight, baseline);
  if (daysAway != null && daysAway >= COACH_POLICY.gapDays) {
    if (readiness.gap !== "break") return proposal("gap", "No increase after a gap", readiness.gap === "elsewhere"
      ? "Training elsewhere is useful context, but not comparable set evidence. Review your load manually; no increase is offered."
      : `No results for this exercise in ${daysAway} days. Did you take a break or train elsewhere? No increase is offered until there is fresh evidence.`);
    // Reduce volume only; a universal return-to-training percentage would imply false precision.
    return proposal("return", "Ease back in", "A confirmed break blocks increases. This optional starting point keeps load at or below your baseline and removes one planned set. Review the load yourself; this is not a medical clearance.", safeBaseline, Math.max(1, entry.sets - 1));
  }
  if (readiness.feeling !== "good") return proposal("readiness", readiness.feeling === "low" ? "A lighter day is okay" : "Check in before progressing", "No increase today. You can review a shorter session while keeping load at or below the baseline.", safeBaseline, readiness.feeling === "low" ? Math.max(1, entry.sets - 1) : entry.sets);
  if (readiness.lighter) return proposal("lighter", "Keep today lighter", "One fewer planned set, with no load increase. This changes today's entry only, not your saved program.", safeBaseline, Math.max(1, entry.sets - 1));
  if (!latest) return proposal("calibrate", "Establish a baseline", "There isn't comparable set-level evidence for these settings yet. Review your chosen starting weight and record each working set plus effort.", load.weight);
  const upper = entry.target.kind === "repRange" ? entry.target.max : entry.target.reps;
  const lower = entry.target.kind === "repRange" ? entry.target.min : entry.target.reps;
  // Multiple entries in one workout/day do not count as repeated successful exposures.
  const distinct = relevant.filter((item, index, all) => all.findIndex((other) => other.sessionId === item.sessionId || day(other.performedAt) === day(item.performedAt)) === index).slice(0, COACH_POLICY.qualifyingSessions);
  const recentPair = distinct.length === 2 && distinct.every((item) => compatible(item.prescription, entry) && item.actualSets.every(validSet)) &&
    day(now) - day(distinct[1].performedAt) < COACH_POLICY.gapDays && day(distinct[0].performedAt) - day(distinct[1].performedAt) < COACH_POLICY.gapDays;
  const qualifies = (item: ExerciseExposure) => working(item).length === entry.sets && working(item).every((set) =>
    set.weight === baseline && set.reps >= upper && ["easy", "moderate"].includes(set.effort ?? ""));
  if (recentPair && distinct.every(qualifies) && baseline > 0 && load.increment <= baseline * 0.1 && baseline + load.increment <= 10000) {
    return proposal("progress", "Ready for a small step?", "Two recent workouts met every working-set target at this load with effort recorded as easy or about right. Review one equipment increment; sets and rep goals stay unchanged.", Math.round((baseline + load.increment) * 100) / 100);
  }
  const struggled = (item: ExerciseExposure) => working(item).length > 0 && working(item).some((set) => set.reps < lower || set.effort === "hard");
  if (recentPair && distinct.every(struggled)) return proposal("struggling", "Review the workload", "The last two comparable workouts were hard or below target. No increase: consider fewer sets today and review recovery and load.", Math.min(baseline, load.weight), Math.max(1, entry.sets - 1));
  return proposal("hold", "Build consistency at this load", "Keep the load while building toward all targets. Two recent comparable workouts with complete working sets and effort feedback are needed for an increase.", baseline);
}

export function reviewTraining(history: ExerciseExposure[], now = new Date()) {
  const valid = history.filter((item) => Number.isFinite(Date.parse(item.performedAt)) && Date.parse(item.performedAt) <= now.getTime() && item.actualSets.some((set) => !set.warmup));
  const recent = valid.filter((item) => day(now) - day(item.performedAt) < 7);
  const last = valid.map((item) => day(item.performedAt)).sort((a, b) => b - a)[0];
  return { sessions: new Set(recent.map((item) => item.sessionId)).size, sets: recent.reduce((sum, item) => sum + working(item).length, 0),
    daysAway: last == null ? null : day(now) - last,
    message: last == null ? "Log your first session to build a coaching baseline." : day(now) - last >= COACH_POLICY.gapDays
      ? "No recent sessions logged. Check in about time away before increasing any loads."
      : "Your next recommendation uses each exercise's own results—not your streak. Rest days remain protected." };
}
