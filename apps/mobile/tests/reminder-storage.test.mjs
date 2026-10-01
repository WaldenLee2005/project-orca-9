import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

const state = { platform: { OS: "web" }, values: new Map(), sql: null, nextId: 0, failRead: false, failWrite: false, writes: 0 };
state.storage = {
  async getItem(key) { if (state.failRead) throw new Error("Storage unavailable"); return state.values.get(key) ?? null; },
  async setItem(key, value) { if (state.failWrite) throw new Error("Disk full"); state.writes++; state.values.set(key, value); },
  async multiRemove() { throw new Error("Reminder tests must never reset existing training data"); }
};
state.database = {
  async getAllAsync(sql, params = []) { if (state.failRead) throw new Error("Storage unavailable"); return state.sql.prepare(sql).all(...params); },
  async getFirstAsync(sql, params = []) { if (state.failRead) throw new Error("Storage unavailable"); return state.sql.prepare(sql).get(...params) ?? null; },
  async runAsync(sql, params = []) { if (state.failWrite) throw new Error("Disk full"); state.writes++; return state.sql.prepare(sql).run(...params); }
};
globalThis.__orcaReminderStorageTest = state;
const modules = {
  "react-native": "export const Platform = globalThis.__orcaReminderStorageTest.platform;",
  "@react-native-async-storage/async-storage": "export default globalThis.__orcaReminderStorageTest.storage;",
  "./database": "export const getDatabase = async () => globalThis.__orcaReminderStorageTest.database; export const compactLocalDatabase = async () => {}; export const createLocalId = (prefix) => prefix + '-' + (++globalThis.__orcaReminderStorageTest.nextId);",
  "./profilesRepository": "export const getCachedCurrentUserProfile = () => null; export const warmCurrentUserProfileCache = () => {};",
  "../features/workouts/repdbSessionExercises": "export const sessionExercises = [];"
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (["./trainingStorage", "./trainingChanges", "./programsRepository"].includes(specifier)) return nextResolve(new URL(`../src/storage/${specifier.slice(2)}.ts`, import.meta.url).href, context);
  if (specifier === "../features/programs/programModel") return nextResolve(new URL("../src/features/programs/programModel.ts", import.meta.url).href, context);
  if (/\/(programsRepository|workoutsRepository|streaksRepository|reminderRepository|trainingStorage)\.ts$/.test(context.parentURL ?? "") && modules[specifier]) {
    return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(modules[specifier])}` };
  }
  return nextResolve(specifier, context);
} });
const { getReminderHistory } = await import("../src/storage/reminderRepository.ts");
const { subscribeToTrainingChanges, emitTrainingChange } = await import("../src/storage/trainingChanges.ts");
const programs = await import("../src/storage/programsRepository.ts");
const workouts = await import("../src/storage/workoutsRepository.ts");
const streaks = await import("../src/storage/streaksRepository.ts");
const schemaSource = readFileSync(new URL("../src/storage/database.ts", import.meta.url), "utf8");
const schema = schemaSource.match(/async function ensureCoreTables[\s\S]*?execAsync\(`([\s\S]*?)`\);/)[1];
const timestamps = ["2026-09-29T23:30:00.000Z", "2026-09-30T02:15:00.000Z"];
const programDraft = () => ({
  name: "Alternate training and rest", schedule: { mode: "cycle", startDate: "2026-09-01" },
  days: [
    { id: "training", name: "Lift", kind: "training", exercises: [{ id: "bench", exerciseId: "bench", exerciseName: "Bench Press", sets: 3, target: { kind: "reps", reps: 8 } }] },
    { id: "rest", name: "Recovery", kind: "rest", exercises: [] }
  ]
});
const scheduleHistory = [{ effectiveFrom: "2026-09-01", programId: "program", schedule: programDraft().schedule, dayKinds: ["training", "rest"] }];

function setup(t, platform) {
  state.platform.OS = platform; state.values.clear(); state.failRead = false; state.failWrite = false; state.writes = 0;
  state.values.set("orca9.trainingSchemaVersion", "6");
  state.values.set("sb-test-auth-token", "untouched auth");
  state.sql = new DatabaseSync(":memory:"); state.sql.exec(schema);
  t.after(() => state.sql.close());
}

function seedHistory() {
  const sessions = [...timestamps, null].map((completedAt, index) => ({ id: `session-${index}`, startedAt: "2026-09-29T22:00:00.000Z", completedAt, updatedAt: completedAt ?? timestamps[0], exercises: [] }));
  const library = { version: 3, programs: [{ ...programDraft(), id: "program", createdAt: timestamps[0], updatedAt: timestamps[0] }], history: scheduleHistory };
  if (state.platform.OS === "web") {
    state.values.set("orca9.workoutSessions", JSON.stringify(sessions));
    state.values.set("orca9.restDays", JSON.stringify(["2026-09-28"]));
    state.values.set("orca9.programLibrary.v3", JSON.stringify(library));
  } else {
    for (const session of sessions) state.sql.prepare("INSERT INTO workout_sessions (id, started_at, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(session.id, session.startedAt, session.completedAt, session.startedAt, session.updatedAt);
    state.sql.prepare("INSERT INTO consistency_days (date_key, kind, created_at) VALUES (?, 'rest', ?)").run("2026-09-28", timestamps[0]);
    state.sql.prepare("INSERT INTO program_library (id, data_json) VALUES (1, ?)").run(JSON.stringify(library));
  }
}

for (const platform of ["web", "ios"]) {
  test(`${platform}: reminder history reads exact completion times, manual rests, and dated schedules without changing stored data`, async (t) => {
    setup(t, platform);
    assert.deepEqual(await getReminderHistory(), { completedAt: [], restDates: [], scheduleHistory: [] });
    seedHistory();
    const beforeValues = [...state.values];
    const beforeSql = state.sql.prepare("SELECT * FROM workout_sessions").all();
    const result = await getReminderHistory();
    assert.deepEqual({ ...result, completedAt: result.completedAt.toSorted() }, { completedAt: timestamps.toSorted(), restDates: ["2026-09-28"], scheduleHistory });
    assert.equal(state.writes, 0);
    assert.deepEqual([...state.values], beforeValues);
    assert.deepEqual(state.sql.prepare("SELECT * FROM workout_sessions").all(), beforeSql);
  });

  test(`${platform}: unreadable or corrupt reminder history rejects and leaves source data intact`, async (t) => {
    setup(t, platform); seedHistory();
    state.failRead = true;
    await assert.rejects(getReminderHistory(), /could not be read/);
    state.failRead = false;
    if (platform === "web") {
      const original = state.values.get("orca9.workoutSessions");
      for (const corrupt of ["not json", "{}", "[null]", '[{"completedAt":12}]', '[{"completedAt":"invalid"}]', "[{}]"]) {
        state.values.set("orca9.workoutSessions", corrupt);
        await assert.rejects(getReminderHistory(), /Nothing has been overwritten/);
        assert.equal(state.values.get("orca9.workoutSessions"), corrupt);
      }
      state.values.set("orca9.workoutSessions", original);
      state.values.set("orca9.restDays", '["2026-02-30"]');
      await assert.rejects(getReminderHistory(), /could not be read/);
      assert.equal(state.values.get("orca9.restDays"), '["2026-02-30"]');
      state.values.set("orca9.restDays", "[]");
      state.values.set("orca9.programLibrary.v3", "invalid schedule");
    } else {
      state.sql.prepare("UPDATE workout_sessions SET completed_at = 'invalid' WHERE id = 'session-0'").run();
      await assert.rejects(getReminderHistory(), /could not be read/);
      assert.equal(state.sql.prepare("SELECT completed_at FROM workout_sessions WHERE id = 'session-0'").get().completed_at, "invalid");
      state.sql.prepare("UPDATE workout_sessions SET completed_at = ? WHERE id = 'session-0'").run(timestamps[0]);
      state.sql.prepare("UPDATE consistency_days SET date_key = '2026-02-30'").run();
      await assert.rejects(getReminderHistory(), /could not be read/);
      state.sql.prepare("DELETE FROM consistency_days").run();
      state.sql.prepare("UPDATE program_library SET data_json = 'invalid schedule'").run();
    }
    await assert.rejects(getReminderHistory(), /could not be read/);
    assert.equal(state.writes, 0);
    assert.equal(state.values.get("sb-test-auth-token"), "untouched auth");
  });

  test(`${platform}: only successful workout, rest, and program writes notify reminder observers`, async (t) => {
    setup(t, platform);
    let changes = 0;
    const observedHistory = [];
    const unsubscribe = subscribeToTrainingChanges(() => { changes++; observedHistory.push(getReminderHistory()); });
    t.after(unsubscribe);
    const session = await workouts.createWorkoutSession();
    assert.equal(changes, 0, "starting a workout is not a completed session");
    state.failWrite = true;
    await assert.rejects(workouts.completeWorkoutSession(session.id), /Disk full/);
    await assert.rejects(streaks.markTodayAsRestDay(), /Disk full/);
    await assert.rejects(programs.saveTrainingProgram(programDraft()), /Disk full/);
    assert.equal(changes, 0);
    state.failWrite = false;
    await workouts.completeWorkoutSession(session.id);
    assert.equal(changes, 1);
    assert.equal((await observedHistory[0]).completedAt.length, 1, "observer sees already-persisted completion");
    await streaks.markTodayAsRestDay();
    assert.equal(changes, 2);
    assert.equal((await observedHistory[1]).restDates.length, 1);
    await streaks.markTodayAsRestDay();
    assert.equal(changes, 2, "an existing rest day is not another change");
    const program = await programs.saveTrainingProgram(programDraft());
    assert.equal(changes, 3);
    await programs.setActiveTrainingProgram(program.id);
    assert.equal(changes, 4);
    assert.equal((await observedHistory[3]).scheduleHistory.at(-1).programId, program.id);
    state.failWrite = true;
    await assert.rejects(programs.deleteTrainingProgram(program.id), /Disk full/);
    assert.equal(changes, 4);
    state.failWrite = false;
    await programs.deleteTrainingProgram(program.id);
    assert.equal(changes, 5);
    assert.equal((await observedHistory[4]).scheduleHistory.at(-1).programId, null);
    unsubscribe();
    await programs.saveTrainingProgram(programDraft());
    assert.equal(changes, 5, "unsubscribed observers stop receiving changes");
    await Promise.all(observedHistory);
  });
}

test("training observers isolate synchronous and asynchronous failures and allow unsubscribe", async () => {
  const called = [];
  const cleanups = [
    subscribeToTrainingChanges(() => { throw new Error("Broken listener"); }),
    subscribeToTrainingChanges(async () => { throw new Error("Broken asynchronous listener"); }),
    subscribeToTrainingChanges(() => { called.push("notified"); })
  ];
  try {
    assert.doesNotThrow(emitTrainingChange);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(called, ["notified"]);
    cleanups[2]();
    emitTrainingChange();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(called, ["notified"]);
  } finally { for (const cleanup of cleanups) cleanup(); }
});
