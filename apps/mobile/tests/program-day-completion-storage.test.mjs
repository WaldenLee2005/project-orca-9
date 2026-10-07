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
  async multiRemove() { throw new Error("Completion tests must never reset training data"); }
};
state.database = {
  async getAllAsync(sql, params = []) { await state.beforeRead?.(sql); if (state.failRead) throw new Error("Storage unavailable"); return state.sql.prepare(sql).all(...params); },
  async getFirstAsync(sql, params = []) { await state.beforeRead?.(sql); if (state.failRead) throw new Error("Storage unavailable"); return state.sql.prepare(sql).get(...params) ?? null; },
  async runAsync(sql, params = []) { if (state.failWrite) throw new Error("Disk full"); state.writes++; return state.sql.prepare(sql).run(...params); },
  async withTransactionAsync(callback) { state.sql.exec("BEGIN"); try { await callback(); state.sql.exec("COMMIT"); } catch (error) { state.sql.exec("ROLLBACK"); throw error; } }
};
globalThis.__orcaProgramCompletionTest = state;
const modules = {
  "react-native": "export const Platform = globalThis.__orcaProgramCompletionTest.platform;",
  "@react-native-async-storage/async-storage": "export default globalThis.__orcaProgramCompletionTest.storage;",
  "./database": "export const getDatabase = async () => globalThis.__orcaProgramCompletionTest.database; export const compactLocalDatabase = async () => {}; export const createLocalId = (prefix) => prefix + '-' + (++globalThis.__orcaProgramCompletionTest.nextId);",
  "./profilesRepository": "export const getCachedCurrentUserProfile = () => null; export const warmCurrentUserProfileCache = () => {};",
  "../features/workouts/repdbSessionExercises": "export const sessionExercises = [{ id: 'bench', name: 'Bench Press', image: 1 }];"
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "./trainingMutationQueue") return nextResolve(new URL("../src/storage/trainingMutationQueue.ts", import.meta.url).href, context);
  if (specifier === "../features/programs/programRestart") return nextResolve(new URL("../src/features/programs/programRestart.ts", import.meta.url).href, context);
  if (specifier === "./programModel" && context.parentURL?.endsWith("/programRestart.ts")) return nextResolve(new URL("../src/features/programs/programModel.ts", import.meta.url).href, context);
  if (["./trainingStorage", "./trainingChanges", "./programsRepository"].includes(specifier)) return nextResolve(new URL(`../src/storage/${specifier.slice(2)}.ts`, import.meta.url).href, context);
  if (specifier === "../features/programs/programModel") return nextResolve(new URL("../src/features/programs/programModel.ts", import.meta.url).href, context);
  if (/\/(programsRepository|workoutsRepository|trainingStorage)\.ts$/.test(context.parentURL ?? "") && modules[specifier]) {
    return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(modules[specifier])}` };
  }
  return nextResolve(specifier, context);
} });
const programs = await import("../src/storage/programsRepository.ts");
const workouts = await import("../src/storage/workoutsRepository.ts");
const { localDateKey, toWorkoutProgramPlan } = await import("../src/features/programs/programModel.ts");
const schemaSource = readFileSync(new URL("../src/storage/database.ts", import.meta.url), "utf8");
const schema = schemaSource.match(/async function ensureCoreTables[\s\S]*?execAsync\(`([\s\S]*?)`\);/)[1];
const exercise = { id: "bench", name: "Bench Press", image: 1 };
const today = "2026-10-05";
const localTimestamp = (day = 5, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const programDraft = (dayId = "upper") => ({
  name: "Daily lifting", schedule: { mode: "cycle", startDate: today },
  days: [{ id: dayId, name: "Upper", kind: "training", exercises: [
    { id: "bench-entry", exerciseId: "bench", exerciseName: "Bench Press", sets: 3, target: { kind: "reps", reps: 8 } },
    { id: "second-entry", exerciseId: "bench", exerciseName: "Bench Press", sets: 3, target: { kind: "reps", reps: 10 } }
  ] }]
});
const identity = (plan) => ({ programId: plan.programId, dayId: plan.dayId });

function setup(t, platform, now = new Date(2026, 9, 5, 20).getTime()) {
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

for (const platform of ["web", "ios"]) {
  test(`${platform}: only nonempty actual completed program sessions mark their snapshot day`, async (t) => {
    setup(t, platform);
    const program = await activeProgram(), plan = toWorkoutProgramPlan(program);
    assert.deepEqual(await workouts.getCompletedProgramDays(), []);
    const active = await workouts.createWorkoutSession({ followActiveProgram: true });
    await saveActual(active);
    assert.deepEqual(await workouts.getCompletedProgramDays(), [], "saved exercises in an active workout are not completion");
    await workouts.completeWorkoutSession(active.id);
    assert.deepEqual(await workouts.getCompletedProgramDays(), [identity(plan)], "a partial session with actual results counts when Save Session completes it");
    seedSession({ id: "duplicate-legacy-session", plan });
    seedSession({ id: "empty-completion", plan: { ...plan, dayId: "empty" }, actual: false });
    seedSession({ id: "manual-completion", plan: null });
    seedSession({ id: "timed-completion", plan: { ...plan, dayId: "timed" }, timed: true });
    const empty = await workouts.createWorkoutSession();
    assert.equal(await workouts.cancelEmptyWorkoutSession(empty.id), true);
    const before = snapshot(), writes = state.writes;
    assert.deepEqual((await workouts.getCompletedProgramDays()).toSorted((a, b) => a.dayId.localeCompare(b.dayId)), [identity(plan), { programId: plan.programId, dayId: "timed" }].toSorted((a, b) => a.dayId.localeCompare(b.dayId)));
    assert.deepEqual(snapshot(), before, "reading completion does not edit any results, notes or snapshots");
    assert.equal(state.writes, writes);
    assert.equal(state.values.get("sb-test-auth-token"), "untouched auth");
  });

  test(`${platform}: completion uses local completion date, with midnight and DST boundaries`, async (t) => {
    setup(t, platform, new Date(2026, 10, 2, 12).getTime());
    const plan = toWorkoutProgramPlan({ ...programDraft(), id: "original-program" });
    const cases = [
      ["before-spring-midnight", "2026-03-08T07:59:59.999Z", "2026-03-07"],
      ["spring-midnight", "2026-03-08T08:00:00.000Z", "2026-03-08"],
      ["spring-after-dst", "2026-03-09T06:59:59.999Z", "2026-03-08"],
      ["spring-next-midnight", "2026-03-09T07:00:00.000Z", "2026-03-09"],
      ["fall-midnight", "2026-11-01T07:00:00.000Z", "2026-11-01"],
      ["fall-repeated-hour", "2026-11-01T09:30:00.000Z", "2026-11-01"],
      ["fall-last-minute", "2026-11-02T07:59:59.999Z", "2026-11-01"],
      ["fall-next-midnight", "2026-11-02T08:00:00.000Z", "2026-11-02"]
    ];
    for (const [id, completedAt] of cases) seedSession({ id, plan: { ...plan, dayId: id }, completedAt, startedAt: "2026-01-01T12:00:00.000Z" });
    for (const date of new Set(cases.map((entry) => entry[2]))) {
      assert.deepEqual((await workouts.getCompletedProgramDays(date)).map((entry) => entry.dayId).toSorted(), cases.filter((entry) => entry[2] === date).map((entry) => entry[0]).toSorted());
    }
    assert.deepEqual(await workouts.getCompletedProgramDays("2026-01-01"), [], "start date cannot count as completion date");
    await assert.rejects(workouts.getCompletedProgramDays("2026-02-30"), /date is invalid/);
  });

  test(`${platform}: snapshot program/day IDs survive template edits and completion has no recent-history cap`, async (t) => {
    setup(t, platform);
    const program = await activeProgram(), plan = toWorkoutProgramPlan(program);
    seedSession({ id: "original-completion", plan, completedAt: localTimestamp(5, 1) });
    for (let index = 0; index < 150; index++) seedSession({ id: `later-manual-${index}`, plan: null, completedAt: localTimestamp(5, 18) });
    assert.equal((await workouts.getCoachHistory()).some((entry) => entry.sessionId === "original-completion"), false, "fixture is outside the existing recent coach feed");
    await programs.saveTrainingProgram({ ...program, name: "Renamed", days: program.days.map((day) => ({ ...day, name: "Renamed upper" })) });
    assert.deepEqual(await workouts.getCompletedProgramDays(), [identity(plan)]);
    await programs.deleteTrainingProgram(program.id);
    assert.deepEqual(await workouts.getCompletedProgramDays(), [identity(plan)], "deleting the template does not erase a saved completion");
    seedSession({ id: "other-program", plan: { ...plan, programId: "different-program" } });
    seedSession({ id: "other-day", plan: { ...plan, dayId: "different-day" } });
    assert.equal((await workouts.getCompletedProgramDays()).length, 3, "the match requires both IDs");
  });

  test(`${platform}: successful queued completion turns stale automatic starts into unplanned extra workouts and blocks explicit repeats`, async (t) => {
    setup(t, platform);
    const program = await activeProgram(), plan = toWorkoutProgramPlan(program);
    const session = await workouts.createWorkoutSession({ followActiveProgram: true });
    await saveActual(session);
    const [completion, extra] = await Promise.all([workouts.completeWorkoutSession(session.id), workouts.createWorkoutSession({ followActiveProgram: true })]);
    assert.equal(completion.id, session.id);
    assert.notEqual(extra.id, session.id);
    assert.equal(extra.programPlan, null, "a stale screen cannot repeat today's completed prescription");
    assert.equal((await programs.getProgramLibrary()).activeProgramId, program.id, "an extra workout does not deactivate the program");
    assert.equal(await workouts.cancelEmptyWorkoutSession(extra.id), true);
    const before = snapshot(), writes = state.writes;
    await assert.rejects(workouts.createWorkoutSession({ programPlan: plan }), /already completed this program day today.*extra workout without the program/);
    assert.deepEqual(snapshot(), before);
    assert.equal(state.writes, writes);
    const otherDay = await workouts.createWorkoutSession({ programPlan: { ...plan, dayId: "other-day" } });
    assert.equal(otherDay.programPlan.dayId, "other-day", "a different day remains explicitly available");
    await workouts.cancelEmptyWorkoutSession(otherDay.id);
    const otherProgram = await workouts.createWorkoutSession({ programPlan: { ...plan, programId: "other-program" } });
    assert.equal(otherProgram.programPlan.programId, "other-program", "a different program with the same day ID remains available");
  });

  test(`${platform}: manual or failed completion does not suppress the plan, while existing unfinished workouts resume intact`, async (t) => {
    setup(t, platform);
    const program = await activeProgram(), plan = toWorkoutProgramPlan(program);
    const manual = await workouts.createWorkoutSession();
    await saveActual(manual); await workouts.completeWorkoutSession(manual.id);
    assert.deepEqual(await workouts.getCompletedProgramDays(), []);
    const planned = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.deepEqual(planned.programPlan, plan);
    await saveActual(planned);
    const original = await workouts.getActiveWorkoutSession();
    state.failWrite = true;
    await assert.rejects(workouts.completeWorkoutSession(planned.id), /Disk full/);
    state.failWrite = false;
    assert.deepEqual(await workouts.getCompletedProgramDays(), []);
    assert.deepEqual(await workouts.createWorkoutSession({ followActiveProgram: true }), original, "failed completion leaves the original resumable workout intact");
    await workouts.completeWorkoutSession(planned.id);
    const extra = await workouts.createWorkoutSession();
    await saveActual(extra);
    const extraSnapshot = await workouts.getActiveWorkoutSession();
    assert.deepEqual(await workouts.createWorkoutSession({ followActiveProgram: true }), extraSnapshot, "the unfinished extra workout resumes ahead of duplicate eligibility checks");
    await assert.rejects(workouts.createWorkoutSession({ programPlan: plan }), /Finish your active workout/);
    t.mock.timers.setTime(new Date(2026, 9, 6, 1).getTime());
    assert.deepEqual(await workouts.createWorkoutSession({ followActiveProgram: true }), extraSnapshot, "date rollover never replaces an unfinished workout");
    await workouts.completeWorkoutSession(extra.id);
    const nextDay = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.deepEqual(nextDay.programPlan, plan, "the same one-day cycle is available on its next local calendar date");
  });

  test(`${platform}: future, invalid and empty completion records do not mark today's program day`, async (t) => {
    setup(t, platform);
    const program = await activeProgram(), plan = toWorkoutProgramPlan(program);
    seedSession({ id: "future-today", plan, completedAt: localTimestamp(5, 23) });
    seedSession({ id: "future-tomorrow", plan, completedAt: localTimestamp(6, 12) });
    seedSession({ id: "invalid-time", plan, completedAt: "not a time" });
    seedSession({ id: "empty", plan, actual: false });
    assert.deepEqual(await workouts.getCompletedProgramDays(), []);
    const start = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.deepEqual(start.programPlan, plan);
  });

  test(`${platform}: unreadable completion history fails without writing and a later retry works`, async (t) => {
    setup(t, platform);
    const program = await activeProgram(), plan = toWorkoutProgramPlan(program), before = snapshot(), writes = state.writes;
    state.failRead = true;
    await assert.rejects(workouts.getCompletedProgramDays(), /Storage unavailable/);
    await assert.rejects(workouts.createWorkoutSession({ followActiveProgram: true }), /Storage unavailable/);
    state.failRead = false;
    assert.deepEqual(snapshot(), before); assert.equal(state.writes, writes);
    if (platform === "web") {
      state.values.set("orca9.workoutSessions", "invalid saved data");
      await assert.rejects(workouts.getCompletedProgramDays(), /safely read your saved workouts/);
      await assert.rejects(workouts.createWorkoutSession({ followActiveProgram: true }), /safely read your saved workouts/);
      assert.equal(state.values.get("orca9.workoutSessions"), "invalid saved data");
      state.values.delete("orca9.workoutSessions");
    }
    assert.deepEqual((await workouts.createWorkoutSession({ followActiveProgram: true })).programPlan, plan);
  });

  test(`${platform}: midnight during an eligibility read resolves the new automatic day and permits an explicit day again`, async (t) => {
    setup(t, platform, new Date(2026, 9, 5, 23, 59).getTime());
    const draft = programDraft();
    draft.days.push({ ...draft.days[0], id: "lower", name: "Lower", exercises: draft.days[0].exercises.map((entry) => ({ ...entry, id: `lower-${entry.id}` })) });
    const program = await activeProgram(draft), plan = toWorkoutProgramPlan(program, "upper");
    seedSession({ id: "completed-upper", plan, completedAt: localTimestamp(5, 12) });
    let workoutReads = 0;
    state.beforeRead = async (key) => {
      const workoutRead = platform === "web" ? key === "orca9.workoutSessions" : key.includes("WHERE workout_sessions.completed_at IS NOT NULL AND");
      // Web reads the active session first; native identifies the completion query directly.
      if (workoutRead && ++workoutReads === (platform === "web" ? 2 : 1)) t.mock.timers.setTime(new Date(2026, 9, 6, 0, 1).getTime());
    };
    const newDay = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(localDateKey(), "2026-10-06");
    assert.equal(newDay.programPlan.dayId, "lower");
    state.beforeRead = null;
    await workouts.cancelEmptyWorkoutSession(newDay.id);
    t.mock.timers.setTime(new Date(2026, 9, 5, 23, 59).getTime()); workoutReads = 0;
    state.beforeRead = async (key) => {
      const workoutRead = platform === "web" ? key === "orca9.workoutSessions" : key.includes("WHERE workout_sessions.completed_at IS NOT NULL AND");
      if (workoutRead && ++workoutReads === (platform === "web" ? 2 : 1)) t.mock.timers.setTime(new Date(2026, 9, 6, 0, 1).getTime());
    };
    assert.deepEqual((await workouts.createWorkoutSession({ programPlan: plan })).programPlan, plan, "yesterday's completion does not block a start after midnight");
  });
}
