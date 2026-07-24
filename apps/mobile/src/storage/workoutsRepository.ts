import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { SessionExercise, sessionExercises } from "../features/workouts/repdbSessionExercises";
import { compactLocalDatabase, createLocalId, getDatabase } from "./database";
import { getCachedCurrentUserProfile, warmCurrentUserProfileCache } from "./profilesRepository";

export type StoredSessionExercise = {
  id: string;
  exercise: SessionExercise;
  sets: number;
  reps: number;
  weight: number;
  savedAt: string;
};

export type ActiveWorkoutSession = {
  id: string;
  startedAt: string;
  exercises: StoredSessionExercise[];
};

export type CompletedWorkoutSession = {
  id: string;
  startedAt: string;
  completedAt: string;
  exercises: StoredSessionExercise[];
  exerciseCount: number;
  totalSets: number;
};

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
};

type CompletedWorkoutSessionRow = {
  id: string;
  started_at: string;
  completed_at: string;
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
  sets: number;
  reps: number;
  weight: number;
};

export async function getActiveWorkoutSession() {
  if (Platform.OS === "web") {
    return getActiveWebWorkoutSession();
  }

  const database = await getDatabase();
  const session = await database.getFirstAsync<WorkoutSessionRow>(
    `SELECT id, started_at
     FROM workout_sessions
     WHERE completed_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1;`
  );

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    startedAt: session.started_at,
    exercises: await getWorkoutExercises(session.id)
  };
}

export async function getCompletedWorkoutSessions(limit = 8) {
  if (Platform.OS === "web") {
    return getCompletedWebWorkoutSessions(limit);
  }

  const database = await getDatabase();
  const rows = await database.getAllAsync<CompletedWorkoutSessionRow>(
    `SELECT
       id,
       started_at,
       completed_at
     FROM workout_sessions
     WHERE completed_at IS NOT NULL
     ORDER BY completed_at DESC
     LIMIT ?;`,
    [limit]
  );

  return Promise.all(
    rows.map(async (row) => {
      const exercises = await getWorkoutExercises(row.id);

      return {
        id: row.id,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        exercises,
        exerciseCount: exercises.length,
        totalSets: exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
      };
    })
  );
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
         WHERE workout_sessions.completed_at IS NOT NULL
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
         WHERE workout_sessions.completed_at IS NOT NULL
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
           WHERE workout_sessions.completed_at IS NOT NULL
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
           WHERE workout_sessions.completed_at IS NOT NULL
         ) ranked_sets
         WHERE ranked_sets.strength_rank = 1
         ORDER BY ranked_sets.completed_at DESC
         LIMIT ?;`,
        [limit]
      );

  return rows.reverse().map(mapProgressStrengthPointRow);
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
     WHERE workout_sessions.completed_at IS NOT NULL
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
         WHERE workout_sessions.completed_at IS NOT NULL
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
         WHERE workout_sessions.completed_at IS NOT NULL
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

export async function createWorkoutSession() {
  if (Platform.OS === "web") {
    return createWebWorkoutSession();
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
       created_at,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?);`,
    [id, profile?.id ?? null, now, now, now]
  );

  return { id, startedAt: now, exercises: [] };
}

export async function addExerciseToWorkoutSession(input: {
  sessionId: string;
  exercise: SessionExercise;
  sets: number;
  reps: number;
  weight: number;
}) {
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
         saved_at,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        workoutExerciseId,
        input.sessionId,
        isCustomExercise ? null : input.exercise.id,
        isCustomExercise ? input.exercise.name : null,
        input.exercise.name,
        nextOrder,
        now,
        now,
        now
      ]
    );

    await insertSetEntries({
      completedAt: now,
      database,
      reps: input.reps,
      setEntries,
      weight: input.weight,
      workoutExerciseId
    });

    await database.runAsync("UPDATE workout_sessions SET updated_at = ? WHERE id = ?;", [now, input.sessionId]);
  });

  return {
    id: workoutExerciseId,
    exercise: input.exercise,
    sets: input.sets,
    reps: input.reps,
    weight: input.weight,
    savedAt: now
  };
}

export async function deleteWorkoutExercise(workoutExerciseId: string) {
  if (Platform.OS === "web") {
    await deleteWebWorkoutExercise(workoutExerciseId);
    return;
  }

  const database = await getDatabase();
  await database.runAsync("DELETE FROM workout_exercises WHERE id = ?;", [workoutExerciseId]);
  await compactLocalDatabase();
}

