import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { type SessionExercise, sessionExercises } from "../features/workouts/repdbSessionExercises";
import { compactLocalDatabase, createLocalId, getDatabase } from "./database";
import { getCachedCurrentUserProfile, warmCurrentUserProfileCache } from "./profilesRepository";
import { dateOrdinal, getScheduledDayIndex, isPlanLoadCoachingEnabled, localDateKey, parseWorkoutProgramPlan, toWorkoutProgramPlan, validateExerciseTarget, validateProgramLoad, type ProgramExercise, type WorkoutProgramPlan } from "../features/programs/programModel";
import { getProgramLibraryForWorkout } from "./programsRepository";
import { ensureWebTrainingStorage } from "./trainingStorage";
import { emitTrainingChange } from "./trainingChanges";
import { serializeTrainingMutation as serializeWorkoutMutation } from "./trainingMutationQueue";

export type WorkoutSet = { reps: number; weight: number; durationSeconds?: number | null; effort?: "easy" | "moderate" | "hard" | null; warmup?: boolean; note?: string | null };
export const MAX_SET_NOTE_LENGTH = 1000;

/** Notes are optional, private text; blank input clears the saved note. */
export function normalizeWorkoutSetNote(note: unknown): string | null {
  if (note == null) return null;
  if (typeof note !== "string") throw new Error("Enter a text note or leave it blank.");
  const normalized = note.trim();
  if (normalized.length > MAX_SET_NOTE_LENGTH) throw new Error(`Keep each set note to ${MAX_SET_NOTE_LENGTH} characters or fewer.`);
  return normalized || null;
}
export type ExerciseExposure = { sessionId: string; performedAt: string; exerciseId: string; exerciseName?: string; exerciseOrder?: number; actualSets: WorkoutSet[]; prescription?: ProgramExercise };
export type StoredSessionExercise = {
  id: string;
  exercise: SessionExercise;
  sets: number;
  reps: number;
  weight: number;
  durationSeconds?: number | null;
  savedAt: string;
  programEntryId?: string | null;
  actualSets?: WorkoutSet[];
  prescription?: ProgramExercise;
};

export type ActiveWorkoutSession = {
  id: string;
  startedAt: string;
  exercises: StoredSessionExercise[];
  programPlan?: WorkoutProgramPlan | null;
  loadCoachingEnabled?: boolean;
};

export type CompletedWorkoutSession = {
  id: string;
  startedAt: string;
  completedAt: string;
  exerciseCount: number;
  totalSets: number;
  totalVolume: number;
  totalDurationSeconds: number;
};

export type CompletedProgramDay = { programId: string; dayId: string };

export type ProgressVolumePoint = {
  id: string;
  completedAt: string;
  volume: number;
};

export type ProgressAverageWeightPoint = {
  id: string;
  completedAt: string;
  averageWeight: number;
  totalReps: number;
};

export type ProgressStrengthPoint = {
  id: string;
  completedAt: string;
  estimatedOneRepMax: number;
  weight: number;
  reps: number;
  exerciseName: string;
};

export type ProgressPersonalRecordPoint = {
  id: string;
  completedAt: string;
  weight: number;
  reps: number;
  exerciseName: string;
};

export type ProgressLiftOption = {
  key: string;
  name: string;
};

type WebWorkoutSession = ActiveWorkoutSession & {
  completedAt: string | null;
  updatedAt: string;
};

const WEB_WORKOUT_SESSIONS_KEY = "orca9.workoutSessions";

type WorkoutSessionRow = {
  id: string;
  started_at: string;
  program_plan_json: string | null;
  load_coaching_enabled: number | null;
};

type CompletedWorkoutSessionRow = {
  id: string;
  started_at: string;
  completed_at: string;
  exercise_count: number;
  total_sets: number;
  total_volume: number;
  total_duration_seconds: number;
};

type ProgressVolumePointRow = {
  id: string;
  completed_at: string;
  volume: number;
};

type ProgressAverageWeightPointRow = {
  id: string;
  completed_at: string;
  average_weight: number;
  total_reps: number;
};

type ProgressStrengthPointRow = {
  id: string;
  completed_at: string;
  estimated_one_rep_max: number;
  weight: number;
  reps: number;
  exercise_name: string;
};

type ProgressPersonalRecordSetRow = {
  id: string;
  completed_at: string;
  weight: number;
  reps: number;
  exercise_id: string | null;
  exercise_name: string;
};

type ProgressLiftOptionRow = {
  lift_key: string;
  name: string;
  latest_completed_at: string;
};

type WorkoutExerciseRow = {
  id: string;
  exercise_id: string | null;
  custom_exercise_name: string | null;
  exercise_name_snapshot: string;
  exercise_order: number;
  saved_at: string;
  program_entry_id: string | null;
  sets: number;
  reps: number;
  weight: number;
  duration_seconds: number | null;
  prescription_json: string | null;
};

export async function getActiveWorkoutSession() {
  if (Platform.OS === "web") {
    return getActiveWebWorkoutSession();
  }

  const database = await getDatabase();
  const session = await database.getFirstAsync<WorkoutSessionRow>(
    `SELECT id, started_at, program_plan_json, load_coaching_enabled
     FROM workout_sessions
     WHERE completed_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1;`
  );

  if (!session) {
    return null;
  }

  const programPlan = decodeProgramPlan(session.program_plan_json);
  return {
    id: session.id,
    startedAt: session.started_at,
    exercises: await getWorkoutExercises(session.id),
    programPlan,
    loadCoachingEnabled: session.load_coaching_enabled == null ? isPlanLoadCoachingEnabled(programPlan) : session.load_coaching_enabled === 1
  };
}

/** Saved sets from either an active or completed workout, in their original order. */
export async function getWorkoutSessionExercises(sessionId: string): Promise<StoredSessionExercise[]> {
  if (Platform.OS === "web") {
    const sessions = await getWebWorkoutSessions(true);
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) throw new Error("This workout could not be found.");
    return session.exercises.map((exercise) => ({ ...exercise, actualSets: getActualSets(exercise) }));
  }
  const database = await getDatabase();
  const session = await database.getFirstAsync<{ id: string }>("SELECT id FROM workout_sessions WHERE id = ?;", [sessionId]);
  if (!session) throw new Error("This workout could not be found.");
  return getWorkoutExercises(sessionId);
}

