import type { ProgramLoad } from "../programs/programModel";
import type { ExerciseExposure, WorkoutSet } from "../../storage/workoutsRepository";

const MAX_RECENT_SESSIONS = 3;
const MAX_HISTORY_DAYS = 90;
const MAX_WEIGHT = 10000;

export type RecentExerciseWeight = {
  source: "history";
  weight: number;
  averageWeight: number;
  setCount: number;
  sessionCount: number;
  latestPerformedAt: string;
};

function localDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

function validWorkingSet(set: WorkoutSet): boolean {
  return !!set && !set.warmup && set.durationSeconds == null &&
    Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= MAX_WEIGHT &&
    Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 100;
}

function compatibleLoad(current: ProgramLoad | null | undefined, previous: ProgramLoad | undefined): boolean {
  // Unlabelled historical loads are comparable only with other unlabelled loads.
  // An explicit per-hand/total or equipment choice must not cross that boundary.
  if (current == null || previous == null) return current == null && previous == null;
  return current.unit === "lb" && previous.unit === "lb" &&
    ["total", "perHand"].includes(current.convention) && current.convention === previous.convention &&
    typeof current.equipmentKey === "string" && typeof previous.equipmentKey === "string" &&
    !!current.equipmentKey.trim() &&
    current.equipmentKey.trim().toLowerCase() === previous.equipmentKey.trim().toLowerCase();
}

function sameExercise(exposure: ExerciseExposure, exerciseId: string, exerciseName?: string): boolean {
  if (typeof exposure.exerciseId !== "string") return false;
  const custom = exerciseId.startsWith("custom-");
  if (custom !== exposure.exerciseId.startsWith("custom-")) return false;
  if (!custom) return exposure.exerciseId === exerciseId;
  const currentName = typeof exerciseName === "string" ? exerciseName.trim().toLowerCase() : "";
  const previousName = typeof exposure.exerciseName === "string" ? exposure.exerciseName.trim().toLowerCase() : "";
  // Custom IDs are recreated on selection/native reads. A named custom lift
  // uses its saved name, while legacy unnamed records require the exact ID.
  return currentName && previousName ? currentName === previousName : exposure.exerciseId === exerciseId;
}

/** The repository feed contains completed sessions only; this helper never writes actual results. */
export function getRecentExerciseWeight(
  history: readonly ExerciseExposure[],
  exerciseId: string,
  options: { now: number; load?: ProgramLoad | null; exerciseName?: string }
): RecentExerciseWeight | null {
  const currentDay = localDay(options.now);
  if (!exerciseId || !Number.isFinite(options.now) || !Number.isFinite(currentDay)) return null;
  const sessions = new Map<string, {
    sessionId: string; latestTimestamp: number; latestPerformedAt: string;
    volume: number; reps: number; setCount: number;
  }>();
  for (const exposure of history) {
    if (!exposure || !sameExercise(exposure, exerciseId, options.exerciseName) || !exposure.sessionId ||
        !compatibleLoad(options.load, exposure.prescription?.load) || !Array.isArray(exposure.actualSets)) continue;
    const timestamp = Date.parse(exposure.performedAt);
    if (!Number.isFinite(timestamp) || timestamp > options.now || localDay(timestamp) < currentDay - MAX_HISTORY_DAYS) continue;
    const workingSets = exposure.actualSets.filter(validWorkingSet);
    if (!workingSets.length) continue;
    const session = sessions.get(exposure.sessionId) ?? {
      sessionId: exposure.sessionId, latestTimestamp: timestamp, latestPerformedAt: exposure.performedAt,
      volume: 0, reps: 0, setCount: 0
    };
    for (const set of workingSets) {
      session.volume += set.weight * set.reps;
      session.reps += set.reps;
      session.setCount += 1;
    }
    if (timestamp > session.latestTimestamp) {
      session.latestTimestamp = timestamp;
      session.latestPerformedAt = exposure.performedAt;
    }
    sessions.set(exposure.sessionId, session);
  }
  const recent = [...sessions.values()].sort((a, b) =>
    b.latestTimestamp - a.latestTimestamp || (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0)
  ).slice(0, MAX_RECENT_SESSIONS);
  if (!recent.length) return null;
  const totalReps = recent.reduce((total, session) => total + session.reps, 0);
  const averageWeight = recent.reduce((total, session) => total + session.volume, 0) / totalReps;
  return {
    source: "history", weight: Math.round(averageWeight * 2) / 2, averageWeight,
    setCount: recent.reduce((total, session) => total + session.setCount, 0),
    sessionCount: recent.length, latestPerformedAt: recent[0].latestPerformedAt
  };
}

/** Late history reads may seed blank, untouched rows, but never overwrite manual values or clearing. */
export function fillUntouchedDraftWeights<T extends { weight: number }>(
  drafts: T[],
  weight: number,
  editedIndices: ReadonlySet<number> = new Set()
): T[] {
  if (!Number.isFinite(weight) || weight < 0 || weight > MAX_WEIGHT) return drafts;
  let changed = false;
  const next = drafts.map((draft, index) => {
    if (!Number.isNaN(draft.weight) || editedIndices.has(index)) return draft;
    changed = true;
    return { ...draft, weight };
  });
  return changed ? next : drafts;
}
