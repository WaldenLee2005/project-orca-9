import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

process.env.TZ = "America/Los_Angeles";
const state = { platform: { OS: "web" }, values: new Map(), sql: null, nextId: 0, failRead: false, failWrite: false, writes: 0, beforeRead: null };
state.storage = {
  async getItem(key) { await state.beforeRead?.(key); if (state.failRead) throw new Error("Storage unavailable"); return state.values.get(key) ?? null; },
  async setItem(key, value) { if (state.failWrite) throw new Error("Disk full"); state.writes++; state.values.set(key, value); },
  async multiRemove() { throw new Error("Restart tests must never reset training data"); }
};
state.database = {
  async getAllAsync(sql, params = []) { await state.beforeRead?.(sql); if (state.failRead) throw new Error("Storage unavailable"); return state.sql.prepare(sql).all(...params); },
  async getFirstAsync(sql, params = []) { await state.beforeRead?.(sql); if (state.failRead) throw new Error("Storage unavailable"); return state.sql.prepare(sql).get(...params) ?? null; },
  async runAsync(sql, params = []) { if (state.failWrite) throw new Error("Disk full"); state.writes++; return state.sql.prepare(sql).run(...params); },
  async withTransactionAsync(callback) { state.sql.exec("BEGIN"); try { await callback(); state.sql.exec("COMMIT"); } catch (error) { state.sql.exec("ROLLBACK"); throw error; } }
};
globalThis.__orcaProgramRestartTest = state;
const modules = {
  "react-native": "export const Platform = globalThis.__orcaProgramRestartTest.platform;",
  "@react-native-async-storage/async-storage": "export default globalThis.__orcaProgramRestartTest.storage;",
  "./database": "export const getDatabase = async () => globalThis.__orcaProgramRestartTest.database; export const compactLocalDatabase = async () => {}; export const createLocalId = (prefix) => prefix + '-' + (++globalThis.__orcaProgramRestartTest.nextId);",
  "./profilesRepository": "export const getCachedCurrentUserProfile = () => null; export const warmCurrentUserProfileCache = () => {};",
  "../features/workouts/repdbSessionExercises": "export const sessionExercises = [{ id: 'bench', name: 'Bench Press', image: 1 }];"
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "./trainingMutationQueue") return nextResolve(new URL("../src/storage/trainingMutationQueue.ts", import.meta.url).href, context);
  if (specifier === "../features/programs/programRestart") return nextResolve(new URL("../src/features/programs/programRestart.ts", import.meta.url).href, context);
  if (specifier === "./programModel" && context.parentURL?.endsWith("/programRestart.ts")) return nextResolve(new URL("../src/features/programs/programModel.ts", import.meta.url).href, context);
  if (["./trainingStorage", "./trainingChanges", "./programsRepository"].includes(specifier)) return nextResolve(new URL(`../src/storage/${specifier.slice(2)}.ts`, import.meta.url).href, context);
  if (specifier === "../features/programs/programModel") return nextResolve(new URL("../src/features/programs/programModel.ts", import.meta.url).href, context);
  if (/\/(programsRepository|workoutsRepository|streaksRepository|reminderRepository|trainingStorage)\.ts$/.test(context.parentURL ?? "") && modules[specifier]) {
    return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(modules[specifier])}` };
  }
  return nextResolve(specifier, context);
} });
const programs = await import("../src/storage/programsRepository.ts");
const workouts = await import("../src/storage/workoutsRepository.ts");
const { localDateKey, toWorkoutProgramPlan, getScheduledDayIndex, getScheduledRestDates } = await import("../src/features/programs/programModel.ts");
const streaks = await import("../src/storage/streaksRepository.ts");
const { getReminderHistory } = await import("../src/storage/reminderRepository.ts");
const { subscribeToTrainingChanges } = await import("../src/storage/trainingChanges.ts");
const schemaSource = readFileSync(new URL("../src/storage/database.ts", import.meta.url), "utf8");
const schema = schemaSource.match(/async function ensureCoreTables[\s\S]*?execAsync\(`([\s\S]*?)`\);/)[1];
const exercise = { id: "bench", name: "Bench Press", image: 1 };
const today = "2026-10-01";
const localTimestamp = (day = 1, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const programDraft = (dayId = "upper") => ({
  name: "Daily lifting", schedule: { mode: "cycle", startDate: today },
  days: [{ id: dayId, name: "Upper", kind: "training", exercises: [
    { id: "bench-entry", exerciseId: "bench", exerciseName: "Bench Press", sets: 3, target: { kind: "reps", reps: 8 } },
    { id: "second-entry", exerciseId: "bench", exerciseName: "Bench Press", sets: 3, target: { kind: "reps", reps: 10 } }
  ] }]
});
const identity = (plan) => ({ programId: plan.programId, dayId: plan.dayId });

function setup(t, platform, now = new Date(2026, 9, 1, 6).getTime()) {
  state.platform.OS = platform; state.values.clear(); state.failRead = false; state.failWrite = false; state.writes = 0; state.beforeRead = null;
  state.values.set("orca9.trainingSchemaVersion", "6"); state.values.set("sb-test-auth-token", "untouched auth");
  state.sql = new DatabaseSync(":memory:"); state.sql.exec("PRAGMA foreign_keys = ON;"); state.sql.exec(schema);
  t.mock.timers.enable({ apis: ["Date"], now });
  t.after(() => { state.beforeRead = null; state.sql.close(); });
}
async function activeProgram(draft = programDraft()) {
  const program = await programs.saveTrainingProgram(draft);
  await programs.setActiveTrainingProgram(program.id);
  return program;
}
async function saveActual(session, timed = false) {
  return workouts.addExerciseToWorkoutSession({ sessionId: session.id, exercise, programEntryId: "bench-entry", sets: 1,
    reps: timed ? 0 : 8, weight: timed ? 0 : 135.25, durationSeconds: timed ? 45 : null,
    actualSets: [{ reps: timed ? 0 : 8, weight: timed ? 0 : 135.25, durationSeconds: timed ? 45 : null, note: "Keep my note" }] });
}
function seedSession({ id, plan, completedAt = localTimestamp(), startedAt = localTimestamp(), actual = true, timed = false }) {
  const entry = { id: `${id}-exercise`, exercise, sets: 1, reps: timed ? 0 : 8, weight: timed ? 0 : 135.25,
    durationSeconds: timed ? 45 : null, savedAt: startedAt,
    actualSets: [{ reps: timed ? 0 : 8, weight: timed ? 0 : 135.25, durationSeconds: timed ? 45 : null, note: "Saved private note" }] };
  if (state.platform.OS === "web") {
    const sessions = JSON.parse(state.values.get("orca9.workoutSessions") ?? "[]");
    sessions.push({ id, programPlan: plan, startedAt, completedAt, updatedAt: completedAt ?? startedAt, exercises: actual ? [entry] : [] });
    state.values.set("orca9.workoutSessions", JSON.stringify(sessions));
  } else {
    state.sql.prepare("INSERT INTO workout_sessions (id, started_at, completed_at, program_plan_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, startedAt, completedAt, plan ? JSON.stringify(plan) : null, startedAt, completedAt ?? startedAt);
    if (actual) {
      state.sql.prepare("INSERT INTO workout_exercises (id, workout_session_id, exercise_id, exercise_name_snapshot, exercise_order, saved_at, created_at, updated_at) VALUES (?, ?, 'bench', 'Bench Press', 0, ?, ?, ?)")
        .run(entry.id, id, startedAt, startedAt, startedAt);
      state.sql.prepare("INSERT INTO set_entries (id, workout_exercise_id, set_number, weight, reps, duration_seconds, note, completed_at, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)")
        .run(`${id}-set`, entry.id, entry.weight, entry.reps, entry.durationSeconds, entry.actualSets[0].note, startedAt, startedAt, startedAt);
    }
  }
}
function snapshot() {
  return { values: [...state.values], sessions: state.sql.prepare("SELECT * FROM workout_sessions ORDER BY id").all(),
    exercises: state.sql.prepare("SELECT * FROM workout_exercises ORDER BY id").all(), sets: state.sql.prepare("SELECT * FROM set_entries ORDER BY id").all() };
}

const clock = (t, day, hour = 6, minute = 0) => t.mock.timers.setTime(new Date(2026, 9, day, hour, minute).getTime());
const alternatingDraft = () => ({
  ...programDraft(), name: "Ordered lifting", days: [
    { ...programDraft().days[0], id: "first", name: "First" },
    { id: "rest-1", name: "Rest", kind: "rest", exercises: [] },
    { ...programDraft().days[0], id: "second", name: "Second" },
    { id: "rest-2", name: "Rest", kind: "rest", exercises: [] }
  ]
});
function workoutSnapshot() {
  return state.platform.OS === "web" ? state.values.get("orca9.workoutSessions") : JSON.stringify(snapshot().sessions.concat(snapshot().exercises, snapshot().sets));
}
function storedLibrary() {
  return state.platform.OS === "web" ? state.values.get("orca9.programLibrary.v3") : state.sql.prepare("SELECT data_json FROM program_library WHERE id = 1").get()?.data_json;
}
function writeRawLibrary(value) {
  if (state.platform.OS === "web") state.values.set("orca9.programLibrary.v3", value);
  else state.sql.prepare("UPDATE program_library SET data_json = ? WHERE id = 1").run(value);
}
function defer() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

for (const platform of ["web", "ios"]) {
  test(`${platform}: a missed cycle day restarts today once and preserves templates, prior rest and actual history`, async (t) => {
    setup(t, platform);
    const program = await activeProgram(alternatingDraft());
    const history = await programs.getProgramScheduleHistory();
    seedSession({ id: "first-completed", plan: toWorkoutProgramPlan(program, "first"), completedAt: localTimestamp(1), startedAt: localTimestamp(1) });
    const actualBefore = workoutSnapshot();
    clock(t, 4);
    const writes = state.writes;
    const [library, revisions, reminderHistory] = await Promise.all([programs.getProgramLibrary(), programs.getProgramScheduleHistory(), getReminderHistory()]);
    assert.deepEqual(library.programs, [program], "the saved template and its update timestamp remain unchanged");
    assert.equal(library.activeProgramId, program.id);
    assert.deepEqual(library.activeSchedule, { mode: "cycle", startDate: "2026-10-04" });
    assert.equal(library.restartedAt, "2026-10-04");
    assert.deepEqual(revisions.slice(0, -1), history);
    assert.deepEqual(revisions.at(-1), { effectiveFrom: "2026-10-04", programId: program.id, schedule: library.activeSchedule, dayKinds: program.days.map((day) => day.kind) });
    assert.deepEqual(reminderHistory.scheduleHistory, revisions);
    assert.deepEqual(getScheduledRestDates(revisions, "2026-10-06"), ["2026-10-02", "2026-10-05"]);
    assert.equal((await streaks.getStreakSummary()).todayStatus, "open", "the missed October 3 is not fabricated as rest");
    assert.equal((await streaks.getStreakSummary()).currentStreak, 0);
    assert.equal(state.writes, writes + 1, "concurrent readers share exactly one restart write");
    assert.deepEqual(await programs.getProgramLibrary(), library);
    assert.equal(state.writes, writes + 1);
    assert.equal(workoutSnapshot(), actualBefore, "weights, private notes and saved plan snapshots stay intact");
    assert.equal(state.values.get("sb-test-auth-token"), "untouched auth");
    const session = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(session.programPlan.dayId, "first");
    assert.equal(session.exercises.length, 0, "restarting does not invent completed sets");
  });

  test(`${platform}: a weekly template restarts at Day 1 and follows ordered days without changing saved weekdays`, async (t) => {
    setup(t, platform);
    const day = programDraft().days[0];
    const weekly = { ...programDraft(), schedule: { mode: "weekly", startDate: today }, days: Array.from({ length: 7 }, (_, index) => ({
      ...day, id: `day-${index}`, name: "", kind: [0, 1, 3].includes(index) ? "training" : "rest",
      exercises: [0, 1, 3].includes(index) ? day.exercises : []
    })) };
    const program = await activeProgram(weekly);
    seedSession({ id: "thursday-done", plan: toWorkoutProgramPlan(program, "day-3"), completedAt: localTimestamp(1), startedAt: localTimestamp(1) });
    clock(t, 6);
    const library = await programs.getProgramLibrary();
    assert.deepEqual(library.programs[0], program);
    assert.equal(program.schedule.mode, "weekly");
    assert.equal(getScheduledDayIndex(library.activeSchedule, 7), 0, "Tuesday restarts at the first ordered day");
    const session = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(session.programPlan.dayId, "day-0");
    assert.equal(session.programPlan.dayName, "Day 1", "the restarted snapshot does not misleadingly call Tuesday Monday");
    await saveActual(session, true);
    await workouts.completeWorkoutSession(session.id);
    clock(t, 7);
    const next = await programs.getProgramLibrary();
    assert.equal(next.restartedAt, "2026-10-06", "completed timed work satisfies its program day");
    assert.equal(getScheduledDayIndex(next.activeSchedule, 7), 1);
    assert.equal((await workouts.createWorkoutSession({ followActiveProgram: true })).programPlan.dayId, "day-1");
    assert.deepEqual(await programs.getTrainingProgram(program.id), program);
  });

  test(`${platform}: planned rest, open today and activation/start boundaries do not restart`, async (t) => {
    setup(t, platform);
    const program = await activeProgram(alternatingDraft());
    seedSession({ id: "first-completed", plan: toWorkoutProgramPlan(program, "first"), completedAt: localTimestamp(1), startedAt: localTimestamp(1) });
    clock(t, 3);
    const writes = state.writes;
    assert.deepEqual(await programs.getProgramLibrary(), { programs: [program], activeProgramId: program.id });
    assert.equal(state.writes, writes, "yesterday's planned rest and today's unfinished training are not misses");
    await programs.setActiveTrainingProgram(null);
    clock(t, 9);
    assert.equal((await programs.getProgramLibrary()).activeProgramId, null);
    const future = await activeProgram({ ...alternatingDraft(), name: "Future", schedule: { mode: "cycle", startDate: "2026-10-12" } });
    assert.deepEqual(await programs.getProgramLibrary(), { programs: [future, program], activeProgramId: future.id });
    clock(t, 12);
    assert.equal((await programs.getProgramLibrary()).restartedAt, undefined, "past dates before the future start are excluded");
    await programs.setActiveTrainingProgram(program.id);
    assert.equal((await programs.getProgramLibrary()).restartedAt, undefined, "a fresh activation does not inspect dates before activation");
  });

  for (const scenario of ["manual-workout", "manual-rest", "different-program", "different-day", "empty-completion"]) {
    test(`${platform}: ${scenario} does not satisfy a scheduled program training day`, async (t) => {
      setup(t, platform);
      const program = await activeProgram(alternatingDraft());
      const plan = toWorkoutProgramPlan(program, "first");
      if (scenario === "manual-rest") await streaks.markTodayAsRestDay();
      else seedSession({ id: "other-result", plan: scenario === "manual-workout" ? null : scenario === "different-program" ? { ...plan, programId: "other-program" } : scenario === "different-day" ? { ...plan, dayId: "second" } : plan,
        actual: scenario !== "empty-completion", completedAt: localTimestamp(1), startedAt: localTimestamp(1) });
      clock(t, 2);
      const actualBefore = workoutSnapshot();
      const library = await programs.getProgramLibrary();
      assert.equal(library.restartedAt, "2026-10-02");
      assert.equal(getScheduledDayIndex(library.activeSchedule, program.days.length), 0);
      assert.equal(workoutSnapshot(), actualBefore);
      if (scenario === "manual-rest") assert.ok((await streaks.getStreakSummary()).activeDates.includes("2026-10-01"), "manual rest still counts toward general consistency");
    });
  }

  test(`${platform}: any unfinished session defers a restart and resumes its immutable plan`, async (t) => {
    setup(t, platform);
    const program = await activeProgram(alternatingDraft());
    seedSession({ id: "paused", plan: toWorkoutProgramPlan(program, "second"), completedAt: null, startedAt: localTimestamp(1) });
    clock(t, 3);
    const paused = await workouts.getActiveWorkoutSession();
    const writes = state.writes;
    assert.deepEqual(await programs.getProgramLibrary(), { programs: [program], activeProgramId: program.id });
    assert.equal(state.writes, writes);
    const resumed = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.deepEqual(resumed, paused);
    await workouts.completeWorkoutSession(resumed.id);
    const completedBefore = workoutSnapshot();
    assert.equal((await programs.getProgramLibrary()).restartedAt, "2026-10-03", "the pending missed first day is applied after completion");
    assert.equal(workoutSnapshot(), completedBefore);
  });

  test(`${platform}: empty unfinished manual sessions defer until safely cancelled`, async (t) => {
    setup(t, platform);
    const program = await activeProgram(alternatingDraft());
    seedSession({ id: "empty-paused", plan: null, completedAt: null, startedAt: localTimestamp(1), actual: false });
    clock(t, 2);
    assert.equal((await programs.getProgramLibrary()).restartedAt, undefined);
    assert.equal(await workouts.cancelEmptyWorkoutSession("empty-paused"), true);
    assert.equal((await programs.getProgramLibrary()).restartedAt, "2026-10-02");
  });

  test(`${platform}: failed reads/writes preserve stored data and retry a restart without poisoning the shared queue`, async (t) => {
    setup(t, platform);
    await activeProgram(alternatingDraft());
    clock(t, 2);
    let events = 0;
    t.after(subscribeToTrainingChanges(() => { events++; }));
    const before = snapshot();
    state.failRead = true;
    await assert.rejects(programs.getProgramLibrary(), /Storage unavailable/);
    state.failRead = false;
    assert.deepEqual(snapshot(), before);
    state.failWrite = true;
    await assert.rejects(programs.getProgramLibrary(), /Disk full/);
    state.failWrite = false;
    assert.deepEqual(snapshot(), before);
    assert.equal(events, 0);
    assert.equal((await programs.getProgramLibrary()).restartedAt, "2026-10-02");
    assert.equal(events, 1);
  });

  test(`${platform}: corrupt workouts and incompatible active revision days cannot trigger a write`, async (t) => {
    setup(t, platform);
    const program = await activeProgram(alternatingDraft());
    clock(t, 2);
    if (platform === "web") state.values.set("orca9.workoutSessions", '[{"id":"broken","startedAt":"2026-10-01","completedAt":"2026-10-01T12:00:00Z","exercises":[{}]}]');
    else {
      seedSession({ id: "broken", plan: toWorkoutProgramPlan(program, "first"), completedAt: localTimestamp(1) });
      state.sql.prepare("UPDATE workout_sessions SET program_plan_json = ? WHERE id = 'broken'").run("{broken");
    }
    const before = snapshot(), writes = state.writes;
    await assert.rejects(programs.getProgramLibrary(), /Nothing has been overwritten/);
    assert.deepEqual(snapshot(), before);
    assert.equal(state.writes, writes);
    const library = JSON.parse(storedLibrary());
    library.history[0].dayKinds = ["training"];
    writeRawLibrary(JSON.stringify(library));
    const corruptLibrary = storedLibrary();
    await assert.rejects(programs.getProgramLibrary(), /saved programs or schedule/);
    assert.equal(storedLibrary(), corruptLibrary);
    assert.equal(state.writes, writes);
  });

  for (const first of ["schedule", "workout"]) {
    test(`${platform}: concurrent ${first}-first restart and creation share one reset and immutable workout snapshot`, async (t) => {
      setup(t, platform);
      const program = await activeProgram(alternatingDraft());
      clock(t, 3);
      const entered = defer(), release = defer();
      let held = false;
      state.beforeRead = async (key) => {
        if (!held && (platform === "web" ? key === "orca9.workoutSessions" : key.includes("FROM workout_sessions"))) {
          held = true; entered.resolve(); await release.promise;
        }
      };
      const writes = state.writes;
      let libraryRead, creation;
      if (first === "schedule") libraryRead = programs.getProgramLibrary();
      else creation = workouts.createWorkoutSession({ followActiveProgram: true });
      await entered.promise;
      if (first === "schedule") creation = workouts.createWorkoutSession({ followActiveProgram: true });
      else libraryRead = programs.getProgramLibrary();
      release.resolve();
      const [library, session] = await Promise.all([libraryRead, creation]);
      state.beforeRead = null;
      assert.equal(library.restartedAt, "2026-10-03");
      assert.equal(session.programPlan.programId, program.id);
      assert.equal(session.programPlan.dayId, "first");
      assert.equal(state.writes, writes + 2, "one schedule write and one session creation");
      const active = await workouts.getActiveWorkoutSession();
      assert.deepEqual(active.programPlan, session.programPlan);
      assert.equal((await programs.getProgramScheduleHistory()).length, 2);
      assert.equal(state.writes, writes + 2);
    });
  }

  test(`${platform}: midnight during history reading restarts on the current local date`, async (t) => {
    setup(t, platform);
    await activeProgram(alternatingDraft());
    clock(t, 2, 23, 59);
    let moved = false;
    state.beforeRead = async (key) => {
      if (!moved && (platform === "web" ? key === "orca9.workoutSessions" : key.includes("AS has_actual"))) {
        moved = true; clock(t, 3, 0, 0);
      }
    };
    const library = await programs.getProgramLibrary();
    state.beforeRead = null;
    assert.equal(library.restartedAt, "2026-10-03");
    assert.equal(library.activeSchedule.startDate, "2026-10-03");
    assert.equal((await programs.getProgramScheduleHistory()).at(-1).effectiveFrom, "2026-10-03");
  });
}