/** Edit only a single set's private note, including after workout completion. */
export async function updateWorkoutSetNote(workoutExerciseId: string, setNumber: number, note: string | null): Promise<string | null> {
  const normalizedNote = normalizeWorkoutSetNote(note);
  if (!Number.isInteger(setNumber) || setNumber < 1 || setNumber > 12) throw new Error("This recorded set could not be found.");
  return serializeWorkoutMutation(async () => {
    const now = new Date().toISOString();
    if (Platform.OS === "web") {
      const sessions = await getWebWorkoutSessions(true);
      const matches = sessions.flatMap((session, sessionIndex) => session.exercises.flatMap((exercise, exerciseIndex) =>
        exercise.id === workoutExerciseId ? [{ sessionIndex, exerciseIndex, exercise }] : []));
      if (matches.length !== 1) throw new Error("This recorded exercise could not be found.");
      const { sessionIndex, exerciseIndex, exercise } = matches[0];
      const actualSets = getActualSets(exercise);
      if (!actualSets[setNumber - 1]) throw new Error("This recorded set could not be found.");
      actualSets[setNumber - 1] = { ...actualSets[setNumber - 1], note: normalizedNote };
      const nextSessions = [...sessions];
      const exercises = [...sessions[sessionIndex].exercises];
      exercises[exerciseIndex] = { ...exercise, actualSets };
      nextSessions[sessionIndex] = { ...sessions[sessionIndex], exercises, updatedAt: now };
      await saveWebWorkoutSessions(nextSessions);
    } else {
      const database = await getDatabase();
      await database.withTransactionAsync(async () => {
        const exercise = await database.getFirstAsync<{ workout_session_id: string }>(
          "SELECT workout_session_id FROM workout_exercises WHERE id = ?;", [workoutExerciseId]);
        if (!exercise) throw new Error("This recorded exercise could not be found.");
        const result = await database.runAsync(
          "UPDATE set_entries SET note = ?, updated_at = ? WHERE workout_exercise_id = ? AND set_number = ?;",
          [normalizedNote, now, workoutExerciseId, setNumber]);
        if (result.changes !== 1) throw new Error("This recorded set could not be found.");
        await database.runAsync("UPDATE workout_sessions SET updated_at = ? WHERE id = ?;", [now, exercise.workout_session_id]);
      });
    }
    return normalizedNote;
  });
}

export async function getCompletedWorkoutSessions(limit = 8) {
  if (Platform.OS === "web") {
    return getCompletedWebWorkoutSessions(limit);
  }

  const database = await getDatabase();
  const rows = await database.getAllAsync<CompletedWorkoutSessionRow>(
    `SELECT
       workout_sessions.id,
       workout_sessions.started_at,
       workout_sessions.completed_at,
       COUNT(DISTINCT workout_exercises.id) AS exercise_count,
       COUNT(set_entries.id) AS total_sets,
       COALESCE(SUM(CASE WHEN set_entries.duration_seconds IS NULL THEN set_entries.weight * set_entries.reps ELSE 0 END), 0) AS total_volume,
       COALESCE(SUM(set_entries.duration_seconds), 0) AS total_duration_seconds
     FROM workout_sessions
     LEFT JOIN workout_exercises
       ON workout_exercises.workout_session_id = workout_sessions.id
     LEFT JOIN set_entries
       ON set_entries.workout_exercise_id = workout_exercises.id
     WHERE workout_sessions.completed_at IS NOT NULL
     GROUP BY workout_sessions.id
     ORDER BY workout_sessions.completed_at DESC
     LIMIT ?;`,
    [limit]
  );

  return rows.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    exerciseCount: row.exercise_count,
    totalSets: row.total_sets,
    totalVolume: row.total_volume,
    totalDurationSeconds: row.total_duration_seconds
  }));
}

/** Actual completed workouts mark their saved program day on the completion's local date. */
export async function getCompletedProgramDays(date = localDateKey()): Promise<CompletedProgramDay[]> {
  if (!Number.isFinite(dateOrdinal(date))) throw new Error("The device date is invalid.");
  const completed = new Map<string, CompletedProgramDay>();
  const collect = (completedAt: string, programPlan: WorkoutProgramPlan | null) => {
    const timestamp = new Date(completedAt);
    if (!programPlan || !Number.isFinite(timestamp.getTime()) || timestamp.getTime() > Date.now() || localDateKey(timestamp) !== date) return;
    const { programId, dayId } = programPlan;
    completed.set(JSON.stringify([programId, dayId]), { programId, dayId });
  };
  if (Platform.OS === "web") {
    for (const session of await getWebWorkoutSessions(true)) {
      if (session.completedAt && session.exercises.length) collect(session.completedAt, parseWorkoutProgramPlan(session.programPlan));
    }
  } else {
    const database = await getDatabase();
    const rows = await database.getAllAsync<{ completed_at: string; program_plan_json: string }>(
      `SELECT workout_sessions.completed_at, workout_sessions.program_plan_json
       FROM workout_sessions
       WHERE workout_sessions.completed_at IS NOT NULL AND workout_sessions.program_plan_json IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM workout_exercises
           INNER JOIN set_entries ON set_entries.workout_exercise_id = workout_exercises.id
           WHERE workout_exercises.workout_session_id = workout_sessions.id
         );`
    );
    for (const row of rows) collect(row.completed_at, decodeProgramPlan(row.program_plan_json));
  }
  return [...completed.values()];
}

export async function getProgressAverageWeightSeries(input: { liftKey?: string | null; limit?: number } = {}) {
  if (Platform.OS === "web") {
    return getWebProgressAverageWeightSeries(input);
  }

  const database = await getDatabase();
  const limit = input.limit ?? 120;
  const rows = input.liftKey
    ? await database.getAllAsync<ProgressAverageWeightPointRow>(
        `SELECT
           workout_sessions.id,
           workout_sessions.completed_at,
           COALESCE(SUM(set_entries.weight * set_entries.reps) / NULLIF(SUM(set_entries.reps), 0), 0) AS average_weight,
           COALESCE(SUM(set_entries.reps), 0) AS total_reps
         FROM workout_sessions
         INNER JOIN workout_exercises
           ON workout_exercises.workout_session_id = workout_sessions.id
         INNER JOIN set_entries
           ON set_entries.workout_exercise_id = workout_exercises.id
         WHERE workout_sessions.completed_at IS NOT NULL AND set_entries.duration_seconds IS NULL AND set_entries.reps > 0
           AND COALESCE(workout_exercises.exercise_id, 'custom:' || lower(workout_exercises.exercise_name_snapshot)) = ?
         GROUP BY workout_sessions.id
         ORDER BY workout_sessions.completed_at DESC
         LIMIT ?;`,
        [input.liftKey, limit]
      )
    : await database.getAllAsync<ProgressAverageWeightPointRow>(
        `SELECT
           workout_sessions.id,
           workout_sessions.completed_at,
           COALESCE(SUM(set_entries.weight * set_entries.reps) / NULLIF(SUM(set_entries.reps), 0), 0) AS average_weight,
           COALESCE(SUM(set_entries.reps), 0) AS total_reps
         FROM workout_sessions
         INNER JOIN workout_exercises
           ON workout_exercises.workout_session_id = workout_sessions.id
         INNER JOIN set_entries
           ON set_entries.workout_exercise_id = workout_exercises.id
         WHERE workout_sessions.completed_at IS NOT NULL AND set_entries.duration_seconds IS NULL AND set_entries.reps > 0
         GROUP BY workout_sessions.id
         ORDER BY workout_sessions.completed_at DESC
         LIMIT ?;`,
        [limit]
      );

  return rows.reverse().map((row) => ({
    id: row.id,
    completedAt: row.completed_at,
    averageWeight: row.average_weight,
    totalReps: row.total_reps
  }));
}

