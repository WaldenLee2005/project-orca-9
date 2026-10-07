import { dateOrdinal, getScheduledDayIndex, type ScheduleRevision, type TrainingProgram } from "./programModel";

export type ProgramDayCompletion = { date: string; programId: string; dayId: string };

/** Only closed local training dates in this activation/revision can be missed. */
export function findMissedProgramDay(
  program: TrainingProgram,
  revision: ScheduleRevision,
  completed: readonly ProgramDayCompletion[],
  today: string
): string | null {
  if (revision.programId !== program.id || !revision.schedule) return null;
  const first = Math.max(dateOrdinal(revision.effectiveFrom), dateOrdinal(revision.schedule.startDate));
  const last = dateOrdinal(today) - 1;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first > last) return null;
  const saved = new Set(completed.filter((item) => item.programId === program.id)
    .map((item) => `${item.date}:${item.dayId}`));
  for (let ordinal = first; ordinal <= last; ordinal += 1) {
    const date = new Date(ordinal * 86400000).toISOString().slice(0, 10);
    const index = getScheduledDayIndex(revision.schedule, program.days.length, date);
    const day = program.days[index];
    if (revision.dayKinds[index] === "training" && day && !saved.has(`${date}:${day.id}`)) return date;
  }
  return null;
}
