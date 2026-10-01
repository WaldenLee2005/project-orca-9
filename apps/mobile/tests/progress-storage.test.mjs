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