export async function getProgressStrengthSeries(input: { liftKey?: string | null; limit?: number } = {}) {
  if (Platform.OS === "web") {
    return getWebProgressStrengthSeries(input);
  }

  const database = await getDatabase();
  const limit = input.limit ?? 120;
  const rows = input.liftKey
    ? await database.getAllAsync<ProgressStrengthPointRow>(
        `SELECT
           ranked_sets.id,
           ranked_sets.completed_at,
           ranked_sets.estimated_one_rep_max,
           ranked_sets.weight,
           ranked_sets.reps,
           ranked_sets.exercise_name
         FROM (
           SELECT
             workout_sessions.id,
             workout_sessions.completed_at,
             set_entries.weight * (1 + set_entries.reps / 30.0) AS estimated_one_rep_max,
             set_entries.weight,
             set_entries.reps,
             workout_exercises.exercise_name_snapshot AS exercise_name,
             ROW_NUMBER() OVER (
               PARTITION BY workout_sessions.id
               ORDER BY set_entries.weight * (1 + set_entries.reps / 30.0) DESC, set_entries.weight DESC
             ) AS strength_rank
           FROM workout_sessions
           INNER JOIN workout_exercises
             ON workout_exercises.workout_session_id = workout_sessions.id
           INNER JOIN set_entries
             ON set_entries.workout_exercise_id = workout_exercises.id
           WHERE workout_sessions.completed_at IS NOT NULL AND set_entries.duration_seconds IS NULL AND set_entries.reps > 0
             AND COALESCE(workout_exercises.exercise_id, 'custom:' || lower(workout_exercises.exercise_name_snapshot)) = ?
         ) ranked_sets
         WHERE ranked_sets.strength_rank = 1
         ORDER BY ranked_sets.completed_at DESC
         LIMIT ?;`,
        [input.liftKey, limit]
      )
    : await database.getAllAsync<ProgressStrengthPointRow>(
        `SELECT
           ranked_sets.id,
           ranked_sets.completed_at,
           ranked_sets.estimated_one_rep_max,
           ranked_sets.weight,
           ranked_sets.reps,
           ranked_sets.exercise_name
         FROM (
           SELECT
             workout_sessions.id,
             workout_sessions.completed_at,
             set_entries.weight * (1 + set_entries.reps / 30.0) AS estimated_one_rep_max,
             set_entries.weight,
             set_entries.reps,
             workout_exercises.exercise_name_snapshot AS exercise_name,
             ROW_NUMBER() OVER (
               PARTITION BY workout_sessions.id
               ORDER BY set_entries.weight * (1 + set_entries.reps / 30.0) DESC, set_entries.weight DESC
             ) AS strength_rank
           FROM workout_sessions
           INNER JOIN workout_exercises
             ON workout_exercises.workout_session_id = workout_sessions.id
           INNER JOIN set_entries
             ON set_entries.workout_exercise_id = workout_exercises.id
           WHERE workout_sessions.completed_at IS NOT NULL AND set_entries.duration_seconds IS NULL AND set_entries.reps > 0
         ) ranked_sets
         WHERE ranked_sets.strength_rank = 1
         ORDER BY ranked_sets.completed_at DESC
         LIMIT ?;`,
        [limit]
      );

  return rows.reverse().map(mapProgressStrengthPointRow);
}

/** Heaviest actual rep set, across the full completed history so older PRs remain available. */
export async function getProgressPersonalRecordSeries(input: { liftKey?: string | null } = {}): Promise<ProgressPersonalRecordPoint[]> {
  // The existing native picker lowercases ASCII in SQL; finish Unicode case folding here.
  const liftKey = input.liftKey?.startsWith("custom:") ? input.liftKey.toLowerCase() : input.liftKey;
  if (Platform.OS === "web") {
    return getWebProgressPersonalRecordSeries({ liftKey });
  }

  const database = await getDatabase();
  const rows = await database.getAllAsync<ProgressPersonalRecordSetRow>(
    `SELECT
       workout_sessions.id,
       workout_sessions.completed_at,
       set_entries.weight,
       set_entries.reps,
       workout_exercises.exercise_id,
       workout_exercises.exercise_name_snapshot AS exercise_name
     FROM workout_sessions
     INNER JOIN workout_exercises ON workout_exercises.workout_session_id = workout_sessions.id
     INNER JOIN set_entries ON set_entries.workout_exercise_id = workout_exercises.id
     WHERE workout_sessions.completed_at IS NOT NULL
       AND set_entries.reps > 0 AND set_entries.duration_seconds IS NULL
     ORDER BY workout_sessions.completed_at ASC, workout_sessions.id ASC,
       workout_exercises.exercise_order ASC, set_entries.set_number ASC, workout_exercises.id ASC;`
  );
  const points = new Map<string, ProgressPersonalRecordPoint>();
  for (const row of rows) {
    // Share the web key function rather than SQLite's ASCII-only lower() for custom names.
    const key = getExerciseProgressKey(row.exercise_id ?? "custom-", row.exercise_name);
    if (liftKey && key !== liftKey) continue;
    const existing = points.get(row.id);
    if (!existing || row.weight > existing.weight) {
      points.set(row.id, { id: row.id, completedAt: row.completed_at, weight: row.weight, reps: row.reps, exerciseName: row.exercise_name });
    }
  }
  return [...points.values()];
}

export async function getProgressLiftOptions() {
  if (Platform.OS === "web") {
    return getWebProgressLiftOptions();
  }

  const database = await getDatabase();
  const rows = await database.getAllAsync<ProgressLiftOptionRow>(
    `SELECT
       COALESCE(workout_exercises.exercise_id, 'custom:' || lower(workout_exercises.exercise_name_snapshot)) AS lift_key,
       workout_exercises.exercise_name_snapshot AS name,
       MAX(workout_sessions.completed_at) AS latest_completed_at
     FROM workout_exercises
     INNER JOIN workout_sessions
       ON workout_sessions.id = workout_exercises.workout_session_id
     INNER JOIN set_entries ON set_entries.workout_exercise_id = workout_exercises.id
     WHERE workout_sessions.completed_at IS NOT NULL AND set_entries.duration_seconds IS NULL AND set_entries.reps > 0
     GROUP BY lift_key
     ORDER BY latest_completed_at DESC, name ASC;`
  );

  return rows.map((row) => ({
    key: row.lift_key,
    name: row.name
  }));
}

