export type ProgramExercise = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  sets: number;
  target: ExerciseTarget;
  load?: ProgramLoad;
};

// Prototype: external resistance in pounds only. Assistance/bodyweight stay manual.
export type ProgramLoad = { weight: number; increment: number; unit: "lb"; convention: "total" | "perHand"; equipmentKey: string };
export function validateProgramLoad(load: ProgramLoad): ProgramLoad {
  if (!load || load.unit !== "lb" || !["total", "perHand"].includes(load.convention) ||
      !Number.isFinite(load.weight) || load.weight < 0 || load.weight > 10000 ||
      !Number.isFinite(load.increment) || load.increment < 0.5 || load.increment > 50 ||
      typeof load.equipmentKey !== "string" || !load.equipmentKey.trim() || load.equipmentKey.trim().length > 80) {
    throw new Error("Set a starting weight (0–10,000 lb), a 0.5–50 lb increment, and an equipment label for load coaching.");
  }
  return { weight: load.weight, increment: load.increment, unit: "lb", convention: load.convention, equipmentKey: load.equipmentKey.trim() };
}

export type ExerciseTarget =
  | { kind: "reps"; reps: number }
  | { kind: "repRange"; min: number; max: number }
  | { kind: "duration"; seconds: number };

export function stepGoalValue(value: number, direction: -1 | 1, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? Math.trunc(value) + direction : min));
}

export function changeExerciseTargetKind(target: ExerciseTarget, kind: ExerciseTarget["kind"]): ExerciseTarget {
  if (target.kind === kind) return target;
  const count = target.kind === "reps" ? target.reps : target.kind === "repRange" ? target.min : 8;
  const reps = Number.isInteger(count) && count >= 1 && count <= PROGRAM_LIMITS.reps ? count : 8;
  if (kind === "duration") return { kind, seconds: 45 };
  return kind === "repRange" ? { kind, min: reps, max: Math.min(PROGRAM_LIMITS.reps, reps + 4) } : { kind, reps };
}

export function validateExerciseTarget(value: ExerciseTarget): ExerciseTarget {
  const validReps = (count: number) => Number.isInteger(count) && count >= 1 && count <= PROGRAM_LIMITS.reps;
  if (value?.kind === "reps" && validReps(value.reps)) return { kind: "reps", reps: value.reps };
  if (value?.kind === "repRange" && validReps(value.min) && validReps(value.max) && value.min <= value.max) return { kind: "repRange", min: value.min, max: value.max };
  if (value?.kind === "duration" && Number.isInteger(value.seconds) && value.seconds >= 1 && value.seconds <= PROGRAM_LIMITS.seconds) return { kind: "duration", seconds: value.seconds };
  if (value?.kind === "duration") throw new Error("Choose a duration of 1 second–60 minutes per set.");
  throw new Error(`Choose a rep goal of 1–${PROGRAM_LIMITS.reps}; a range must start at or below its maximum.`);
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60), remainder = seconds % 60;
  return minutes ? `${minutes} min${remainder ? ` ${remainder} sec` : ""}` : `${remainder} sec`;
}

export function formatExerciseTarget(target: ExerciseTarget) {
  if (target.kind === "duration") return formatDuration(target.seconds);
  return target.kind === "repRange" ? `${target.min}–${target.max} reps` : `${target.reps} reps`;
}

export function formatProgramPrescription(entry: ProgramExercise) {
  return `${entry.sets} × ${formatExerciseTarget(entry.target)}`;
}

