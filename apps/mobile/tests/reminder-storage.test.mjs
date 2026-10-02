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
  async runAsync(sql, params = []) { if (state.failWrite) throw new Error("Disk full"); state.writes++; return state.sql.prepare(sql).run(...params); },
  async withTransactionAsync(callback) { state.sql.exec("BEGIN"); try { await callback(); state.sql.exec("COMMIT"); } catch (error) { state.sql.exec("ROLLBACK"); throw error; } }
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
  if (["../features/programs/programModel", "../programs/programModel"].includes(specifier)) return nextResolve(new URL("../src/features/programs/programModel.ts", import.meta.url).href, context);
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
const { buildReminderPlan } = await import("../src/features/reminders/reminderPlan.ts");
const { localDateKey } = await import("../src/features/programs/programModel.ts");
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

  test(`${platform}: active-program changes keep session plans, reminders and historical rest streaks in sync`, async (t) => {
    setup(t, platform);
    const clock = (day, hour = 6) => t.mock.timers.setTime(new Date(2026, 8, day, hour).getTime());
    t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 8, 1, 6).getTime() });
    let changes = 0;
    const unsubscribe = subscribeToTrainingChanges(() => { changes++; });
    t.after(unsubscribe);
    const reminderPlan = async () => buildReminderPlan({ ...(await getReminderHistory()), now: new Date(), fallbackMinute: 18 * 60, restMinute: 8 * 60 });
    const todayKinds = async () => (await reminderPlan()).reminders.filter((reminder) => reminder.dateKey === localDateKey()).map((reminder) => reminder.kind);
    const snapshot = async () => ({ history: await getReminderHistory(), library: await programs.getProgramLibrary(), streak: await streaks.getStreakSummary(), session: await workouts.getActiveWorkoutSession(), plan: await reminderPlan() });
    async function rejectWrite(action) {
      const before = await snapshot(), observed = changes;
      state.failWrite = true;
      try { await assert.rejects(action, /Disk full/); }
      finally { state.failWrite = false; }
      assert.equal(changes, observed, "a failed write must not request a reminder refresh");
      assert.deepEqual(await snapshot(), before, "a failed write must preserve the schedule, session, notifications and streak");
    }

    const first = await programs.saveTrainingProgram(programDraft());
    const second = await programs.saveTrainingProgram({ ...programDraft(), name: "Later recovery cycle", schedule: { mode: "cycle", startDate: "2026-09-02" } });
    assert.equal(changes, 2);
    assert.deepEqual((await getReminderHistory()).scheduleHistory, [], "saving a library entry leaves reminders and streaks unplanned");
    assert.deepEqual((await reminderPlan()).reminders.filter((reminder) => reminder.dateKey === "2026-09-02").map((reminder) => reminder.kind), ["workout", "streak"]);
    await rejectWrite(() => programs.setActiveTrainingProgram(first.id));
    await programs.setActiveTrainingProgram(first.id);
    assert.equal(changes, 3);
    assert.deepEqual((await reminderPlan()).reminders.filter((reminder) => reminder.dateKey === "2026-09-02").map((reminder) => reminder.kind), ["rest"]);
    const firstSession = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(firstSession.programPlan.programId, first.id);
    assert.equal((await streaks.getStreakSummary()).currentStreak, 0, "a planned workout earns no streak credit before completion");
    clock(1, 18);
    await workouts.addExerciseToWorkoutSession({ sessionId: firstSession.id, exercise: { id: "bench", name: "Bench Press", image: 1 }, programEntryId: "bench", sets: 3, reps: 8, weight: 100 });
    await workouts.completeWorkoutSession(firstSession.id);
    assert.equal(changes, 4);
    assert.deepEqual(await todayKinds(), [], "actual completion suppresses the day's remaining notifications");

    clock(2);
    let summary = await streaks.getStreakSummary();
    assert.deepEqual([summary.currentStreak, summary.currentActiveDays, summary.currentRestDays, summary.todayStatus], [2, 1, 1, "rest"]);
    assert.deepEqual(await todayKinds(), ["rest"], "the same scheduled recovery day drives the reminder and streak");
    clock(3);
    const unfinished = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(unfinished.programPlan.programId, first.id);
    await rejectWrite(() => programs.setActiveTrainingProgram(second.id));
    await programs.setActiveTrainingProgram(second.id);
    assert.equal(changes, 5);
    summary = await streaks.getStreakSummary();
    assert.deepEqual([summary.currentStreak, summary.currentActiveDays, summary.currentRestDays, summary.todayStatus], [3, 1, 2, "rest"]);
    assert.deepEqual(summary.activeDates, ["2026-09-01", "2026-09-02", "2026-09-03"], "switching preserves earlier rest from the first program");
    assert.deepEqual(await todayKinds(), ["rest"]);
    assert.deepEqual((await workouts.getActiveWorkoutSession()).programPlan, unfinished.programPlan, "a switch cannot replace an unfinished workout");

    clock(4);
    assert.deepEqual(await todayKinds(), ["workout", "streak"]);
    const edited = { ...second, days: second.days.map((day, index) => ({ ...day, kind: index === 0 ? "rest" : "training", exercises: index === 0 ? day.exercises : [{ ...first.days[0].exercises[0], id: "new-bench" }] })) };
    await rejectWrite(() => programs.saveTrainingProgram(edited));
    await programs.saveTrainingProgram(edited);
    assert.equal(changes, 6);
    assert.deepEqual(await todayKinds(), ["rest"], "an active edit replaces today's training notices with recovery");
    summary = await streaks.getStreakSummary();
    assert.deepEqual([summary.currentStreak, summary.currentActiveDays, summary.currentRestDays], [4, 1, 3]);
    assert.deepEqual(summary.activeDates, ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    assert.deepEqual((await workouts.getActiveWorkoutSession()).programPlan, unfinished.programPlan, "an active edit cannot change a stored workout prescription");

    await rejectWrite(() => programs.setActiveTrainingProgram(null));
    await programs.setActiveTrainingProgram(null);
    assert.equal(changes, 7);
    assert.equal((await programs.getProgramLibrary()).activeProgramId, null);
    assert.deepEqual(await todayKinds(), ["workout", "streak"], "deactivation returns today's ordinary workout reminders");
    summary = await streaks.getStreakSummary();
    assert.deepEqual([summary.currentStreak, summary.currentActiveDays, summary.currentRestDays, summary.todayStatus], [3, 1, 2, "open"]);
    assert.deepEqual(summary.activeDates, ["2026-09-01", "2026-09-02", "2026-09-03"], "deactivation removes only today's scheduled rest, preserving history");
    const resumed = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(resumed.id, unfinished.id);
    assert.deepEqual(resumed.programPlan, unfinished.programPlan);
    await workouts.addExerciseToWorkoutSession({ sessionId: resumed.id, exercise: { id: "bench", name: "Bench Press", image: 1 }, sets: 1, reps: 8, weight: 100 });
    await workouts.completeWorkoutSession(resumed.id);
    assert.deepEqual(await todayKinds(), [], "ordinary completion still cancels notifications after a program is deactivated");
    const unplanned = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(unplanned.programPlan, null, "the following session uses normal manual tracking");
    assert.equal(state.values.get("sb-test-auth-token"), "untouched auth");
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