export async function getProgressVolumeSeries(input: { liftKey?: string | null; limit?: number } = {}) {
  if (Platform.OS === "web") {
    return getWebProgressVolumeSeries(input);
  }

  const database = await getDatabase();
  const limit = input.limit ?? 120;
  const rows = input.liftKey
    ? await database.getAllAsync<ProgressVolumePointRow>(
        `SELECT
           workout_sessions.id,
           workout_sessions.completed_at,
           COALESCE(SUM(set_entries.weight * set_entries.reps), 0) AS volume
         FROM workout_sessions
         INNER JOIN workout_exercises
           ON workout_exercises.workout_session_id = workout_sessions.id
         INNER JOIN set_entries
           ON set_entries.workout_exercise_id = workout_exercises.id
         WHERE workout_sessions.completed_at IS NOT NULL AND set_entries.duration_seconds IS NULL AND set_entries.reps > 0
           AND COALESCE(workout_exercises.exercise_id, 'custom:' || lower(workout_exercises.exercise_name_snapshot)) = ?
         GROUP BY workout_sessions.id
         ORDER BY workout_sessions.completed_at DESC
         LIMIT ?;`,
        [input.liftKey, limit]
      )
    : await database.getAllAsync<ProgressVolumePointRow>(
        `SELECT
           workout_sessions.id,
           workout_sessions.completed_at,
           COALESCE(SUM(set_entries.weight * set_entries.reps), 0) AS volume
         FROM workout_sessions
         INNER JOIN workout_exercises
           ON workout_exercises.workout_session_id = workout_sessions.id
         INNER JOIN set_entries
           ON set_entries.workout_exercise_id = workout_exercises.id
         WHERE workout_sessions.completed_at IS NOT NULL AND set_entries.duration_seconds IS NULL AND set_entries.reps > 0
         GROUP BY workout_sessions.id
         ORDER BY workout_sessions.completed_at DESC
         LIMIT ?;`,
        [limit]
      );

  return rows.reverse().map((row) => ({
    id: row.id,
    completedAt: row.completed_at,
    volume: row.volume
  }));
}

type CreateSessionInput = { programPlan: WorkoutProgramPlan } | { followActiveProgram: true };

export async function createWorkoutSession(input?: CreateSessionInput): Promise<ActiveWorkoutSession> {
  // Serialize all workout mutations so cancellation cannot overwrite a concurrent save on web.
  return serializeWorkoutMutation(() => createStoredWorkoutSession(input));
}

/** A session override applies to every exercise without changing its saved program or results. */
export async function setWorkoutSessionLoadCoaching(sessionId: string, enabled: boolean): Promise<void> {
  if (typeof enabled !== "boolean") throw new Error("Choose whether load coaching is on or off.");
  return serializeWorkoutMutation(async () => {
    const now = new Date().toISOString();
    if (Platform.OS === "web") {
      const sessions = await getWebWorkoutSessions(true);
      const index = sessions.findIndex((session) => session.id === sessionId && session.completedAt === null);
      if (index < 0) throw new Error("This workout is no longer active.");
      const next = [...sessions];
      next[index] = { ...sessions[index], loadCoachingEnabled: enabled, updatedAt: now };
      await saveWebWorkoutSessions(next);
    } else {
      const database = await getDatabase();
      const result = await database.runAsync("UPDATE workout_sessions SET load_coaching_enabled = ?, updated_at = ? WHERE id = ? AND completed_at IS NULL;", [enabled ? 1 : 0, now, sessionId]);
      if (result.changes !== 1) throw new Error("This workout is no longer active.");
    }
  });
}

