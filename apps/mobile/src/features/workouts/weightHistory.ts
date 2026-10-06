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

export type LastSavedExerciseWeight = {
  source: "lastSaved";
  weight: number;
  latestPerformedAt: string;
  sessionId: string;
  setIndex: number;
};

type WeightHistoryOptions = { now: number; load?: ProgramLoad | null; exerciseName?: string };
type SavedWeightExposure = ExerciseExposure & { exerciseOrder?: number };

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

/** Reuse the last actual working rep set, including saved work in an unfinished session. */
export function getLastSavedExerciseWeight(
  history: readonly SavedWeightExposure[],
  exerciseId: string,
  options: WeightHistoryOptions
): LastSavedExerciseWeight | null {
  if (!exerciseId || !Number.isFinite(options.now) || !Number.isFinite(new Date(options.now).getTime())) return null;
  let selected: { exposure: SavedWeightExposure; timestamp: number; setIndex: number } | null = null;
  for (const exposure of history) {
    if (!exposure || !sameExercise(exposure, exerciseId, options.exerciseName) || !exposure.sessionId ||
        !compatibleLoad(options.load, exposure.prescription?.load) || !Array.isArray(exposure.actualSets)) continue;
    const timestamp = Date.parse(exposure.performedAt);
    if (!Number.isFinite(timestamp) || timestamp > options.now) continue;
    let setIndex = exposure.actualSets.length - 1;
    while (setIndex >= 0 && !validWorkingSet(exposure.actualSets[setIndex])) setIndex -= 1;
    if (setIndex < 0) continue;
    let newer = !selected || timestamp > selected.timestamp;
    if (selected && timestamp === selected.timestamp) {
      if (exposure.sessionId === selected.exposure.sessionId) {
        // Save timestamps may share a millisecond. The persisted entry order
        // resolves repeated lifts within that workout without guessing loads.
        const order = Number.isInteger(exposure.exerciseOrder) ? exposure.exerciseOrder! : -1;
        const selectedOrder = Number.isInteger(selected.exposure.exerciseOrder) ? selected.exposure.exerciseOrder! : -1;
        newer = order > selectedOrder;
      } else {
        // Identical save times in different workouts have no finer chronology;
        // use a stable session key rather than depending on incoming array order.
        newer = exposure.sessionId < selected.exposure.sessionId;
      }
    }
    if (newer) selected = { exposure, timestamp, setIndex };
  }
  if (!selected) return null;
  return {
    source: "lastSaved", weight: selected.exposure.actualSets[selected.setIndex].weight,
    latestPerformedAt: selected.exposure.performedAt, sessionId: selected.exposure.sessionId,
    setIndex: selected.setIndex
  };
}

/** The repository feed contains completed sessions only; this helper never writes actual results. */
export function getRecentExerciseWeight(
  history: readonly ExerciseExposure[],
  exerciseId: string,
  options: WeightHistoryOptions
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

/** Late history reads may replace untouched seed values, but never overwrite manual values or clearing. */
export function fillUntouchedDraftWeights<T extends { weight: number }>(
  drafts: T[],
  weight: number,
  editedIndices: ReadonlySet<number> = new Set(),
  options: { replaceSeeded?: boolean } = {}
): T[] {
  if (!Number.isFinite(weight) || weight < 0 || weight > MAX_WEIGHT) return drafts;
  let changed = false;
  const next = drafts.map((draft, index) => {
    const validSeed = options.replaceSeeded && Number.isFinite(draft.weight) && draft.weight >= 0 && draft.weight <= MAX_WEIGHT;
    if ((!Number.isNaN(draft.weight) && !validSeed) || editedIndices.has(index) || Object.is(draft.weight, weight)) return draft;
    changed = true;
    return { ...draft, weight };
  });
  return changed ? next : drafts;
}
