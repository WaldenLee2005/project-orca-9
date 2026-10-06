import type { WorkoutSet } from "../../storage/workoutsRepository";

// Coaching changes measurements, while notes remain attached to their draft set.
// Keep rows through the last noted set when a suggestion would shorten the draft.
export function preserveWorkoutSetNotes(next: WorkoutSet[], current: WorkoutSet[]): WorkoutSet[] {
  const lastNotedIndex = current.reduce((last, set, index) => set.note ? index : last, -1);
  return Array.from({ length: Math.max(next.length, lastNotedIndex + 1) }, (_, index) => ({
    ...(next[index] ?? current[index]),
    note: current[index] ? current[index].note ?? null : next[index].note ?? null
  }));
}

// A sets-only suggestion must never fill or replace actual measurements.
export function applyCoachSetProposal(proposal: { sets: number; weight: number | null }, current: WorkoutSet[], seed: () => WorkoutSet): WorkoutSet[] {
  const next = proposal.weight == null
    ? current.slice(0, Math.max(1, proposal.sets))
    : Array.from({ length: proposal.sets }, () => ({ ...seed(), weight: proposal.weight!, effort: null }));
  return preserveWorkoutSetNotes(next, current);
}
