import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

// Exercise the actual repositories against in-memory AsyncStorage and real SQLite.
// Nothing in these tests accesses a device database, a real account, or the network.
const state = { platform: { OS: "web" }, values: new Map(), sql: null, nextId: 0 };
state.storage = { async getItem(key) { return state.values.get(key) ?? null; }, async setItem(key, value) { state.values.set(key, value); }, async multiRemove(keys) { for (const key of keys) state.values.delete(key); } };
state.database = {
  async getAllAsync(sql, params = []) { return state.sql.prepare(sql).all(...params); },
  async getFirstAsync(sql, params = []) { return state.sql.prepare(sql).get(...params) ?? null; },
  async runAsync(sql, params = []) { return state.sql.prepare(sql).run(...params); },
  async withTransactionAsync(callback) { state.sql.exec("BEGIN"); try { await callback(); state.sql.exec("COMMIT"); } catch (error) { state.sql.exec("ROLLBACK"); throw error; } }
};
globalThis.__orcaStorageTest = state;
const modules = {
  "react-native": "export const Platform = globalThis.__orcaStorageTest.platform;",
  "@react-native-async-storage/async-storage": "export default globalThis.__orcaStorageTest.storage;",
  "./database": "export const getDatabase = async () => globalThis.__orcaStorageTest.database; export const compactLocalDatabase = async () => {}; export const createLocalId = (prefix) => prefix + '-' + (++globalThis.__orcaStorageTest.nextId);",
  "./profilesRepository": "export const getCachedCurrentUserProfile = () => null; export const warmCurrentUserProfileCache = () => {};",
  "../features/workouts/repdbSessionExercises": "export const sessionExercises = [{ id: 'bench-press', name: 'Barbell Bench Press', image: 1 }, { id: 'db-bench-press', name: 'Dumbbell Bench Press', image: 2 }];"
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "./trainingMutationQueue") return nextResolve(new URL("../src/storage/trainingMutationQueue.ts", import.meta.url).href, context);
  if (specifier === "../features/programs/programRestart") return nextResolve(new URL("../src/features/programs/programRestart.ts", import.meta.url).href, context);
  if (specifier === "./programModel" && context.parentURL?.endsWith("/programRestart.ts")) return nextResolve(new URL("../src/features/programs/programModel.ts", import.meta.url).href, context);
  if (specifier === "./trainingStorage") return nextResolve(new URL("../src/storage/trainingStorage.ts", import.meta.url).href, context);
  if (specifier === "./trainingChanges") return nextResolve(new URL("../src/storage/trainingChanges.ts", import.meta.url).href, context);
  if (specifier === "./programsRepository") return nextResolve(new URL("../src/storage/programsRepository.ts", import.meta.url).href, context);
  if (specifier === "../features/programs/programModel") return nextResolve(new URL("../src/features/programs/programModel.ts", import.meta.url).href, context);
  if (/\/(programsRepository|workoutsRepository|streaksRepository|trainingStorage)\.ts$/.test(context.parentURL ?? "") && modules[specifier]) {
    return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(modules[specifier])}` };
  }
  return nextResolve(specifier, context);
} });
const workouts = await import("../src/storage/workoutsRepository.ts");
const streaks = await import("../src/storage/streaksRepository.ts");
const schemaSource = readFileSync(new URL("../src/storage/database.ts", import.meta.url), "utf8");
const schema = schemaSource.match(/async function ensureCoreTables[\s\S]*?execAsync\(`([\s\S]*?)`\);/)[1];
const exercise = (id, name) => ({ id, name, category: "Chest", focus: "Chest", equipment: "Barbell", image: 1 });

function initializeStorage(platform, t) {
  state.platform.OS = platform;
  state.values.clear();
  state.values.set("orca9.trainingSchemaVersion", "6");
  state.sql = new DatabaseSync(":memory:");
  state.sql.exec("PRAGMA foreign_keys = ON;");
  state.sql.exec(schema);
  t.after(() => state.sql.close());
}

const recordedExercise = (id, name, actualSets) => ({ exercise: exercise(id, name), actualSets });
const recordedSession = (id, completedAt, exercises) => ({ id, completedAt, exercises });

// Seed historical snapshots in each real storage format, including independently saved sets.
function seedSessions(sessions) {
  const savedSessions = sessions.map((session) => ({
    ...session,
    startedAt: session.completedAt ?? "2026-09-01T12:00:00.000Z",
    updatedAt: session.completedAt ?? "2026-09-01T12:00:00.000Z",
    exercises: session.exercises.map((entry, index) => ({
      ...entry, id: `${session.id}-exercise-${index}`,
      sets: entry.actualSets.length, reps: entry.actualSets[0].reps,
      weight: entry.actualSets[0].weight, durationSeconds: entry.actualSets[0].durationSeconds ?? null,
      savedAt: session.completedAt ?? "2026-09-01T12:00:00.000Z"
    }))
  }));
  if (state.platform.OS === "web") {
    state.values.set("orca9.workoutSessions", JSON.stringify(savedSessions));
    return;
  }
  const insertSession = state.sql.prepare("INSERT INTO workout_sessions (id, started_at, completed_at, created_at, updated_at, notes) VALUES (?, ?, ?, ?, ?, ?);");
  const insertExercise = state.sql.prepare("INSERT INTO workout_exercises (id, workout_session_id, exercise_id, custom_exercise_name, exercise_name_snapshot, exercise_order, saved_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);");
  const insertSet = state.sql.prepare("INSERT INTO set_entries (id, workout_exercise_id, set_number, weight, reps, duration_seconds, is_warmup, note, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);");
  for (const session of savedSessions) {
    insertSession.run(session.id, session.startedAt, session.completedAt, session.startedAt, session.updatedAt, "Private session note");
    for (const [index, entry] of session.exercises.entries()) {
      const custom = entry.exercise.id.startsWith("custom-");
      insertExercise.run(entry.id, session.id, custom ? null : entry.exercise.id, custom ? entry.exercise.name : null,
        entry.exercise.name, index, entry.savedAt, entry.savedAt, entry.savedAt);
      for (const [setIndex, set] of entry.actualSets.entries()) {
        insertSet.run(`${entry.id}-set-${setIndex}`, entry.id, setIndex + 1, set.weight, set.reps,
          set.durationSeconds ?? null, set.warmup ? 1 : 0, set.note ?? null, entry.savedAt, entry.savedAt, entry.savedAt);
      }
    }
  }
}

function historySnapshot() {
  if (state.platform.OS === "web") return state.values.get("orca9.workoutSessions");
  return JSON.stringify(["workout_sessions", "workout_exercises", "set_entries"].map((table) => state.sql.prepare(`SELECT * FROM ${table} ORDER BY id;`).all()));
}

for (const platform of ["web", "ios"]) {
  test(`${platform}: restored charts read completed sessions, filter lifts, and preserve history and streaks`, async (t) => {
    state.platform.OS = platform;
    state.values.clear();
    state.sql = new DatabaseSync(":memory:");
    state.sql.exec("PRAGMA foreign_keys = ON;");
    state.sql.exec(schema);
    t.after(() => state.sql.close());
    assert.deepEqual(await workouts.getProgressStrengthSeries(), []);
    assert.deepEqual(await workouts.getProgressAverageWeightSeries(), []);
    assert.deepEqual(await workouts.getProgressVolumeSeries(), []);
    await streaks.markTodayAsRestDay();
    assert.equal((await streaks.getStreakSummary()).todayStatus, "rest");
    assert.equal((await streaks.getStreakSummary()).currentActiveDays, 0);
    assert.equal((await streaks.getStreakSummary()).currentRestDays, 1);
    const session = await workouts.createWorkoutSession();
    await workouts.addExerciseToWorkoutSession({ sessionId: session.id, exercise: exercise("bench-press", "Barbell Bench Press"), sets: 2, reps: 10, weight: 100 });
    await workouts.addExerciseToWorkoutSession({ sessionId: session.id, exercise: exercise("custom-1", "Test Lift"), sets: 1, reps: 5, weight: 200 });
    assert.deepEqual(await workouts.getProgressStrengthSeries(), [], "unfinished sessions are not charted");
    await workouts.completeWorkoutSession(session.id);
    const [volume] = await workouts.getProgressVolumeSeries();
    const [average] = await workouts.getProgressAverageWeightSeries();
    const [strength] = await workouts.getProgressStrengthSeries();
    assert.equal(volume.volume, 3000);
    assert.equal(average.averageWeight, 120);
    assert.equal(average.totalReps, 25);
    assert.equal(strength.exerciseName, "Test Lift");
    assert.ok(Math.abs(strength.estimatedOneRepMax - 200 * (1 + 5 / 30)) < 0.001);
    assert.equal((await workouts.getProgressVolumeSeries({ liftKey: "bench-press" }))[0].volume, 2000);
    assert.equal((await workouts.getProgressAverageWeightSeries({ liftKey: "bench-press" }))[0].averageWeight, 100);
    assert.equal((await workouts.getProgressStrengthSeries({ liftKey: "custom:test lift" }))[0].weight, 200);
    assert.deepEqual(await workouts.getProgressStrengthSeries({ liftKey: "missing" }), []);
    assert.ok((await workouts.getProgressLiftOptions()).some((item) => item.key === "custom:test lift"));
    const [history] = await workouts.getCompletedWorkoutSessions();
    assert.equal(history.totalVolume, 3000);
    assert.equal(history.exerciseCount, 2);
    assert.equal((await streaks.getStreakSummary()).currentStreak, 1);
    assert.equal((await streaks.getStreakSummary()).todayStatus, "workout");
    assert.equal((await streaks.getStreakSummary()).currentActiveDays, 1);
    assert.equal((await streaks.getStreakSummary()).currentRestDays, 0, "a workout overrides same-day rest in the breakdown");
    assert.equal(await workouts.getActiveWorkoutSession(), null);
  });
}

for (const platform of ["web", "ios"]) {
  test(`${platform}: actual weight PRs include any rep count and warm-ups while excluding timed and unfinished work`, async (t) => {
    initializeStorage(platform, t);
    assert.deepEqual(await workouts.getProgressPersonalRecordSeries(), []);
    seedSessions([
      recordedSession("working", "2026-09-01T12:00:00.000Z", [
        recordedExercise("bench-press", "Barbell Bench Press", [
          { reps: 1, weight: 135, note: "Exact single and private note" },
          { reps: 8, weight: 160 }, { reps: 20, weight: 150 }
        ]),
        recordedExercise("custom-other", "Other lift", [{ reps: 1, weight: 100 }]),
        recordedExercise("custom-timed", "Timed lift", [{ reps: 0, weight: 500, durationSeconds: 30 }])
      ]),
      recordedSession("multi-only", "2026-09-02T12:00:00.000Z", [recordedExercise("bench-press", "Barbell Bench Press", [{ reps: 5, weight: 400 }])]),
      recordedSession("warmup-only", "2026-09-03T12:00:00.000Z", [recordedExercise("bench-press", "Barbell Bench Press", [{ reps: 10, weight: 450, warmup: true }])]),
      recordedSession("timed-only", "2026-09-04T12:00:00.000Z", [recordedExercise("custom-timed", "Timed lift", [{ reps: 0, weight: 500, durationSeconds: 30 }])]),
      recordedSession("empty", "2026-09-05T12:00:00.000Z", []),
      recordedSession("decimal", "2026-09-06T12:00:00.000Z", [recordedExercise("bench-press", "Barbell Bench Press", [{ reps: 7, weight: 135.25 }])]),
      recordedSession("zero", "2026-09-07T12:00:00.000Z", [recordedExercise("custom-zero", "Zero lift", [{ reps: 4, weight: 0 }])]),
      recordedSession("active", null, [recordedExercise("bench-press", "Barbell Bench Press", [{ reps: 1, weight: 999 }])])
    ]);
    const snapshot = historySnapshot();
    const strengthBefore = await workouts.getProgressStrengthSeries();
    const averageBefore = await workouts.getProgressAverageWeightSeries();
    const volumeBefore = await workouts.getProgressVolumeSeries();
    assert.deepEqual(await workouts.getProgressPersonalRecordSeries(), [
      { id: "working", completedAt: "2026-09-01T12:00:00.000Z", weight: 160, reps: 8, exerciseName: "Barbell Bench Press" },
      { id: "multi-only", completedAt: "2026-09-02T12:00:00.000Z", weight: 400, reps: 5, exerciseName: "Barbell Bench Press" },
      { id: "warmup-only", completedAt: "2026-09-03T12:00:00.000Z", weight: 450, reps: 10, exerciseName: "Barbell Bench Press" },
      { id: "decimal", completedAt: "2026-09-06T12:00:00.000Z", weight: 135.25, reps: 7, exerciseName: "Barbell Bench Press" },
      { id: "zero", completedAt: "2026-09-07T12:00:00.000Z", weight: 0, reps: 4, exerciseName: "Zero lift" }
    ]);
    assert.equal((await workouts.getProgressPersonalRecordSeries({ liftKey: "bench-press" }))[0].weight, 160,
      "a heavier eight-rep set beats a lighter single without estimating another weight");
    const estimate = strengthBefore.find((point) => point.id === "working");
    assert.equal(estimate.weight, 150, "the separate estimate API retains its original ranking");
    assert.ok(Math.abs(estimate.estimatedOneRepMax - 250) < 0.001, "the actual record does not use this estimated value");
    assert.deepEqual(await workouts.getProgressPersonalRecordSeries({ liftKey: "custom:timed lift" }), []);
    assert.deepEqual(await workouts.getProgressPersonalRecordSeries({ liftKey: "missing" }), []);
    assert.deepEqual(await workouts.getProgressStrengthSeries(), strengthBefore);
    assert.deepEqual(await workouts.getProgressAverageWeightSeries(), averageBefore);
    assert.deepEqual(await workouts.getProgressVolumeSeries(), volumeBefore);
    assert.equal(historySnapshot(), snapshot, "chart reads never rewrite actual sets or private notes");
  });

  test(`${platform}: actual weight PR filtering keeps catalog IDs and named custom lifts distinct`, async (t) => {
    initializeStorage(platform, t);
    seedSessions([
      recordedSession("first", "2026-09-01T12:00:00.000Z", [
        recordedExercise("bench-press", "Barbell Bench Press", [{ reps: 3, weight: 135 }]),
        recordedExercise("db-bench-press", "Dumbbell Bench Press", [{ reps: 8, weight: 70 }]),
        recordedExercise("custom-bench", "Barbell Bench Press", [{ reps: 2, weight: 175 }]),
        recordedExercise("custom-elite-1", "Élite Press", [{ reps: 5, weight: 200 }]),
        recordedExercise("custom-test-1", "Test Lift", [{ reps: 10, weight: 160 }])
      ]),
      recordedSession("second", "2026-09-02T12:00:00.000Z", [
        recordedExercise("custom-elite-2", "élite press", [{ reps: 2, weight: 220 }]),
        recordedExercise("custom-test-2", "TEST LIFT", [{ reps: 4, weight: 165 }])
      ])
    ]);
    assert.deepEqual((await workouts.getProgressPersonalRecordSeries()).map((point) => point.weight), [200, 220]);
    assert.deepEqual((await workouts.getProgressPersonalRecordSeries({ liftKey: "bench-press" })).map((point) => point.weight), [135]);
    assert.deepEqual((await workouts.getProgressPersonalRecordSeries({ liftKey: "db-bench-press" })).map((point) => point.weight), [70]);
    assert.deepEqual((await workouts.getProgressPersonalRecordSeries({ liftKey: "custom:barbell bench press" })).map((point) => point.weight), [175]);
    assert.deepEqual((await workouts.getProgressPersonalRecordSeries({ liftKey: "custom:test lift" })).map((point) => point.weight), [160, 165]);
    assert.deepEqual((await workouts.getProgressPersonalRecordSeries({ liftKey: "custom:élite press" })).map((point) => point.weight), [200, 220]);
    const pickerOptions = (await workouts.getProgressLiftOptions()).filter((option) => option.name.toLowerCase() === "élite press");
    assert.ok(pickerOptions.length > 0);
    for (const option of pickerOptions) {
      assert.deepEqual((await workouts.getProgressPersonalRecordSeries({ liftKey: option.key })).map((point) => point.weight), [200, 220],
        "the existing native picker key remains usable for Unicode custom lift names");
    }
  });

  test(`${platform}: actual weight PR ties use saved exercise order and stable session IDs`, async (t) => {
    initializeStorage(platform, t);
    const completedAt = "2026-09-01T12:00:00.000Z";
    seedSessions([
      recordedSession("session-z", completedAt, [
        recordedExercise("custom-first", "First lift", [{ reps: 3, weight: 140 }, { reps: 8, weight: 140 }]),
        recordedExercise("custom-second", "Second lift", [{ reps: 10, weight: 140 }])
      ]),
      recordedSession("session-a", completedAt, [recordedExercise("bench-press", "Barbell Bench Press", [{ reps: 1, weight: 135 }])])
    ]);
    assert.deepEqual(await workouts.getProgressPersonalRecordSeries(), [
      { id: "session-a", completedAt, weight: 135, reps: 1, exerciseName: "Barbell Bench Press" },
      { id: "session-z", completedAt, weight: 140, reps: 3, exerciseName: "First lift" }
    ]);
    assert.deepEqual(await workouts.getProgressPersonalRecordSeries(), await workouts.getProgressPersonalRecordSeries(), "repeat reads keep ties stable");
  });

  test(`${platform}: actual weight PR history retains a record before more than 160 newer workouts`, async (t) => {
    initializeStorage(platform, t);
    const oldest = recordedSession("old-record", "2024-01-01T12:00:00.000Z", [recordedExercise("bench-press", "Barbell Bench Press", [{ reps: 8, weight: 405.25 }])]);
    const later = Array.from({ length: 165 }, (_, index) => recordedSession(`later-${index}`, new Date(Date.UTC(2025, 0, index + 1, 12)).toISOString(), [
      recordedExercise("bench-press", "Barbell Bench Press", [{ reps: 5, weight: 135 + index / 4 }])
    ]));
    seedSessions([...later.reverse(), oldest]);
    const snapshot = historySnapshot();
    const points = await workouts.getProgressPersonalRecordSeries({ liftKey: "bench-press" });
    assert.equal(points.length, 166);
    assert.equal(points[0].id, "old-record");
    assert.equal(points[0].weight, 405.25);
    assert.equal(points[0].reps, 8);
    assert.equal(Math.max(...points.map((point) => point.weight)), 405.25);
    assert.ok(points.every((point, index) => index === 0 || point.completedAt >= points[index - 1].completedAt));
    assert.equal(historySnapshot(), snapshot);
  });
}

test("rest days bridge workouts, today may stay open, and genuinely missed days break a streak", () => {
  const today = new Date(2026, 8, 6, 12);
  assert.equal(streaks.calculateStreakSummary(["2026-09-03", "2026-09-05"], ["2026-09-04"], today).currentStreak, 3);
  assert.equal(streaks.calculateStreakSummary(["2026-09-03"], ["2026-09-04"], today).currentStreak, 0);
  assert.equal(streaks.calculateStreakSummary(["2026-09-06"], ["2026-09-06"], today).currentStreak, 1);
});

test("streak breakdown counts distinct active and rest days only within the current streak", () => {
  const today = new Date(2026, 8, 6, 12);
  const cases = [
    { workouts: [], rest: [], expected: [0, 0, 0] },
    { workouts: ["2026-09-03", "2026-09-05"], rest: ["2026-09-04"], expected: [3, 2, 1] },
    { workouts: ["2026-09-03", "2026-09-05"], rest: ["2026-09-04", "2026-09-06"], expected: [4, 2, 2] },
    { workouts: ["2026-09-06", "2026-09-06"], rest: ["2026-09-06", "2026-09-06"], expected: [1, 1, 0] },
    { workouts: ["2026-09-01", "2026-09-02", "2026-09-03"], rest: ["2026-09-06"], expected: [1, 0, 1] },
    { workouts: ["2026-09-03"], rest: ["2026-09-04"], expected: [0, 0, 0] },
    { workouts: [], rest: ["2026-09-05", "2026-09-06", "2026-09-07", "bad-date"], expected: [2, 0, 2] },
    { workouts: ["2026-09-06", "2026-09-07", "2026-02-30"], rest: [], expected: [1, 1, 0] }
  ];
  for (const { workouts, rest, expected } of cases) {
    const summary = streaks.calculateStreakSummary(workouts, rest, today);
    assert.deepEqual([summary.currentStreak, summary.currentActiveDays, summary.currentRestDays], expected);
    assert.equal(summary.currentActiveDays + summary.currentRestDays, summary.currentStreak);
  }
});
