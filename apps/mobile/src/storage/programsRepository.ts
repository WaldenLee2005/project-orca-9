import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { dateOrdinal, isScheduleRevision, localDateKey, parseTrainingProgram, parseWorkoutProgramPlan, reviseSchedule, validateProgram, type ProgramDraft, type TrainingProgram, type ScheduleRevision } from "../features/programs/programModel";
import { findMissedProgramDay } from "../features/programs/programRestart";
import { createLocalId, getDatabase } from "./database";
import { ensureWebTrainingStorage } from "./trainingStorage";
import { emitTrainingChange } from "./trainingChanges";
import { serializeTrainingMutation as serializeWrite } from "./trainingMutationQueue";

const LIBRARY_KEY = "orca9.programLibrary.v3";
type ProgramLibrary = { version: 3; programs: TrainingProgram[]; history: ScheduleRevision[] };
function parsePrograms(value: unknown): TrainingProgram[] {
  if (!Array.isArray(value)) throw new Error("Invalid program library");
  const programs = value.map(parseTrainingProgram);
  if (programs.some((program) => !program) || new Set(programs.map((program) => program!.id)).size !== programs.length) throw new Error("Invalid program library");
  return programs as TrainingProgram[];
}

// Commit templates and schedule history together; only the current format is supported.
async function readLibrary(): Promise<ProgramLibrary> {
  let stored: string | null;
  if (Platform.OS === "web") {
    await ensureWebTrainingStorage();
    stored = await AsyncStorage.getItem(LIBRARY_KEY);
  }
  else stored = (await (await getDatabase()).getFirstAsync<{ data_json: string }>("SELECT data_json FROM program_library WHERE id = 1;"))?.data_json ?? null;
  try {
    if (stored !== null) {
      const value = JSON.parse(stored);
      if (value?.version !== 3 || !Array.isArray(value.history) || !value.history.every(isScheduleRevision) ||
        value.history.some((item: ScheduleRevision, index: number) => index > 0 && item.effectiveFrom <= value.history[index - 1].effectiveFrom)) throw new Error("Invalid schedule history");
      const programs = parsePrograms(value.programs);
      const activeId = value.history.at(-1)?.programId;
      if (activeId && !programs.some((program) => program.id === activeId)) throw new Error("Missing active program");
      const active = programs.find((program) => program.id === activeId);
      const latest = value.history.at(-1) as ScheduleRevision | undefined;
      if (active && latest && (latest.dayKinds.length !== active.days.length
        || latest.dayKinds.some((kind, index) => kind !== active.days[index].kind))) throw new Error("Invalid active schedule days");
      return { version: 3, programs, history: value.history };
    }
    return { version: 3, programs: [], history: [] };
  } catch { throw new Error("Your saved programs or schedule could not be read. Nothing has been overwritten."); }
}

async function writeLibrary(library: ProgramLibrary) {
  const value = JSON.stringify(library);
  if (Platform.OS === "web") await AsyncStorage.setItem(LIBRARY_KEY, value);
  else await (await getDatabase()).runAsync("INSERT INTO program_library (id, data_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json;", [value]);
  emitTrainingChange();
}

export async function getProgramLibrary() {
  return serializeWrite(getProgramLibraryForWorkout);
}

/** Unqueued reconciliation; call only from an already serialized workout mutation. */
export async function getProgramLibraryForWorkout() {
  const library = await readReconciledLibrary();
  const revision = library.history.at(-1);
  const program = library.programs.find((item) => item.id === revision?.programId);
  const restarted = program && revision?.schedule && (revision.schedule.mode !== program.schedule.mode || revision.schedule.startDate !== program.schedule.startDate);
  return {
    programs: sortPrograms(library.programs), activeProgramId: revision?.programId ?? null,
    ...(restarted ? { activeSchedule: { ...revision.schedule! }, restartedAt: revision.effectiveFrom } : {})
  };
}

function sortPrograms(programs: TrainingProgram[]) { return programs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)); }

export async function getTrainingPrograms() { return sortPrograms((await readLibrary()).programs); }
export async function getTrainingProgram(id: string) { return (await getTrainingPrograms()).find((program) => program.id === id) ?? null; }
export async function getProgramScheduleHistory() { return serializeWrite(async () => (await readReconciledLibrary()).history); }

type CompletedProgramDate = { date: string; programId: string; dayId: string };

function isSavedMeasurement(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const set = value as { reps?: number; weight?: number; durationSeconds?: number | null };
  if (!Number.isFinite(set.weight) || set.weight! < 0 || set.weight! > 10000) return false;
  return set.durationSeconds != null
    ? Number.isInteger(set.durationSeconds) && set.durationSeconds >= 1 && set.durationSeconds <= 3600 && set.reps === 0
    : Number.isInteger(set.reps) && set.reps! >= 1 && set.reps! <= 100;
}

function hasSavedExercises(entries: unknown[]): boolean {
  for (const value of entries) {
    if (!value || typeof value !== "object") throw new Error("Invalid recorded exercise");
    const entry = value as { id?: string; exercise?: { id?: string; name?: string }; sets?: number; savedAt?: string; actualSets?: unknown[] };
    if (typeof entry.id !== "string" || typeof entry.exercise?.id !== "string" || typeof entry.exercise.name !== "string"
      || typeof entry.savedAt !== "string" || !Number.isInteger(entry.sets) || entry.sets! < 1 || entry.sets! > 12 || !isSavedMeasurement(value)) throw new Error("Invalid recorded exercise");
    if (entry.actualSets !== undefined && (!Array.isArray(entry.actualSets) || entry.actualSets.length !== entry.sets
      || !entry.actualSets.every(isSavedMeasurement))) throw new Error("Invalid recorded sets");
  }
  return entries.length > 0;
}

