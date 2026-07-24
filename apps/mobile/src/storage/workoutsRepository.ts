import { SessionExercise, sessionExercises } from "../features/workouts/repdbSessionExercises";
import { compactLocalDatabase, createLocalId, getDatabase } from "./database";
import { getCurrentUserProfile } from "./profilesRepository";

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

type WorkoutSessionRow = {
  id: string;
  started_at: string;
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

export async function createWorkoutSession() {
  const database = await getDatabase();
  const profile = await getCurrentUserProfile().catch(() => null);
  const now = new Date().toISOString();
  const id = createLocalId("session");

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
  const database = await getDatabase();
  const now = new Date().toISOString();
  const workoutExerciseId = createLocalId("workout-exercise");
  const nextOrder = await getNextExerciseOrder(input.sessionId);
  const isCustomExercise = input.exercise.id.startsWith("custom-");

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

    for (let setNumber = 1; setNumber <= input.sets; setNumber += 1) {
      await database.runAsync(
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [createLocalId("set"), workoutExerciseId, setNumber, input.weight, input.reps, now, now, now]
      );
    }

    await database.runAsync("UPDATE workout_sessions SET updated_at = ? WHERE id = ?;", [now, input.sessionId]);
  });

  const exercises = await getWorkoutExercises(input.sessionId);
  return exercises.find((exercise) => exercise.id === workoutExerciseId) ?? null;
}

export async function deleteWorkoutExercise(workoutExerciseId: string) {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM workout_exercises WHERE id = ?;", [workoutExerciseId]);
  await compactLocalDatabase();
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