export const PROGRAM_DAY_CHOICES = ["training", "rest"] as const;
export type ProgramDayKind = typeof PROGRAM_DAY_CHOICES[number];
export type ProgramDay = { id: string; name: string; kind: ProgramDayKind; exercises: ProgramExercise[] };
export type ProgramSchedule = { mode: "weekly" | "cycle"; startDate: string };
export type ProgramDraft = { id?: string; name: string; schedule: ProgramSchedule; days: ProgramDay[] };
export type TrainingProgram = ProgramDraft & { id: string; createdAt: string; updatedAt: string };
export type WorkoutProgramPlan = { programId: string; programName: string; dayId: string; dayName: string; exercises: ProgramExercise[] };
export type ScheduleRevision = { effectiveFrom: string; programId: string | null; schedule: ProgramSchedule | null; dayKinds: ProgramDayKind[] };

export const PROGRAM_LIMITS = { name: 80, exercises: 100, sets: 12, reps: 100, seconds: 3600, days: 28 };
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Calendar arithmetic uses civil dates, not elapsed 24-hour periods (DST-safe).
export function dateOrdinal(key: string): number {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key ? date.getTime() / 86400000 : NaN;
}

export function getDaySlotLabel(mode: ProgramSchedule["mode"], index: number) {
  return mode === "weekly" ? WEEKDAYS[index] : `Day ${index + 1}`;
}

export function getProgramDayName(program: ProgramDraft, day: ProgramDay) {
  return day.name || getDaySlotLabel(program.schedule.mode, program.days.findIndex((entry) => entry.id === day.id));
}

export function getScheduledDayIndex(schedule: ProgramSchedule, dayCount: number, dateKey = localDateKey()): number {
  const date = dateOrdinal(dateKey), start = dateOrdinal(schedule.startDate);
  if (!Number.isFinite(date) || !Number.isFinite(start) || date < start || dayCount < 1) return -1;
  return schedule.mode === "weekly" ? (new Date(`${dateKey}T00:00:00Z`).getUTCDay() + 6) % 7 : (date - start) % dayCount;
}

function validateExercises(entries: ProgramExercise[], required: boolean): ProgramExercise[] {
  if (!Array.isArray(entries) || (required && !entries.length)) throw new Error("Add at least one exercise to each training day.");
  if (entries.length > PROGRAM_LIMITS.exercises) throw new Error(`A day can contain up to ${PROGRAM_LIMITS.exercises} exercises.`);
  const ids = new Set<string>();
  return entries.map((entry, index) => {
    if (!entry || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) || typeof entry.exerciseId !== "string" || !entry.exerciseId || typeof entry.exerciseName !== "string" || !entry.exerciseName.trim()) {
      throw new Error(`Exercise ${index + 1} is invalid. Remove it and add it again.`);
    }
    ids.add(entry.id);
    if (!Number.isInteger(entry.sets) || entry.sets < 1 || entry.sets > PROGRAM_LIMITS.sets) {
      throw new Error(`${entry.exerciseName}: choose 1–${PROGRAM_LIMITS.sets} sets.`);
    }
    let target: ExerciseTarget;
    try { target = validateExerciseTarget(entry.target); }
    catch (error) { throw new Error(`${entry.exerciseName}: ${(error as Error).message}`); }
    return { id: entry.id, exerciseId: entry.exerciseId, exerciseName: entry.exerciseName.trim(), sets: entry.sets, target,
      ...(entry.load ? { load: validateProgramLoad(entry.load) } : {}) };
  });
}