async function createStoredWorkoutSession(input?: CreateSessionInput): Promise<ActiveWorkoutSession> {
  const explicitPlan = input && "programPlan" in input;
  let programPlan = explicitPlan ? parseWorkoutProgramPlan(input.programPlan) : null;
  if (explicitPlan && !programPlan) throw new Error("This program is invalid. Edit and save it before starting a workout.");
  const active = await getActiveWorkoutSession();
  if (active) {
    if (programPlan) throw new Error("Finish your active workout before starting a program.");
    return active;
  }
  if (input) {
    // Read current eligibility at creation time; a delayed read across midnight must resolve the new day.
    const explicitProgramPlan = programPlan;
    for (;;) {
      const date = localDateKey();
      let alreadyCompleted = false;
      if ("followActiveProgram" in input) {
        const library = await getProgramLibraryForWorkout();
        const program = library.programs.find((item) => item.id === library.activeProgramId);
        const day = program?.days[getScheduledDayIndex(library.activeSchedule ?? program.schedule, program.days.length, date)];
        programPlan = null;
        if (program && day?.kind === "training") {
          const completed = await getCompletedProgramDays(date);
          if (!completed.some((item) => item.programId === program.id && item.dayId === day.id)) programPlan = toWorkoutProgramPlan({ ...program, schedule: library.activeSchedule ?? program.schedule }, day.id);
        }
        // Rest, future starts and completed training days allow an unplanned extra workout.
      } else if (explicitProgramPlan) {
        const completed = await getCompletedProgramDays(date);
        alreadyCompleted = completed.some((item) => item.programId === explicitProgramPlan.programId && item.dayId === explicitProgramPlan.dayId);
      }
      if (date !== localDateKey()) continue;
      if (alreadyCompleted) throw new Error("You already completed this program day today. Start an extra workout without the program.");
      break;
    }
  }
  if (Platform.OS === "web") {
    return createWebWorkoutSession(programPlan);
  }

  const database = await getDatabase();
  const profile = getCachedCurrentUserProfile();
  const now = new Date().toISOString();
  const id = createLocalId("session");

  if (!profile) {
    warmCurrentUserProfileCache();
  }

  await database.runAsync(
    `INSERT INTO workout_sessions (
       id,
       profile_id,
       started_at,
       program_plan_json,
       load_coaching_enabled,
       created_at,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [id, profile?.id ?? null, now, programPlan ? JSON.stringify(programPlan) : null, isPlanLoadCoachingEnabled(programPlan) ? 1 : 0, now, now]
  );

  return { id, startedAt: now, exercises: [], programPlan, loadCoachingEnabled: isPlanLoadCoachingEnabled(programPlan) };
}

type AddExerciseInput = {
  sessionId: string;
  exercise: SessionExercise;
  sets: number;
  reps: number;
  weight: number;
  durationSeconds?: number | null;
  programEntryId?: string | null;
  actualSets?: WorkoutSet[];
  prescription?: ProgramExercise;
};

export async function addExerciseToWorkoutSession(input: AddExerciseInput) {
  return serializeWorkoutMutation(() => addStoredExerciseToWorkoutSession(input));
}

async function addStoredExerciseToWorkoutSession(input: AddExerciseInput) {
  validateWorkoutMeasurement(input);
  const actualSets = getActualSets(input);
  validateActualSets(actualSets);
  if (actualSets.length !== input.sets) throw new Error("The set count does not match the recorded sets.");
  if (input.prescription) {
    validateExerciseTarget(input.prescription.target);
    if (input.prescription.load) validateProgramLoad(input.prescription.load);
    if (input.prescription.exerciseId !== input.exercise.id || !Number.isInteger(input.prescription.sets) || input.prescription.sets < 1 || input.prescription.sets > 12) throw new Error("Invalid exercise prescription.");
  }
  const session = await getActiveWorkoutSession();
  if (!session || session.id !== input.sessionId) throw new Error("This workout is no longer active.");
  if (Platform.OS === "web") {
    return addExerciseToWebWorkoutSession(input);
  }

  const database = await getDatabase();
  const now = new Date().toISOString();
  const workoutExerciseId = createLocalId("workout-exercise");
  const nextOrder = await getNextExerciseOrder(input.sessionId);
  const isCustomExercise = input.exercise.id.startsWith("custom-");
  const setEntries = Array.from({ length: input.sets }, (_, index) => ({
    id: createLocalId("set"),
    setNumber: index + 1
  }));

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO workout_exercises (
         id,
         workout_session_id,
         exercise_id,
         custom_exercise_name,
         exercise_name_snapshot,
         exercise_order,
         program_entry_id,
         prescription_json,
         saved_at,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        workoutExerciseId,
        input.sessionId,
        isCustomExercise ? null : input.exercise.id,
        isCustomExercise ? input.exercise.name : null,
        input.exercise.name,
        nextOrder,
        input.programEntryId ?? null,
        input.prescription ? JSON.stringify(input.prescription) : null,
        now,
        now,
        now
      ]
    );

    await insertSetEntries({
      completedAt: now,
      database,
      setEntries,
      workoutExerciseId,
      actualSets
    });

    await database.runAsync("UPDATE workout_sessions SET updated_at = ? WHERE id = ?;", [now, input.sessionId]);
  });

  return {
    id: workoutExerciseId,
    exercise: input.exercise,
    sets: input.sets,
    reps: input.reps,
    weight: input.weight,
    durationSeconds: input.durationSeconds ?? null,
    savedAt: now,
    programEntryId: input.programEntryId ?? null,
    actualSets, ...(input.prescription ? { prescription: input.prescription } : {})
  };
}

export async function deleteWorkoutExercise(workoutExerciseId: string) {
  return serializeWorkoutMutation(() => deleteStoredWorkoutExercise(workoutExerciseId));
}

async function deleteStoredWorkoutExercise(workoutExerciseId: string) {
  if (Platform.OS === "web") {
    await deleteWebWorkoutExercise(workoutExerciseId);
    return;
  }

  const database = await getDatabase();
  await database.runAsync("DELETE FROM workout_exercises WHERE id = ?;", [workoutExerciseId]);
  await compactLocalDatabase();
}

export async function completeWorkoutSession(sessionId: string) {
  return serializeWorkoutMutation(() => completeStoredWorkoutSession(sessionId));
}

async function completeStoredWorkoutSession(sessionId: string) {
  if (Platform.OS === "web") {
    return completeWebWorkoutSession(sessionId);
  }

  const database = await getDatabase();
  const now = new Date().toISOString();

  const result = await database.runAsync(
    `UPDATE workout_sessions
     SET completed_at = COALESCE(completed_at, ?),
         updated_at = ?
     WHERE id = ?;`,
    [now, now, sessionId]
  );
  if (result.changes > 0) emitTrainingChange();

  return { id: sessionId, completedAt: now };
}

export async function cancelEmptyWorkoutSession(sessionId: string): Promise<boolean> {
  return serializeWorkoutMutation(async () => {
    if (Platform.OS === "web") {
      // Refuse malformed storage rather than dropping unrelated records during cancellation.
      const sessions = await getWebWorkoutSessions(true);
      const session = sessions.find((item) => item.id === sessionId);
      if (!session || session.completedAt != null || session.exercises.length > 0) return false;
      await saveWebWorkoutSessions(sessions.filter((item) => item.id !== sessionId));
      return true;
    }

    const database = await getDatabase();
    // The guard is part of the delete, so an empty screen can never delete newly saved results.
    const result = await database.runAsync(
      `DELETE FROM workout_sessions
       WHERE id = ? AND completed_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM workout_exercises
           WHERE workout_session_id = workout_sessions.id
         );`,
      [sessionId]
    );
    return result.changes > 0;
  });
}

async function getWebWorkoutSessions(requireValidStorage = false) {
  await ensureWebTrainingStorage();
  const storedSessions = await AsyncStorage.getItem(WEB_WORKOUT_SESSIONS_KEY);

  if (!storedSessions) {
    return [];
  }

  try {
    const parsed = JSON.parse(storedSessions);
    if (requireValidStorage && (!Array.isArray(parsed) || !parsed.every(isWebWorkoutSession)
      || !parsed.every((session) => session.completedAt === null || typeof session.completedAt === "string")
      || new Set(parsed.map((session) => session.id)).size !== parsed.length
      || !parsed.every((session) => session.exercises.every(isValidStoredSessionExercise)))) {
      throw new Error("Invalid saved workout data.");
    }
    return Array.isArray(parsed) ? parsed.filter(isWebWorkoutSession) : [];
  } catch {
    if (requireValidStorage) throw new Error("Could not safely read your saved workouts.");
    return [];
  }
}

async function saveWebWorkoutSessions(sessions: WebWorkoutSession[]) {
  await ensureWebTrainingStorage();
  await AsyncStorage.setItem(WEB_WORKOUT_SESSIONS_KEY, JSON.stringify(sessions));
}

async function getActiveWebWorkoutSession() {
  const sessions = await getWebWorkoutSessions();
  const activeSession = sessions
    .filter((session) => !session.completedAt)
    .sort((first, second) => second.startedAt.localeCompare(first.startedAt))[0];

  return activeSession ? toActiveWorkoutSession(activeSession) : null;
}

async function getCompletedWebWorkoutSessions(limit: number) {
  const sessions = await getWebWorkoutSessions();

  return sessions
    .filter((session) => Boolean(session.completedAt))
    .sort((first, second) => (second.completedAt ?? "").localeCompare(first.completedAt ?? ""))
    .slice(0, limit)
    .map((session) => {
      const totalSets = session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
      const totalVolume = session.exercises.reduce((sum, exercise) => sum + getActualSets(exercise).reduce((v, set) => v + (set.durationSeconds == null ? set.reps * set.weight : 0), 0), 0);

      return {
        id: session.id,
        startedAt: session.startedAt,
        completedAt: session.completedAt ?? session.updatedAt,
        exerciseCount: session.exercises.length,
        totalSets,
        totalVolume,
        totalDurationSeconds: session.exercises.reduce((sum, exercise) => sum + getActualSets(exercise).reduce((v, set) => v + (set.durationSeconds ?? 0), 0), 0)
      };
    });
}

async function getWebProgressLiftOptions() {
  const sessions = await getWebWorkoutSessions();
  const liftOptions = new Map<string, { name: string; latestCompletedAt: string }>();

  sessions
    .filter((session) => Boolean(session.completedAt))
    .forEach((session) => {
      session.exercises.filter((exercise) => exercise.durationSeconds == null).forEach((exercise) => {
        const key = getExerciseProgressKey(exercise.exercise.id, exercise.exercise.name);
        const completedAt = session.completedAt ?? session.updatedAt;
        const existing = liftOptions.get(key);

        if (!existing || completedAt > existing.latestCompletedAt) {
          liftOptions.set(key, {
            name: exercise.exercise.name,
            latestCompletedAt: completedAt
          });
        }
      });
    });

  return Array.from(liftOptions.entries())
    .sort((first, second) => {
      const completedAtComparison = second[1].latestCompletedAt.localeCompare(first[1].latestCompletedAt);
      return completedAtComparison || first[1].name.localeCompare(second[1].name);
    })
    .map(([key, option]) => ({ key, name: option.name }));
}

async function getWebProgressVolumeSeries(input: { liftKey?: string | null; limit?: number }) {
  const sessions = await getWebWorkoutSessions();
  const limit = input.limit ?? 120;

  return sessions
    .filter((session) => Boolean(session.completedAt))
    .map((session) => ({
      id: session.id,
      completedAt: session.completedAt ?? session.updatedAt,
      volume: session.exercises
        .filter((exercise) => exercise.durationSeconds == null && (!input.liftKey || getExerciseProgressKey(exercise.exercise.id, exercise.exercise.name) === input.liftKey))
        .reduce((sum, exercise) => sum + getActualSets(exercise).reduce((v, set) => v + (set.durationSeconds == null ? set.reps * set.weight : 0), 0), 0)
    }))
    .filter((point) => point.volume > 0)
    .sort((first, second) => first.completedAt.localeCompare(second.completedAt))
    .slice(-limit);
}

async function getWebProgressAverageWeightSeries(input: { liftKey?: string | null; limit?: number }) {
  const sessions = await getWebWorkoutSessions();
  const limit = input.limit ?? 120;

  return sessions
    .filter((session) => Boolean(session.completedAt))
    .map((session) => {
      const matchingExercises = session.exercises.filter(
        (exercise) => exercise.durationSeconds == null && (!input.liftKey || getExerciseProgressKey(exercise.exercise.id, exercise.exercise.name) === input.liftKey)
      );
      const totalVolume = matchingExercises.reduce(
        (sum, exercise) => sum + getActualSets(exercise).reduce((v, set) => v + (set.durationSeconds == null ? set.reps * set.weight : 0), 0),
        0
      );
      const totalReps = matchingExercises.reduce((sum, exercise) => sum + getActualSets(exercise).reduce((v, set) => v + (set.durationSeconds == null ? set.reps : 0), 0), 0);

      return {
        id: session.id,
        completedAt: session.completedAt ?? session.updatedAt,
        averageWeight: totalReps > 0 ? totalVolume / totalReps : 0,
        totalReps
      };
    })
    .filter((point) => point.totalReps > 0)
    .sort((first, second) => first.completedAt.localeCompare(second.completedAt))
    .slice(-limit);
}

async function getWebProgressStrengthSeries(input: { liftKey?: string | null; limit?: number }) {
  const sessions = await getWebWorkoutSessions();
  const limit = input.limit ?? 120;

  return sessions
    .filter((session) => Boolean(session.completedAt))
    .map((session) => {
      const bestExercise = session.exercises
        .filter((exercise) => exercise.durationSeconds == null && (!input.liftKey || getExerciseProgressKey(exercise.exercise.id, exercise.exercise.name) === input.liftKey))
        .flatMap((exercise) => getActualSets(exercise).filter((set) => set.durationSeconds == null).map((set) => ({
          exerciseName: exercise.exercise.name,
          estimatedOneRepMax: estimateOneRepMax(set.weight, set.reps),
          reps: set.reps,
          weight: set.weight
        })))
        .sort((first, second) => second.estimatedOneRepMax - first.estimatedOneRepMax || second.weight - first.weight)[0];

      return bestExercise
        ? {
            id: session.id,
            completedAt: session.completedAt ?? session.updatedAt,
            ...bestExercise
          }
        : null;
    })
    .filter((point): point is ProgressStrengthPoint => Boolean(point))
    .sort((first, second) => first.completedAt.localeCompare(second.completedAt))
    .slice(-limit);
}

async function getWebProgressPersonalRecordSeries(input: { liftKey?: string | null }): Promise<ProgressPersonalRecordPoint[]> {
  const sessions = await getWebWorkoutSessions();
  const points: ProgressPersonalRecordPoint[] = [];
  for (const session of sessions) {
    if (!session.completedAt) continue;
    let best: ProgressPersonalRecordPoint | null = null;
    for (const exercise of session.exercises) {
      if (input.liftKey && getExerciseProgressKey(exercise.exercise.id, exercise.exercise.name) !== input.liftKey) continue;
      for (const set of getActualSets(exercise)) {
        if (set.reps <= 0 || set.durationSeconds != null) continue;
        // Preserve the first exercise/set when equally heavy sets share a session.
        if (!best || set.weight > best.weight) {
          best = { id: session.id, completedAt: session.completedAt, weight: set.weight, reps: set.reps, exerciseName: exercise.exercise.name };
        }
      }
    }
    if (best) points.push(best);
  }
  return points.sort((first, second) => first.completedAt.localeCompare(second.completedAt)
    || (first.id < second.id ? -1 : first.id > second.id ? 1 : 0));
}

async function createWebWorkoutSession(programPlan: WorkoutProgramPlan | null) {
  const sessions = await getWebWorkoutSessions();
  const now = new Date().toISOString();
  const session = {
    id: createLocalId("session"),
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    exercises: [],
    programPlan,
    loadCoachingEnabled: isPlanLoadCoachingEnabled(programPlan)
  };

  await saveWebWorkoutSessions([session, ...sessions]);
  return toActiveWorkoutSession(session);
}

async function addExerciseToWebWorkoutSession(input: AddExerciseInput) {
  const sessions = await getWebWorkoutSessions();
  const sessionIndex = sessions.findIndex((session) => session.id === input.sessionId);

  if (sessionIndex === -1) {
    throw new Error(`Workout session ${input.sessionId} was not found.`);
  }

  const now = new Date().toISOString();
  const storedExercise = {
    id: createLocalId("workout-exercise"),
    exercise: input.exercise,
    sets: input.sets,
    reps: input.reps,
    weight: input.weight,
    durationSeconds: input.durationSeconds ?? null,
    savedAt: now,
    programEntryId: input.programEntryId ?? null,
    actualSets: getActualSets(input), ...(input.prescription ? { prescription: input.prescription } : {})
  };

  const nextSessions = [...sessions];
  const session = nextSessions[sessionIndex];
  nextSessions[sessionIndex] = {
    ...session,
    exercises: [...session.exercises, storedExercise],
    updatedAt: now
  };

  await saveWebWorkoutSessions(nextSessions);
  return storedExercise;
}

async function deleteWebWorkoutExercise(workoutExerciseId: string) {
  const sessions = await getWebWorkoutSessions();
  const nextSessions = sessions.map((session) => ({
    ...session,
    exercises: session.exercises.filter((exercise) => exercise.id !== workoutExerciseId),
    updatedAt: new Date().toISOString()
  }));

  await saveWebWorkoutSessions(nextSessions);
}

async function completeWebWorkoutSession(sessionId: string) {
  const sessions = await getWebWorkoutSessions();
  const sessionIndex = sessions.findIndex((session) => session.id === sessionId);

  if (sessionIndex === -1) {
    throw new Error(`Workout session ${sessionId} was not found.`);
  }

  const now = new Date().toISOString();
  const nextSessions = [...sessions];
  const session = nextSessions[sessionIndex];
  nextSessions[sessionIndex] = {
    ...session,
    completedAt: session.completedAt ?? now,
    updatedAt: now
  };

  await saveWebWorkoutSessions(nextSessions);
  emitTrainingChange();
  return { id: sessionId, completedAt: nextSessions[sessionIndex].completedAt ?? now };
}

function toActiveWorkoutSession(session: WebWorkoutSession): ActiveWorkoutSession {
  const programPlan = parseWorkoutProgramPlan(session.programPlan);
  return {
    id: session.id,
    startedAt: session.startedAt,
    exercises: session.exercises.map((exercise) => ({ ...exercise, actualSets: getActualSets(exercise) })),
    programPlan,
    loadCoachingEnabled: session.loadCoachingEnabled ?? isPlanLoadCoachingEnabled(programPlan)
  };
}

function isWebWorkoutSession(value: unknown): value is WebWorkoutSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<WebWorkoutSession>;
  return (
    typeof session.id === "string" &&
    typeof session.startedAt === "string" &&
    (session.loadCoachingEnabled === undefined || typeof session.loadCoachingEnabled === "boolean") &&
    Array.isArray(session.exercises)
  );
}

function isValidStoredSessionExercise(value: unknown): value is StoredSessionExercise {
  if (!value || typeof value !== "object") return false;
  const exercise = value as StoredSessionExercise;
  if (typeof exercise.id !== "string" || !exercise.exercise || typeof exercise.exercise.id !== "string"
    || typeof exercise.exercise.name !== "string" || typeof exercise.savedAt !== "string") return false;
  try {
    validateWorkoutMeasurement(exercise);
    const sets = getActualSets(exercise);
    validateActualSets(sets);
    return sets.length === exercise.sets;
  } catch { return false; }
}

function decodeProgramPlan(value: string | null) {
  if (!value) return null;
  try { return parseWorkoutProgramPlan(JSON.parse(value)); } catch { return null; }
}

function getExerciseProgressKey(exerciseId: string, exerciseName: string) {
  return exerciseId.startsWith("custom-") ? `custom:${exerciseName.toLowerCase()}` : exerciseId;
}

function estimateOneRepMax(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

function mapProgressStrengthPointRow(row: ProgressStrengthPointRow): ProgressStrengthPoint {
  return {
    id: row.id,
    completedAt: row.completed_at,
    estimatedOneRepMax: row.estimated_one_rep_max,
    weight: row.weight,
    reps: row.reps,
    exerciseName: row.exercise_name
  };
}

async function getNextExerciseOrder(sessionId: string) {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ next_order: number }>(
    `SELECT COALESCE(MAX(exercise_order), -1) + 1 AS next_order
     FROM workout_exercises
     WHERE workout_session_id = ?;`,
    [sessionId]
  );

  return row?.next_order ?? 0;
}

async function insertSetEntries(input: {
  completedAt: string;
  database: Awaited<ReturnType<typeof getDatabase>>;
  setEntries: { id: string; setNumber: number }[];
  workoutExerciseId: string;
  actualSets: WorkoutSet[];
}) {
  if (input.setEntries.length === 0) {
    return;
  }

  const placeholders = input.setEntries.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const values = input.setEntries.flatMap((setEntry, index) => [
    setEntry.id,
    input.workoutExerciseId,
    setEntry.setNumber,
    input.actualSets[index].weight,
    input.actualSets[index].reps,
    input.actualSets[index].durationSeconds ?? null,
    input.actualSets[index].effort ?? null,
    input.actualSets[index].warmup ? 1 : 0,
    normalizeWorkoutSetNote(input.actualSets[index].note),
    input.completedAt,
    input.completedAt,
    input.completedAt
  ]);

  await input.database.runAsync(
    `INSERT INTO set_entries (
       id,
       workout_exercise_id,
       set_number,
       weight,
       reps,
       duration_seconds,
       effort,
       is_warmup,
       note,
       completed_at,
       created_at,
       updated_at
     )
     VALUES ${placeholders};`,
    values
  );
}

async function getWorkoutExercises(sessionId: string) {
  const database = await getDatabase();
  const rows = await database.getAllAsync<WorkoutExerciseRow>(
    `SELECT
       workout_exercises.id,
       workout_exercises.exercise_id,
       workout_exercises.custom_exercise_name,
       workout_exercises.exercise_name_snapshot,
       workout_exercises.exercise_order,
       workout_exercises.saved_at,
       workout_exercises.program_entry_id,
       workout_exercises.prescription_json,
       COUNT(set_entries.id) AS sets,
       COALESCE(MAX(set_entries.reps), 0) AS reps,
       COALESCE(MAX(set_entries.weight), 0) AS weight,
       MAX(set_entries.duration_seconds) AS duration_seconds
     FROM workout_exercises
     LEFT JOIN set_entries
       ON set_entries.workout_exercise_id = workout_exercises.id
     WHERE workout_exercises.workout_session_id = ?
     GROUP BY workout_exercises.id
     ORDER BY workout_exercises.exercise_order ASC;`,
    [sessionId]
  );

  const sets = await database.getAllAsync<{ workout_exercise_id: string; reps: number; weight: number; duration_seconds: number | null; effort: WorkoutSet["effort"]; is_warmup: number; note: string | null }>(
    `SELECT set_entries.* FROM set_entries INNER JOIN workout_exercises ON workout_exercises.id = set_entries.workout_exercise_id
     WHERE workout_exercises.workout_session_id = ? ORDER BY set_number;`, [sessionId]);
  return rows.map((row) => ({ ...mapWorkoutExerciseRow(row), actualSets: sets.filter((set) => set.workout_exercise_id === row.id).map((set) => ({
    reps: set.reps, weight: set.weight, durationSeconds: set.duration_seconds, effort: set.effort, warmup: Boolean(set.is_warmup), note: normalizeWorkoutSetNote(set.note)
  })) }));
}

function mapWorkoutExerciseRow(row: WorkoutExerciseRow): StoredSessionExercise {
  const isCustom = !row.exercise_id;
  const catalogExercise = row.exercise_id
    ? sessionExercises.find((exercise) => exercise.id === row.exercise_id)
    : undefined;

  return {
    id: row.id,
    exercise: catalogExercise ?? {
      id: row.exercise_id ?? `custom-${row.id}`,
      name: row.custom_exercise_name ?? row.exercise_name_snapshot,
      category: isCustom ? "Custom" : "Saved",
      focus: isCustom ? "Custom exercise" : "Saved exercise",
      equipment: isCustom ? "Custom" : "Saved",
      image: sessionExercises[0].image
    },
    sets: row.sets,
    reps: row.reps,
    weight: row.weight,
    durationSeconds: row.duration_seconds,
    savedAt: row.saved_at,
    programEntryId: row.program_entry_id,
    ...(row.prescription_json ? { prescription: JSON.parse(row.prescription_json) as ProgramExercise } : {})
  };
}

/** Actual work only: duration is never stored in the reps column. */
export function validateWorkoutMeasurement(input: { sets: number; reps: number; weight: number; durationSeconds?: number | null }) {
  if (!Number.isInteger(input.sets) || input.sets < 1 || input.sets > 12) throw new Error("Choose 1–12 completed sets.");
  if (!Number.isFinite(input.weight) || input.weight < 0 || input.weight > 10000) throw new Error("Enter a valid non-negative weight.");
  if (input.durationSeconds != null) {
    if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > 3600 || input.reps !== 0) throw new Error("Timed sets need 1–3600 seconds and no reps.");
  } else if (!Number.isInteger(input.reps) || input.reps < 1 || input.reps > 100) {
    throw new Error("Choose 1–100 completed reps per set.");
  }
}

export function getActualSets(entry: { actualSets?: WorkoutSet[]; sets: number; reps: number; weight: number; durationSeconds?: number | null }): WorkoutSet[] {
  const sets: WorkoutSet[] = entry.actualSets ?? Array.from({ length: entry.sets }, () => ({ reps: entry.reps, weight: entry.weight, durationSeconds: entry.durationSeconds ?? null }));
  return sets.map((set) => ({ ...set, note: normalizeWorkoutSetNote(set.note) }));
}

export function validateActualSets(sets: WorkoutSet[]) {
  if (!Array.isArray(sets) || sets.length < 1 || sets.length > 12) throw new Error("Record 1–12 sets.");
  for (const set of sets) {
    if (!set) throw new Error("Invalid set.");
    validateWorkoutMeasurement({ ...set, sets: 1 });
    if (set.effort != null && !["easy", "moderate", "hard"].includes(set.effort)) throw new Error("Choose a valid effort.");
    if (set.warmup != null && typeof set.warmup !== "boolean") throw new Error("Choose a valid set type.");
    normalizeWorkoutSetNote(set.note);
  }
  if (sets.some((set) => (set.durationSeconds != null) !== (sets[0].durationSeconds != null))) throw new Error("Use either timed sets or rep sets for one exercise entry.");
}

/** Completed performance only. Rest days and imported programs never enter this feed. */
export async function getCoachHistory(): Promise<ExerciseExposure[]> {
  const result: ExerciseExposure[] = [];
  if (Platform.OS === "web") {
    const sessions = (await getWebWorkoutSessions()).filter((session) => session.completedAt).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!)).slice(0, 120);
    for (const session of sessions) {
      for (const exercise of session.exercises) result.push({ sessionId: session.id, performedAt: exercise.savedAt,
        exerciseId: exercise.exercise.id, exerciseName: exercise.exercise.name, actualSets: getCoachSets(exercise), prescription: exercise.prescription });
    }
  } else {
    const database = await getDatabase();
    const sessions = await database.getAllAsync<{ id: string }>("SELECT id FROM workout_sessions WHERE completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 120;");
    for (const session of sessions) for (const exercise of await getWorkoutExercises(session.id)) result.push({
      sessionId: session.id, performedAt: exercise.savedAt, exerciseId: exercise.exercise.id, exerciseName: exercise.exercise.name, actualSets: getCoachSets(exercise), prescription: exercise.prescription
    });
  }
  return result;
}

/** Saved actual sets from active or completed sessions; never draft program targets or private notes. */
export async function getSavedExerciseHistory(exerciseId: string, exerciseName?: string): Promise<ExerciseExposure[]> {
  if (typeof exerciseId !== "string" || !exerciseId) return [];
  const custom = exerciseId.startsWith("custom-");
  const chosenName = typeof exerciseName === "string" ? exerciseName.trim().toLowerCase() : "";
  const matches = (id: string, name: string) => {
    if (custom !== id.startsWith("custom-")) return false;
    if (!custom) return id === exerciseId;
    const savedName = name.trim().toLowerCase();
    return chosenName && savedName ? chosenName === savedName : id === exerciseId;
  };
  let result: ExerciseExposure[];
  if (Platform.OS === "web") {
    result = (await getWebWorkoutSessions()).flatMap((session) => session.exercises.flatMap((exercise, exerciseOrder) =>
      matches(exercise.exercise.id, exercise.exercise.name) ? [{
        sessionId: session.id, performedAt: exercise.savedAt, exerciseId: exercise.exercise.id,
        exerciseName: exercise.exercise.name, exerciseOrder, actualSets: getCoachSets(exercise), prescription: exercise.prescription
      }] : []));
  } else {
    const database = await getDatabase();
    type SavedWeightRow = {
      id: string; session_id: string; exercise_id: string | null; custom_exercise_name: string | null;
      exercise_name_snapshot: string; exercise_order: number; saved_at: string; prescription_json: string | null;
      set_number: number; reps: number; weight: number; duration_seconds: number | null;
      effort: WorkoutSet["effort"]; is_warmup: number;
    };
    // Select this catalog ID only. Custom names are matched in JavaScript so
    // Unicode case folding agrees with web instead of SQLite's ASCII lower().
    const rows = await database.getAllAsync<SavedWeightRow>(
      `SELECT workout_exercises.id, workout_exercises.workout_session_id AS session_id,
         workout_exercises.exercise_id, workout_exercises.custom_exercise_name,
         workout_exercises.exercise_name_snapshot, workout_exercises.exercise_order,
         workout_exercises.saved_at, workout_exercises.prescription_json,
         set_entries.set_number, set_entries.reps, set_entries.weight,
         set_entries.duration_seconds, set_entries.effort, set_entries.is_warmup
       FROM workout_exercises
       INNER JOIN workout_sessions ON workout_sessions.id = workout_exercises.workout_session_id
       INNER JOIN set_entries ON set_entries.workout_exercise_id = workout_exercises.id
       WHERE ${custom ? "workout_exercises.exercise_id IS NULL" : "workout_exercises.exercise_id = ?"}
       ORDER BY workout_exercises.saved_at DESC, workout_exercises.workout_session_id ASC,
         workout_exercises.exercise_order DESC, workout_exercises.id ASC, set_entries.set_number ASC;`,
      custom ? [] : [exerciseId]
    );
    const entries = new Map<string, ExerciseExposure>();
    for (const row of rows) {
      const id = row.exercise_id ?? `custom-${row.id}`;
      const name = row.custom_exercise_name ?? row.exercise_name_snapshot;
      if (!matches(id, name)) continue;
      let entry = entries.get(row.id);
      if (!entry) {
        entry = {
          sessionId: row.session_id, performedAt: row.saved_at, exerciseId: id, exerciseName: name,
          exerciseOrder: row.exercise_order, actualSets: [],
          ...(row.prescription_json ? { prescription: JSON.parse(row.prescription_json) as ProgramExercise } : {})
        };
        entries.set(row.id, entry);
      }
      entry.actualSets.push({ reps: row.reps, weight: row.weight, durationSeconds: row.duration_seconds,
        effort: row.effort, warmup: Boolean(row.is_warmup) });
    }
    result = [...entries.values()];
  }
  return result.sort((a, b) => {
    const savedOrder = Date.parse(b.performedAt) - Date.parse(a.performedAt);
    if (Number.isFinite(savedOrder) && savedOrder !== 0) return savedOrder;
    return a.sessionId === b.sessionId ? (b.exerciseOrder ?? -1) - (a.exerciseOrder ?? -1) : a.sessionId.localeCompare(b.sessionId);
  });
}

function getCoachSets(exercise: StoredSessionExercise): WorkoutSet[] {
  return getActualSets(exercise).map(({ note: _privateNote, ...performance }) => performance);
}