// Direct reads avoid a workouts -> programs -> workouts mutation-queue dependency.
async function readProgramCompletions(): Promise<{ unfinished: boolean; completed: CompletedProgramDate[] }> {
  try {
    const completed: CompletedProgramDate[] = [];
    let unfinished = false;
    const collect = (completedAt: unknown, plan: unknown, hasActual: boolean) => {
      if (completedAt === null) { unfinished = true; return; }
      if (typeof completedAt !== "string" || !Number.isFinite(Date.parse(completedAt))) throw new Error("Invalid workout completion");
      if (plan == null || !hasActual) return;
      const snapshot = parseWorkoutProgramPlan(plan);
      if (!snapshot) throw new Error("Invalid saved workout program");
      if (Date.parse(completedAt) <= Date.now()) completed.push({ date: localDateKey(new Date(completedAt)), programId: snapshot.programId, dayId: snapshot.dayId });
    };
    if (Platform.OS === "web") {
      await ensureWebTrainingStorage();
      const stored = await AsyncStorage.getItem("orca9.workoutSessions");
      const sessions: unknown = stored === null ? [] : JSON.parse(stored);
      if (!Array.isArray(sessions)) throw new Error("Invalid workout history");
      const ids = new Set<string>();
      for (const session of sessions) {
        if (!session || typeof session !== "object" || typeof session.id !== "string" || typeof session.startedAt !== "string"
          || !Array.isArray(session.exercises) || ids.has(session.id)) throw new Error("Invalid saved workout");
        ids.add(session.id);
        collect(session.completedAt, session.programPlan, hasSavedExercises(session.exercises));
      }
    } else {
      const rows = await (await getDatabase()).getAllAsync<{ completed_at: string | null; program_plan_json: string | null; has_actual: number }>(
        `SELECT workout_sessions.completed_at, workout_sessions.program_plan_json,
           EXISTS (SELECT 1 FROM workout_exercises
             INNER JOIN set_entries ON set_entries.workout_exercise_id = workout_exercises.id
             WHERE workout_exercises.workout_session_id = workout_sessions.id) AS has_actual
         FROM workout_sessions;`
      );
      for (const row of rows) collect(row.completed_at,
        row.completed_at !== null && row.has_actual && row.program_plan_json !== null ? JSON.parse(row.program_plan_json) : null, Boolean(row.has_actual));
    }
    return { unfinished, completed };
  } catch {
    throw new Error("Your saved workouts could not be read to check your program. Nothing has been overwritten. Try again.");
  }
}

async function readReconciledLibrary(): Promise<ProgramLibrary> {
  for (;;) {
    const today = localDateKey();
    const library = await readLibrary();
    if (today !== localDateKey()) continue;
    const revision = library.history.at(-1);
    const program = library.programs.find((item) => item.id === revision?.programId);
    if (!program || !revision?.schedule || Math.max(dateOrdinal(revision.effectiveFrom), dateOrdinal(revision.schedule.startDate)) >= dateOrdinal(today)) return library;
    const actual = await readProgramCompletions();
    if (today !== localDateKey()) continue;
    // Resume takes priority, even when the unfinished snapshot predates a missed day.
    if (actual.unfinished || !findMissedProgramDay(program, revision, actual.completed, today)) return library;
    library.history = reviseSchedule(library.history, { ...program, schedule: { mode: "cycle", startDate: today } }, today);
    await writeLibrary(library);
    return library;
  }
}

export function saveTrainingProgram(input: ProgramDraft): Promise<TrainingProgram> {
  const draft = validateProgram(input);
  return serializeWrite(async () => {
    const library = await readLibrary();
    const existing = draft.id ? library.programs.find((program) => program.id === draft.id) : null;
    if (draft.id && !existing) throw new Error("That program no longer exists. Return to Programs and create a new one.");
    const now = new Date().toISOString();
    const program: TrainingProgram = { ...draft, id: existing?.id ?? createLocalId("program"), createdAt: existing?.createdAt ?? now, updatedAt: now };
    if (library.history.at(-1)?.programId === program.id) library.history = reviseSchedule(library.history, program);
    library.programs = [program, ...library.programs.filter((entry) => entry.id !== program.id)];
    await writeLibrary(library);
    return program;
  });
}

export function setActiveTrainingProgram(id: string | null) {
  return serializeWrite(async () => {
    const library = await readLibrary();
    const program = id ? library.programs.find((item) => item.id === id) : null;
    if (id && !program) throw new Error("That program no longer exists.");
    if (program) validateProgram(program);
    library.history = reviseSchedule(library.history, program ?? null);
    await writeLibrary(library);
  });
}

export function deleteTrainingProgram(id: string) {
  return serializeWrite(async () => {
    const library = await readLibrary();
    if (library.history.at(-1)?.programId === id) library.history = reviseSchedule(library.history, null);
    library.programs = library.programs.filter((program) => program.id !== id);
    await writeLibrary(library);
  });
}