export function validateProgram(input: ProgramDraft): ProgramDraft {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("Give your program a name.");
  if (name.length > PROGRAM_LIMITS.name) throw new Error(`Use a name of ${PROGRAM_LIMITS.name} characters or fewer.`);
  const current = input, schedule = current.schedule;
  if (!schedule || !["weekly", "cycle"].includes(schedule.mode) || !Number.isFinite(dateOrdinal(schedule.startDate))) throw new Error("Choose a valid start date in YYYY-MM-DD format.");
  if (!Array.isArray(current.days) || current.days.length < 1 || current.days.length > PROGRAM_LIMITS.days || (schedule.mode === "weekly" && current.days.length !== 7)) throw new Error("Choose 7 weekdays or a cycle of 1–28 days.");
  if (!current.days.some((day) => day?.kind === "training")) throw new Error("Choose at least one training day for your program.");
  const ids = new Set<string>();
  const days = current.days.map((day, index) => {
    if (!day || typeof day.id !== "string" || !day.id || ids.has(day.id) || typeof day.name !== "string" || day.name.trim().length > PROGRAM_LIMITS.name) throw new Error(`Day ${index + 1} is invalid.`);
    if (!PROGRAM_DAY_CHOICES.includes(day.kind)) throw new Error(`${getDaySlotLabel(schedule.mode, index)}: choose Training or Rest.`);
    ids.add(day.id);
    try { return { id: day.id, name: day.name.trim(), kind: day.kind, exercises: validateExercises(day.exercises, day.kind === "training") }; }
    catch (error) { throw new Error(`${getDaySlotLabel(schedule.mode, index)}: ${(error as Error).message}`); }
  });
  return { ...(input.id ? { id: input.id } : {}), name, schedule: { mode: schedule.mode, startDate: schedule.startDate }, days };
}

export function parseTrainingProgram(value: unknown): TrainingProgram | null {
  if (!value || typeof value !== "object") return null;
  const program = value as TrainingProgram;
  if (typeof program.id !== "string" || !program.id || typeof program.name !== "string" ||
      typeof program.createdAt !== "string" || !Number.isFinite(Date.parse(program.createdAt)) ||
      typeof program.updatedAt !== "string" || !Number.isFinite(Date.parse(program.updatedAt))) return null;
  try {
    const valid = validateProgram({ ...program, days: program.days.map((day) => ({ ...day, exercises: readSavedTargets(day.exercises) })) });
    return { ...valid, id: program.id, createdAt: program.createdAt, updatedAt: program.updatedAt };
  } catch { return null; }
}

export function isTrainingProgram(value: unknown): value is TrainingProgram {
  return Boolean(value && typeof value === "object" && "days" in value && parseTrainingProgram(value));
}

export function toWorkoutProgramPlan(program: TrainingProgram, dayId?: string): WorkoutProgramPlan {
  const valid = validateProgram(program);
  const day = dayId ? valid.days.find((item) => item.id === dayId) : valid.days.length === 1 ? valid.days[0] : valid.days[getScheduledDayIndex(valid.schedule, valid.days.length)];
  if (!day || day.kind !== "training") throw new Error("Choose a training day to start a workout.");
  return { programId: program.id, programName: valid.name, dayId: day.id, dayName: getProgramDayName(valid, day), exercises: day.exercises };
}

export function parseWorkoutProgramPlan(value: unknown): WorkoutProgramPlan | null {
  if (!value || typeof value !== "object") return null;
  const plan = value as WorkoutProgramPlan;
  if (typeof plan.programId !== "string" || !plan.programId || typeof plan.programName !== "string" || !Array.isArray(plan.exercises)) return null;
  try {
    if (!plan.programName.trim() || plan.programName.trim().length > PROGRAM_LIMITS.name) return null;
    if (typeof plan.dayId !== "string" || !plan.dayId || typeof plan.dayName !== "string" || !plan.dayName.trim()) return null;
    return { programId: plan.programId, programName: plan.programName.trim(), dayId: plan.dayId, dayName: plan.dayName.trim(), exercises: validateExercises(readSavedTargets(plan.exercises), true) };
  } catch { return null; }
}

// Additive upgrade of the current scheduled-program format, not older unset-day schemas.
// Only storage readers accept the former exact-rep field; all new writes use typed targets.
function readSavedTargets(entries: ProgramExercise[]) {
  return entries.map((entry) => {
    const saved = entry as ProgramExercise & { repGoal?: number };
    if (saved && saved.target === undefined && Number.isInteger(saved.repGoal)) {
      return { ...saved, target: { kind: "reps" as const, reps: saved.repGoal! } };
    }
    return entry;
  });
}