export async function completeWorkoutSession(sessionId: string) {
  if (Platform.OS === "web") {
    return completeWebWorkoutSession(sessionId);
  }

  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `UPDATE workout_sessions
     SET completed_at = COALESCE(completed_at, ?),
         updated_at = ?
     WHERE id = ?;`,
    [now, now, sessionId]
  );

  return { id: sessionId, completedAt: now };
}


async function getWebWorkoutSessions() {
  const storedSessions = await AsyncStorage.getItem(WEB_WORKOUT_SESSIONS_KEY);

  if (!storedSessions) {
    return [];
  }

  try {
    const parsed = JSON.parse(storedSessions);
    return Array.isArray(parsed) ? parsed.filter(isWebWorkoutSession) : [];
  } catch {
    return [];
  }
}

async function saveWebWorkoutSessions(sessions: WebWorkoutSession[]) {
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
    .map((session) => ({
      id: session.id,
      startedAt: session.startedAt,
      completedAt: session.completedAt ?? session.updatedAt,
      exercises: session.exercises,
      exerciseCount: session.exercises.length,
      totalSets: session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
    }));
}

async function getWebProgressLiftOptions() {
  const sessions = await getWebWorkoutSessions();
  const liftOptions = new Map<string, { name: string; latestCompletedAt: string }>();

  sessions
    .filter((session) => Boolean(session.completedAt))
    .forEach((session) => {
      session.exercises.forEach((exercise) => {
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
        .filter((exercise) => !input.liftKey || getExerciseProgressKey(exercise.exercise.id, exercise.exercise.name) === input.liftKey)
        .reduce((sum, exercise) => sum + exercise.sets * exercise.reps * exercise.weight, 0)
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
        (exercise) => !input.liftKey || getExerciseProgressKey(exercise.exercise.id, exercise.exercise.name) === input.liftKey
      );
      const totalVolume = matchingExercises.reduce(
        (sum, exercise) => sum + exercise.sets * exercise.reps * exercise.weight,
        0
      );
      const totalReps = matchingExercises.reduce((sum, exercise) => sum + exercise.sets * exercise.reps, 0);

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
        .filter((exercise) => !input.liftKey || getExerciseProgressKey(exercise.exercise.id, exercise.exercise.name) === input.liftKey)
        .map((exercise) => ({
          exerciseName: exercise.exercise.name,
          estimatedOneRepMax: estimateOneRepMax(exercise.weight, exercise.reps),
          reps: exercise.reps,
          weight: exercise.weight
        }))
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

async function createWebWorkoutSession() {
  const sessions = await getWebWorkoutSessions();
  const now = new Date().toISOString();
  const session = {
    id: createLocalId("session"),
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    exercises: []
  };

  await saveWebWorkoutSessions([session, ...sessions]);
  return toActiveWorkoutSession(session);
}

async function addExerciseToWebWorkoutSession(input: {
  sessionId: string;
  exercise: SessionExercise;
  sets: number;
  reps: number;
  weight: number;
}) {
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
    savedAt: now
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
  return { id: sessionId, completedAt: nextSessions[sessionIndex].completedAt ?? now };
}

function toActiveWorkoutSession(session: WebWorkoutSession): ActiveWorkoutSession {
  return {
    id: session.id,
    startedAt: session.startedAt,
    exercises: session.exercises
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
    Array.isArray(session.exercises)
  );
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
  reps: number;
  setEntries: { id: string; setNumber: number }[];
  weight: number;
  workoutExerciseId: string;
}) {
  if (input.setEntries.length === 0) {
    return;
  }

  const placeholders = input.setEntries.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const values = input.setEntries.flatMap((setEntry) => [
    setEntry.id,
    input.workoutExerciseId,
    setEntry.setNumber,
    input.weight,
    input.reps,
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
       COUNT(set_entries.id) AS sets,
       COALESCE(MAX(set_entries.reps), 0) AS reps,
       COALESCE(MAX(set_entries.weight), 0) AS weight
     FROM workout_exercises
     LEFT JOIN set_entries
       ON set_entries.workout_exercise_id = workout_exercises.id
     WHERE workout_exercises.workout_session_id = ?
     GROUP BY workout_exercises.id
     ORDER BY workout_exercises.exercise_order ASC;`,
    [sessionId]
  );

  return rows.map(mapWorkoutExerciseRow);
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
    savedAt: row.saved_at
  };
}