export function isScheduleRevision(value: unknown): value is ScheduleRevision {
  if (!value || typeof value !== "object") return false;
  const item = value as ScheduleRevision;
  if (!Number.isFinite(dateOrdinal(item.effectiveFrom)) || !Array.isArray(item.dayKinds)) return false;
  if (item.programId === null) return item.schedule === null && !item.dayKinds.length;
  return typeof item.programId === "string" && Boolean(item.programId) && Boolean(item.schedule) &&
    ["weekly", "cycle"].includes(item.schedule!.mode) && Number.isFinite(dateOrdinal(item.schedule!.startDate)) &&
    item.dayKinds.length >= 1 && item.dayKinds.length <= PROGRAM_LIMITS.days && (item.schedule!.mode !== "weekly" || item.dayKinds.length === 7) &&
    item.dayKinds.every((kind) => PROGRAM_DAY_CHOICES.includes(kind)) && item.dayKinds.includes("training");
}

export function reviseSchedule(history: ScheduleRevision[], program: TrainingProgram | null, today = localDateKey()): ScheduleRevision[] {
  if (!Number.isFinite(dateOrdinal(today))) throw new Error("The device date is invalid.");
  if (history.some((item) => item.effectiveFrom > today)) throw new Error("Your device date is earlier than your saved schedule. Correct the date before changing it.");
  return [...history.filter((item) => item.effectiveFrom < today), { effectiveFrom: today, programId: program?.id ?? null,
    schedule: program ? { ...program.schedule } : null, dayKinds: program?.days.map((day) => day.kind) ?? [] }];
}

export function getScheduledRestDates(history: ScheduleRevision[], through = localDateKey()): string[] {
  const rest: string[] = [], end = dateOrdinal(through);
  history.forEach((revision, index) => {
    if (!revision.schedule || !revision.dayKinds.includes("rest")) return;
    const first = Math.max(dateOrdinal(revision.effectiveFrom), dateOrdinal(revision.schedule.startDate));
    const last = Math.min(end, history[index + 1] ? dateOrdinal(history[index + 1].effectiveFrom) - 1 : end);
    for (let day = first; day <= last; day += 1) {
      const key = new Date(day * 86400000).toISOString().slice(0, 10);
      if (revision.dayKinds[getScheduledDayIndex(revision.schedule, revision.dayKinds.length, key)] === "rest") rest.push(key);
    }
  });
  return rest;
}

export function moveProgramExercise<T>(entries: readonly T[], from: number, to: number): T[] {
  const result = [...entries];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= entries.length || to < 0 || to >= entries.length || from === to) return result;
  const [entry] = result.splice(from, 1);
  result.splice(to, 0, entry);
  return result;
}

export type RowFrame = { y: number; height: number };
export function clampDragTranslation(frames: readonly RowFrame[], from: number, translation: number) {
  if (!frames[from] || !Number.isFinite(translation)) return 0;
  const center = (frame: RowFrame) => frame.y + frame.height / 2;
  const origin = center(frames[from]);
  return Math.max(center(frames[0]) - origin, Math.min(center(frames[frames.length - 1]) - origin, translation));
}

export function getDragTargetIndex(frames: readonly RowFrame[], from: number, translation: number) {
  if (!frames[from]) return from;
  const center = frames[from].y + frames[from].height / 2 + translation;
  let target = from;
  frames.forEach((frame, index) => {
    const rowCenter = frame.y + frame.height / 2;
    if (index < from && center <= rowCenter) target = Math.min(target, index);
    if (index > from && center >= rowCenter) target = Math.max(target, index);
  });
  return target;
}

export function getPendingProgramExercises(plan: WorkoutProgramPlan | null, logged: { programEntryId?: string | null }[]) {
  const completed = new Set(logged.map((entry) => entry.programEntryId).filter(Boolean));
  return plan?.exercises.filter((entry) => !completed.has(entry.id)) ?? [];
}
