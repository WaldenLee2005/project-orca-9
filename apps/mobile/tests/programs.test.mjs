import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { stepGoalValue, changeExerciseTargetKind, validateProgram, validateExerciseTarget, formatExerciseTarget, formatProgramPrescription, parseTrainingProgram, moveProgramExercise, clampDragTranslation, getDragTargetIndex, getPendingProgramExercises, toWorkoutProgramPlan, parseWorkoutProgramPlan, isTrainingProgram, getScheduledDayIndex, getScheduledRestDates, reviseSchedule, dateOrdinal, localDateKey, PROGRAM_DAY_CHOICES } from "../src/features/programs/programModel.ts";

const state = { platform: { OS: "web" }, values: new Map(), sql: null, nextId: 0, failWrite: false };
state.storage = {
  async getItem(key) { return state.values.get(key) ?? null; },
  async setItem(key, value) { if (state.failWrite) throw new Error("Disk full"); state.values.set(key, value); },
  async multiRemove(keys) { for (const key of keys) state.values.delete(key); }
};
state.database = {
  async execAsync(sql) { state.sql.exec(sql); },
  async getAllAsync(sql, params = []) { return state.sql.prepare(sql).all(...params); },
  async getFirstAsync(sql, params = []) { return state.sql.prepare(sql).get(...params) ?? null; },
  async runAsync(sql, params = []) { if (state.failWrite) throw new Error("Disk full"); return state.sql.prepare(sql).run(...params); },
  async withTransactionAsync(callback) { state.sql.exec("BEGIN"); try { await callback(); state.sql.exec("COMMIT"); } catch (error) { state.sql.exec("ROLLBACK"); throw error; } }
};
globalThis.__orcaProgramsTest = state;
const modules = {
  "react-native": "export const Platform = globalThis.__orcaProgramsTest.platform;",
  "@react-native-async-storage/async-storage": "export default globalThis.__orcaProgramsTest.storage;",
  "./database": "export const getDatabase = async () => globalThis.__orcaProgramsTest.database; export const compactLocalDatabase = async () => {}; export const createLocalId = (prefix) => prefix + '-' + (++globalThis.__orcaProgramsTest.nextId);",
  "./profilesRepository": "export const getCachedCurrentUserProfile = () => null; export const warmCurrentUserProfileCache = () => {};",
  "../features/workouts/repdbSessionExercises": "export const sessionExercises = [{ id: 'bench', name: 'Bench Press', image: 1 }, { id: 'row', name: 'Row', image: 2 }];"
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/programs/starterPrograms.ts") && specifier === "./programModel") return nextResolve(new URL("./programModel.ts", context.parentURL).href, context);
  if (context.parentURL?.endsWith("/programs/importProgram.ts") && ["./programModel", "../exercises/exerciseSearch"].includes(specifier)) return nextResolve(new URL(`${specifier}.ts`, context.parentURL).href, context);
  if (specifier === "./trainingStorage") return nextResolve(new URL("../src/storage/trainingStorage.ts", import.meta.url).href, context);
  if (specifier === "./trainingChanges") return nextResolve(new URL("../src/storage/trainingChanges.ts", import.meta.url).href, context);
  if (specifier === "./programsRepository") return nextResolve(new URL("../src/storage/programsRepository.ts", import.meta.url).href, context);
  if (specifier === "../features/programs/programModel") return nextResolve(new URL("../src/features/programs/programModel.ts", import.meta.url).href, context);
  if (context.parentURL?.endsWith("/storage/database.ts") && specifier === "expo-sqlite") {
    return { shortCircuit: true, url: "data:text/javascript,export const openDatabaseAsync = async () => globalThis.__orcaProgramsTest.database;" };
  }
  if (/\/(programsRepository|workoutsRepository|streaksRepository|trainingStorage)\.ts$/.test(context.parentURL ?? "") && modules[specifier]) {
    return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(modules[specifier])}` };
  }
  return nextResolve(specifier, context);
} });
const programs = await import("../src/storage/programsRepository.ts");
const workouts = await import("../src/storage/workoutsRepository.ts");
const streaks = await import("../src/storage/streaksRepository.ts");
const { parseProgramImport, validateImportExercises } = await import("../src/features/programs/importProgram.ts");
const { STARTER_PROGRAMS, createStarterProgram } = await import("../src/features/programs/starterPrograms.ts");
const starterCatalog = JSON.parse(readFileSync(new URL("../assets/repdb/exercises.json", import.meta.url), "utf8")).exercises.map((exercise) => ({ id: exercise.id, name: exercise.name_en }));
const schemaSource = readFileSync(new URL("../src/storage/database.ts", import.meta.url), "utf8");
const schema = schemaSource.match(/async function ensureCoreTables[\s\S]*?execAsync\(`([\s\S]*?)`\);/)[1];
const entry = (id, exerciseId = "bench", sets = 3, repGoal = 8) => ({ id, exerciseId, exerciseName: exerciseId === "bench" ? "Bench Press" : "Row", sets, target: { kind: "reps", reps: repGoal } });
const draft = () => ({ name: "  My training day  ", schedule: { mode: "cycle", startDate: "2026-09-01" }, days: [{ id: "day-1", name: "", kind: "training", exercises: [entry("first", "bench", 4, 10), entry("second", "row", 3, 12), entry("third", "bench", 2, 6)] }] });
const withExercises = (program, exercises) => ({ ...program, days: program.days.map((day, index) => index === 0 ? { ...day, exercises } : day) });
function setup(t, platform) {
  state.platform.OS = platform; state.values.clear(); state.failWrite = false;
  state.values.set("orca9.trainingSchemaVersion", "6");
  state.sql = new DatabaseSync(":memory:"); state.sql.exec("PRAGMA foreign_keys = ON;"); state.sql.exec(schema);
  t.after(() => state.sql.close());
}

for (const platform of ["web", "ios"]) for (const starter of STARTER_PROGRAMS) {
  test(`${platform}: ${starter.name} protects unlogged rest days but breaks the streak after an unlogged training day`, async (t) => {
    setup(t, platform);
    t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 8, 7, 12).getTime() });
    const clock = (offset) => t.mock.timers.setTime(new Date(2026, 8, 7 + offset, 12).getTime());
    const copy = () => createStarterProgram(starter.id, "2026-09-07", starterCatalog, (prefix) => `${prefix}-${++state.nextId}`);
    assert.deepEqual(await programs.getProgramLibrary(), { programs: [], activeProgramId: null }, "browsing definitions never seeds storage");
    const saved = await programs.saveTrainingProgram(copy());
    assert.deepEqual((await programs.getTrainingProgram(saved.id)).days, saved.days);
    assert.equal((await programs.getProgramLibrary()).activeProgramId, null);
    assert.deepEqual(await programs.getProgramScheduleHistory(), []);
    assert.equal((await streaks.getStreakSummary()).currentStreak, 0);
    await programs.setActiveTrainingProgram(saved.id);
    for (let offset = 0; offset < 8; offset++) {
      clock(offset);
      const date = localDateKey();
      const day = saved.days[getScheduledDayIndex(saved.schedule, saved.days.length, date)];
      if (day.kind === "training") {
        const session = await workouts.createWorkoutSession({ followActiveProgram: true });
        assert.deepEqual(session.programPlan.exercises, day.exercises);
        assert.deepEqual(session.exercises, [], "prescriptions are not completed sets");
        await workouts.addExerciseToWorkoutSession({ sessionId: session.id, exercise: { id: "bench", name: "Bench Press", image: 1 }, sets: 2, reps: 8, weight: 50 });
        await workouts.completeWorkoutSession(session.id);
      }
      // No manual rest record or workout is written on any scheduled rest day.
    }
    const before = await streaks.getStreakSummary();
    assert.equal(before.currentStreak, 8, "rest days are recovered even without opening the app");
    assert.ok(before.currentRestDays > 0);
    clock(8); // Tuesday is a training day in all three presets from this anchor.
    const unfinished = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.ok(unfinished.programPlan);
    assert.deepEqual(unfinished.exercises, []);
    const openDay = await streaks.getStreakSummary();
    assert.equal(openDay.todayStatus, "open");
    assert.equal(openDay.currentStreak, 8, "today is not missed until midnight");
    // Saving another copy must not replace the active schedule or unfinished session.
    const history = await programs.getProgramScheduleHistory();
    const another = await programs.saveTrainingProgram(copy());
    assert.notEqual(another.id, saved.id);
    assert.equal((await programs.getProgramLibrary()).activeProgramId, saved.id);
    assert.deepEqual(await programs.getProgramScheduleHistory(), history);
    assert.deepEqual(await workouts.getActiveWorkoutSession(), unfinished);
    clock(9);
    const after = await streaks.getStreakSummary();
    const restToday = saved.days[getScheduledDayIndex(saved.schedule, saved.days.length)].kind === "rest";
    assert.equal(after.currentStreak, restToday ? 1 : 0, "a later rest day cannot bridge the missed workout");
    assert.equal(after.currentActiveDays, 0);
    assert.equal(after.currentRestDays, restToday ? 1 : 0);
    assert.equal(after.bestStreak, 8);
    assert.ok(!after.activeDates.includes("2026-09-15"), "unlogged training is never automatic rest");
  });
}

for (const platform of ["web", "ios"]) test(`${platform}: saving an imported draft preserves active program, workout and streak history`, async (t) => {
  setup(t, platform);
  const existing = await programs.saveTrainingProgram(draft());
  await programs.setActiveTrainingProgram(existing.id);
  await workouts.createWorkoutSession({ followActiveProgram: true });
  const before = { active: await workouts.getActiveWorkoutSession(), history: await programs.getProgramScheduleHistory(), streak: await streaks.getStreakSummary() };
  const imported = parseProgramImport("Program: Imported\nMonday\nBench Press 3 x 8-12\nTuesday - Rest\nWednesday\nRow 2 x 45 sec", [{ id: "bench", name: "Bench Press" }, { id: "row", name: "Row" }]);
  const saved = await programs.saveTrainingProgram(validateImportExercises(imported.draft));
  assert.equal((await programs.getProgramLibrary()).activeProgramId, existing.id);
  assert.deepEqual(await workouts.getActiveWorkoutSession(), before.active);
  assert.deepEqual(await programs.getProgramScheduleHistory(), before.history);
  assert.deepEqual(await streaks.getStreakSummary(), before.streak);
  const reloaded = await programs.getTrainingProgram(saved.id);
  assert.deepEqual(reloaded.days[0].exercises[0].target, { kind: "repRange", min: 8, max: 12 });
  assert.deepEqual(reloaded.days[2].exercises[0].target, { kind: "duration", seconds: 45 });
});

test("program targets validate whole-number ranges, names, identities and empty programs", () => {
  assert.equal(validateProgram(draft()).name, "My training day");
  assert.throws(() => validateProgram({ ...draft(), name: " " }), /name/);
  assert.throws(() => validateProgram({ ...draft(), name: "x".repeat(81) }), /80/);
  assert.throws(() => validateProgram(withExercises(draft(), [])), /at least one/);
  for (const sets of [0, -1, 13, 1.5, NaN, Infinity]) assert.throws(() => validateProgram(withExercises(draft(), [entry("x", "bench", sets)])), /sets/);
  for (const reps of [0, -1, 101, 1.5, NaN, Infinity]) assert.throws(() => validateProgram(withExercises(draft(), [entry("x", "bench", 3, reps)])), /rep goal/);
  assert.equal(validateProgram(withExercises(draft(), [entry("x", "bench", 12, 100)])).days[0].exercises[0].target.reps, 100);
  assert.throws(() => validateProgram(withExercises(draft(), [entry("x"), entry("x")])), /invalid/);
  assert.throws(() => validateProgram(withExercises(draft(), Array.from({ length: 101 }, (_, i) => entry(String(i))))), /up to 100/);
  assert.equal(isTrainingProgram({ ...draft(), id: "x", createdAt: "today", updatedAt: "today" }), false);
  assert.equal(parseWorkoutProgramPlan({ programId: "x", programName: "Invalid", exercises: [null] }), null);
});

test("rep ranges and durations validate strictly and display with explicit units", () => {
  for (const target of [{ kind: "repRange", min: 1, max: 100 }, { kind: "repRange", min: 8, max: 8 }, { kind: "duration", seconds: 1 }, { kind: "duration", seconds: 3600 }]) {
    assert.deepEqual(validateExerciseTarget(target), target);
    assert.notEqual(validateExerciseTarget(target), target, "targets are copied for immutable snapshots");
  }
  for (const target of [null, {}, { kind: "unknown" }, { kind: "repRange", min: 12, max: 8 }, { kind: "repRange", min: 0, max: 8 }, { kind: "repRange", min: 8, max: 101 }, { kind: "repRange", min: 8.5, max: 12 }, { kind: "repRange", min: 8, max: "12" }, ...[0, -1, 3601, 1.5, NaN, Infinity, "45"].map((seconds) => ({ kind: "duration", seconds }))]) assert.throws(() => validateExerciseTarget(target));
  assert.equal(formatExerciseTarget({ kind: "reps", reps: 8 }), "8 reps");
  assert.equal(formatExerciseTarget({ kind: "repRange", min: 8, max: 12 }), "8–12 reps");
  assert.equal(formatProgramPrescription({ ...entry("plank"), target: { kind: "duration", seconds: 90 } }), "3 × 1 min 30 sec");
  assert.equal(formatExerciseTarget({ kind: "duration", seconds: 45 }), "45 sec");
  assert.equal(formatExerciseTarget({ kind: "duration", seconds: 3600 }), "60 min");
});

test("separate target choices preserve their selected type and initialize valid goals without mutating saved targets", () => {
  const exact = { kind: "reps", reps: 8 };
  const ranged = changeExerciseTargetKind(exact, "repRange");
  assert.deepEqual(ranged, { kind: "repRange", min: 8, max: 12 });
  assert.equal(changeExerciseTargetKind(ranged, "repRange"), ranged);
  assert.deepEqual(changeExerciseTargetKind(ranged, "reps"), exact);
  assert.deepEqual(changeExerciseTargetKind(exact, "duration"), { kind: "duration", seconds: 45 });
  assert.deepEqual(changeExerciseTargetKind({ kind: "duration", seconds: 90 }, "reps"), exact);
  assert.deepEqual(changeExerciseTargetKind({ kind: "reps", reps: 100 }, "repRange"), { kind: "repRange", min: 100, max: 100 });
  assert.deepEqual(changeExerciseTargetKind({ kind: "reps", reps: NaN }, "repRange"), ranged);
  assert.deepEqual(exact, { kind: "reps", reps: 8 });
  assert.deepEqual(ranged, { kind: "repRange", min: 8, max: 12 });
  assert.equal(validateExerciseTarget({ kind: "repRange", min: 8, max: 8 }).kind, "repRange");
  assert.equal(formatExerciseTarget({ kind: "repRange", min: 8, max: 8 }), "8–8 reps");
});

test("number steppers increment by one, respect rep/time bounds, and recover cleared or invalid inputs", () => {
  assert.equal(stepGoalValue(8, 1, 1, 100), 9);
  assert.equal(stepGoalValue(8, -1, 1, 100), 7);
  assert.equal(stepGoalValue(100, 1, 1, 100), 100);
  assert.equal(stepGoalValue(1, -1, 1, 100), 1);
  assert.equal(stepGoalValue(0, -1, 0, 59), 0);
  assert.equal(stepGoalValue(59, 1, 0, 59), 59);
  assert.equal(stepGoalValue(60, 1, 0, 60), 60);
  assert.equal(stepGoalValue(45, 1, 0, 59), 46);
  assert.equal(stepGoalValue(45, -1, 0, 59), 44);
  assert.equal(stepGoalValue(NaN, 1, 1, 100), 1);
  assert.equal(stepGoalValue(NaN, -1, 0, 59), 0);
  assert.equal(stepGoalValue(999, -1, 0, 59), 59);
});

test("current exact-rep programs and snapshots upgrade without accepting older unset-day plans", () => {
  const legacyEntry = { id: "exact", exerciseId: "bench", exerciseName: "Bench Press", sets: 3, repGoal: 8 };
  const saved = { ...withExercises(draft(), [legacyEntry]), id: "existing", createdAt: "2026-09-06T12:00:00Z", updatedAt: "2026-09-06T12:00:00Z" };
  assert.deepEqual(parseTrainingProgram(saved).days[0].exercises[0].target, { kind: "reps", reps: 8 });
  assert.equal("repGoal" in parseTrainingProgram(saved).days[0].exercises[0], false);
  assert.deepEqual(parseWorkoutProgramPlan({ programId: "existing", programName: "Kept", dayId: "day", dayName: "Day 1", exercises: [legacyEntry] }).exercises[0].target, { kind: "reps", reps: 8 });
  assert.equal(parseTrainingProgram({ ...saved, days: [{ ...saved.days[0], kind: "off" }] }), null);
  assert.equal(parseTrainingProgram({ ...saved, days: null }), null);
  assert.throws(() => validateProgram(saved), /rep goal/, "new writes require typed targets");
});

test("reordering is immutable, preserves targets and supports duplicate lifts with separate entries", () => {
  const source = draft().days[0].exercises;
  const reordered = moveProgramExercise(source, 2, 0);
  assert.deepEqual(reordered.map((item) => item.id), ["third", "first", "second"]);
  assert.deepEqual(reordered.map((item) => [item.sets, item.target.reps]), [[2, 6], [4, 10], [3, 12]]);
  assert.deepEqual(source.map((item) => item.id), ["first", "second", "third"]);
  assert.deepEqual(moveProgramExercise(reordered, 0, 2), source);
  for (const [from, to] of [[-1, 0], [0, -1], [3, 0], [0, 3], [0.5, 1], [0, 0]]) assert.deepEqual(moveProgramExercise(source, from, to), source);
});

test("drag destinations use measured centers, handle different row heights and clamp at list ends", () => {
  const frames = [{ y: 0, height: 200 }, { y: 218, height: 240 }, { y: 476, height: 200 }];
  assert.equal(getDragTargetIndex(frames, 0, 0), 0);
  assert.equal(getDragTargetIndex(frames, 0, 239), 1);
  assert.equal(getDragTargetIndex(frames, 0, 900), 2);
  assert.equal(getDragTargetIndex(frames, 2, -900), 0);
  assert.equal(getDragTargetIndex(frames, 1, 100), 1);
  const uneven = [{ y: 0, height: 300 }, { y: 318, height: 180 }];
  assert.equal(getDragTargetIndex(uneven, 0, clampDragTranslation(uneven, 0, 999)), 1, "a taller row can reach the final slot");
  assert.equal(getDragTargetIndex(uneven, 1, clampDragTranslation(uneven, 1, -999)), 0);
});

for (const platform of ["web", "ios"]) {
  test(`${platform}: create, reload, edit order and goals, concurrent saves and delete programs`, async (t) => {
    setup(t, platform);
    assert.deepEqual(await programs.getTrainingPrograms(), []);
    const saved = await programs.saveTrainingProgram(draft());
    assert.deepEqual(await programs.getTrainingProgram(saved.id), saved);
    const updated = await programs.saveTrainingProgram({ ...withExercises(saved, moveProgramExercise(saved.days[0].exercises, 2, 0)), name: "Renamed day" });
    assert.equal(updated.createdAt, saved.createdAt);
    assert.deepEqual((await programs.getTrainingProgram(saved.id)).days[0].exercises.map((item) => item.id), ["third", "first", "second"]);
    await Promise.all([programs.saveTrainingProgram({ ...draft(), name: "Day 2" }), programs.saveTrainingProgram({ ...draft(), name: "Day 3" })]);
    assert.equal((await programs.getTrainingPrograms()).length, 3);
    await programs.deleteTrainingProgram(saved.id);
    assert.equal(await programs.getTrainingProgram(saved.id), null);
    assert.equal((await programs.getTrainingPrograms()).length, 2);
    await assert.rejects(programs.saveTrainingProgram(saved), /no longer exists/);
  });

  test(`${platform}: program workouts persist a snapshot and queue goals without inventing completed sets`, async (t) => {
    setup(t, platform);
    const saved = await programs.saveTrainingProgram(draft());
    const snapshot = toWorkoutProgramPlan(saved);
    const session = await workouts.createWorkoutSession({ programPlan: snapshot });
    assert.deepEqual(session.exercises, []);
    assert.equal(getPendingProgramExercises(session.programPlan, []).length, 3);
    assert.deepEqual(await workouts.getProgressVolumeSeries(), []);
    assert.equal((await streaks.getStreakSummary()).currentStreak, 0);
    await assert.rejects(workouts.createWorkoutSession({ programPlan: snapshot }), /active workout/);
    assert.equal((await workouts.getActiveWorkoutSession()).id, session.id);
    await programs.saveTrainingProgram(withExercises(saved, [entry("new", "row")]));
    await programs.deleteTrainingProgram(saved.id);
    assert.deepEqual((await workouts.getActiveWorkoutSession()).programPlan, snapshot, "edits/deletes do not alter an active workout");
    const logged = await workouts.addExerciseToWorkoutSession({ sessionId: session.id, exercise: { id: "bench", name: "Bench Press", image: 1 }, programEntryId: "first", sets: 2, reps: 6, weight: 100 });
    const restored = await workouts.getActiveWorkoutSession();
    assert.equal(restored.exercises[0].programEntryId, "first");
    assert.deepEqual(getPendingProgramExercises(restored.programPlan, restored.exercises).map((item) => item.id), ["second", "third"]);
    await workouts.deleteWorkoutExercise(logged.id);
    assert.equal(getPendingProgramExercises(restored.programPlan, (await workouts.getActiveWorkoutSession()).exercises).length, 3);
    await workouts.addExerciseToWorkoutSession({ sessionId: session.id, exercise: { id: "bench", name: "Bench Press", image: 1 }, programEntryId: "first", sets: 2, reps: 6, weight: 100 });
    await workouts.completeWorkoutSession(session.id);
    assert.equal((await workouts.getProgressVolumeSeries())[0].volume, 1200, "charts use actual logged results, not the program's 4 × 10 target");
    assert.equal((await streaks.getStreakSummary()).currentStreak, 1);
    assert.equal(await workouts.getActiveWorkoutSession(), null);
  });

  test(`${platform}: failed program writes retain the saved version and allow retry`, async (t) => {
    setup(t, platform);
    const saved = await programs.saveTrainingProgram(draft());
    state.failWrite = true;
    await assert.rejects(programs.saveTrainingProgram({ ...saved, name: "Changed" }), /Disk full/);
    assert.equal((await programs.getTrainingProgram(saved.id)).name, saved.name);
    state.failWrite = false;
    assert.equal((await programs.saveTrainingProgram({ ...saved, name: "Changed" })).name, "Changed");
  });
}

test("corrupt program storage is reported and never silently replaced", async (t) => {
  setup(t, "web");
  for (const value of ["broken-json", "{}", '[{"id":"bad"}]']) {
    state.values.set("orca9.programLibrary.v3", value);
    await assert.rejects(programs.getTrainingPrograms(), /Nothing has been overwritten/);
    await assert.rejects(programs.saveTrainingProgram(draft()), /Nothing has been overwritten/);
    assert.equal(state.values.get("orca9.programLibrary.v3"), value);
  }
});

test("prelaunch SQLite reset clears training once, preserves profiles, and rolls back on failure", async (t) => {
  setup(t, "ios");
  state.sql.exec("PRAGMA user_version = 5; CREATE TABLE training_programs (id TEXT PRIMARY KEY); INSERT INTO training_programs VALUES ('old-plan');");
  state.sql.exec("INSERT INTO user_profiles (id, display_name, goal, experience_level, created_at, updated_at) VALUES ('profile', 'Kept', 'strength', 'beginner', '2026-09-01', '2026-09-01');");
  state.sql.exec("INSERT INTO workout_sessions (id, profile_id, started_at, created_at, updated_at) VALUES ('old', 'profile', '2026-09-01', '2026-09-01', '2026-09-01');");
  state.sql.exec("INSERT INTO workout_exercises (id, workout_session_id, exercise_name_snapshot, exercise_order, saved_at, created_at, updated_at) VALUES ('exercise', 'old', 'Bench', 0, '2026-09-01', '2026-09-01', '2026-09-01');");
  state.sql.exec("INSERT INTO set_entries (id, workout_exercise_id, set_number, weight, reps, duration_seconds, completed_at, created_at, updated_at) VALUES ('set', 'exercise', 1, 100, 8, NULL, '2026-09-01', '2026-09-01', '2026-09-01');");
  state.sql.exec("INSERT INTO consistency_days VALUES ('2026-09-02', 'rest', '2026-09-02'); INSERT INTO program_library VALUES (1, 'old data');");
  const { initializeDatabase } = await import("../src/storage/database.ts");
  const failingDatabase = { ...state.database, async execAsync(sql) { if (sql.includes("CREATE TABLE")) throw new Error("Disk full"); return state.database.execAsync(sql); } };
  await assert.rejects(initializeDatabase(failingDatabase), /Disk full/);
  assert.equal(state.sql.prepare("PRAGMA user_version").get().user_version, 5);
  assert.equal(state.sql.prepare("SELECT COUNT(*) AS n FROM set_entries").get().n, 1, "failed reset rolls back old data");
  await initializeDatabase(state.database);
  assert.equal(state.sql.prepare("PRAGMA user_version").get().user_version, 8);
  for (const table of ["workout_sessions", "workout_exercises", "set_entries", "consistency_days", "program_library"]) assert.equal(state.sql.prepare("SELECT COUNT(*) AS n FROM " + table).get().n, 0);
  assert.equal(state.sql.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'training_programs'").get().n, 0);
  assert.equal(state.sql.prepare("SELECT display_name FROM user_profiles WHERE id = 'profile'").get().display_name, "Kept");
  await programs.saveTrainingProgram(draft());
  await streaks.markTodayAsRestDay();
  await initializeDatabase(state.database);
  assert.equal((await programs.getTrainingPrograms()).length, 1, "subsequent launches keep new programs");
  assert.equal((await streaks.getStreakSummary()).todayStatus, "rest");
});

const scheduled = (mode = "cycle", startDate = "2026-09-01", kinds = ["training", "rest", "training", "training"]) => ({
  name: "My split", schedule: { mode, startDate }, days: kinds.map((kind, index) => ({ id: `day-${index}`, name: kind === "training" ? `Lift ${index + 1}` : "", kind,
    exercises: kind === "training" ? [entry(`entry-${index}`, index ? "row" : "bench", index + 1, 8 + index)] : [] }))
});

test("SQLite 7 → 8 preserves sets, profiles, prescriptions and rest while adding optional coaching metadata", async (t) => {
  setup(t, "ios");
  const saved = await programs.saveTrainingProgram(draft());
  const session = await workouts.createWorkoutSession();
  await workouts.addExerciseToWorkoutSession({ sessionId: session.id, exercise: { id: "bench", name: "Bench Press", image: 1 }, sets: 3, reps: 8, weight: 100 });
  await streaks.markTodayAsRestDay();
  state.sql.exec("ALTER TABLE set_entries DROP COLUMN effort; ALTER TABLE set_entries DROP COLUMN is_warmup; ALTER TABLE workout_exercises DROP COLUMN prescription_json; PRAGMA user_version = 7;");
  const { initializeDatabase } = await import("../src/storage/database.ts");
  const failing = { ...state.database, async execAsync(sql) { if (sql.includes("ADD COLUMN is_warmup")) throw new Error("Disk full"); await state.database.execAsync(sql); } };
  await assert.rejects(initializeDatabase(failing), /Disk full/);
  assert.equal(state.sql.prepare("PRAGMA user_version").get().user_version, 7);
  assert.equal(state.sql.prepare("PRAGMA table_info(set_entries)").all().some((column) => column.name === "effort"), false, "partial migration rolls back");
  await initializeDatabase(state.database);
  await initializeDatabase(state.database);
  assert.equal(state.sql.prepare("PRAGMA user_version").get().user_version, 8);
  assert.deepEqual(await programs.getTrainingProgram(saved.id), saved);
  const restored = await workouts.getActiveWorkoutSession();
  assert.equal(restored.exercises[0].actualSets.length, 3);
  assert.equal(restored.exercises[0].actualSets[0].effort, null, "legacy effort is unknown, not easy");
  assert.equal((await streaks.getStreakSummary()).todayStatus, "rest");
});

for (const platform of ["web", "ios"]) test(`${platform}: individual sets and load settings round-trip and feed real charts/coaching only after completion`, async (t) => {
  setup(t, platform);
  const prescription = { ...entry("loaded"), load: { weight: 100, increment: 5, unit: "lb", convention: "total", equipmentKey: "Home barbell" } };
  const program = await programs.saveTrainingProgram(withExercises(draft(), [prescription]));
  assert.deepEqual((await programs.getTrainingProgram(program.id)).days[0].exercises[0].load, prescription.load);
  const session = await workouts.createWorkoutSession({ programPlan: toWorkoutProgramPlan(program) });
  const actualSets = [{ weight: 100, reps: 10, effort: "easy", warmup: true }, { weight: 110, reps: 8, effort: "moderate" }, { weight: 105, reps: 6, effort: "hard" }];
  await workouts.addExerciseToWorkoutSession({ sessionId: session.id, exercise: { id: "bench", name: "Bench Press", image: 1 }, sets: 3, reps: 10, weight: 100, actualSets, prescription });
  assert.deepEqual(await workouts.getCoachHistory(), [], "unfinished work isn't coaching evidence");
  const restored = (await workouts.getActiveWorkoutSession()).exercises[0];
  assert.deepEqual(restored.actualSets.map((set) => [set.weight, set.reps, set.effort, !!set.warmup]), actualSets.map((set) => [set.weight, set.reps, set.effort, !!set.warmup]));
  await workouts.completeWorkoutSession(session.id);
  assert.equal((await workouts.getProgressVolumeSeries())[0].volume, 2510);
  assert.equal((await workouts.getCompletedWorkoutSessions())[0].totalVolume, 2510);
  assert.equal((await workouts.getProgressAverageWeightSeries())[0].totalReps, 24);
  assert.equal((await workouts.getProgressStrengthSeries())[0].weight, 110, "strength uses a real set, not maximum weight paired with maximum reps");
  const history = await workouts.getCoachHistory(); assert.equal(history.length, 1); assert.deepEqual(history[0].prescription, prescription);
  await assert.rejects(workouts.addExerciseToWorkoutSession({ sessionId: session.id, exercise: { id: "bench", name: "Bench Press", image: 1 }, sets: 1, reps: 8, weight: 100 }), /no longer active/);
});

test("actual-set validation rejects malformed feedback, mixed measurement types, and invalid values", () => {
  for (const sets of [[], [{ reps: 8, weight: NaN }], [{ reps: 8, weight: 100, effort: "unknown-command" }], [{ reps: 8, weight: 100, warmup: "false" }], [{ reps: 8, weight: 100 }, { reps: 0, weight: 0, durationSeconds: 30 }]]) assert.throws(() => workouts.validateActualSets(sets));
});

test("SQLite 6 → 8 adds durations and coaching transactionally without resetting current workouts, programs or rest days", async (t) => {
  setup(t, "ios");
  state.sql.exec("ALTER TABLE set_entries DROP COLUMN duration_seconds; PRAGMA user_version = 6;");
  const program = await programs.saveTrainingProgram(draft());
  const session = await workouts.createWorkoutSession();
  state.sql.exec(`INSERT INTO workout_exercises (id, workout_session_id, exercise_id, custom_exercise_name, exercise_name_snapshot, exercise_order, program_entry_id, saved_at, created_at, updated_at) VALUES ('kept-exercise', '${session.id}', 'bench', NULL, 'Bench Press', 0, NULL, '2026-09-06', '2026-09-06', '2026-09-06');
    INSERT INTO set_entries (id, workout_exercise_id, set_number, weight, reps, completed_at, created_at, updated_at) VALUES ('kept-set', 'kept-exercise', 1, 100, 8, '2026-09-06', '2026-09-06', '2026-09-06');`);
  await streaks.markTodayAsRestDay();
  const { initializeDatabase } = await import("../src/storage/database.ts");
  const failingDatabase = { ...state.database, execAsync: async (sql) => {
    if (sql.includes("ALTER TABLE set_entries ADD")) throw new Error("Migration failed");
    await state.database.execAsync(sql);
  } };
  await assert.rejects(initializeDatabase(failingDatabase), /Migration failed/);
  assert.equal(state.sql.prepare("PRAGMA user_version").get().user_version, 6);
  assert.equal(state.sql.prepare("SELECT COUNT(*) AS n FROM set_entries").get().n, 1);
  await initializeDatabase(state.database);
  assert.equal(state.sql.prepare("PRAGMA user_version").get().user_version, 8);
  assert.deepEqual(await programs.getTrainingProgram(program.id), program);
  const restored = await workouts.getActiveWorkoutSession();
  assert.equal(restored.exercises[0].reps, 8);
  assert.equal(restored.exercises[0].durationSeconds, null);
  assert.equal((await streaks.getStreakSummary()).todayStatus, "rest");
  await workouts.addExerciseToWorkoutSession({ sessionId: session.id, exercise: { id: "plank", name: "Plank", image: 1 }, sets: 3, reps: 0, weight: 0, durationSeconds: 45 });
  await initializeDatabase(state.database);
  assert.equal((await workouts.getActiveWorkoutSession()).exercises[1].durationSeconds, 45);
  assert.equal(state.sql.prepare("SELECT COUNT(*) AS n FROM set_entries").get().n, 4);
});

for (const platform of ["web", "ios"]) {
  test(`${platform}: range/time targets persist, snapshots are independent, and timed work never generates rep-based metrics`, async (t) => {
    setup(t, platform);
    const ranged = { ...entry("range"), target: { kind: "repRange", min: 8, max: 12 } };
    const timed = { ...entry("timed", "plank"), target: { kind: "duration", seconds: 90 } };
    const saved = await programs.saveTrainingProgram(withExercises(draft(), [ranged, timed]));
    assert.deepEqual((await programs.getTrainingProgram(saved.id)).days[0].exercises, [ranged, timed]);
    const plan = toWorkoutProgramPlan(saved);
    saved.days[0].exercises[0].target.min = 3;
    assert.equal(plan.exercises[0].target.min, 8);
    const session = await workouts.createWorkoutSession({ programPlan: plan });
    plan.exercises[1].target.seconds = 60;
    assert.equal((await workouts.getActiveWorkoutSession()).programPlan.exercises[1].target.seconds, 90);
    const base = { sessionId: session.id, exercise: { id: "plank", name: "Plank", image: 1 }, sets: 3, reps: 0, weight: 500, durationSeconds: 45, programEntryId: "timed" };
    for (const patch of [{ sets: 0 }, { sets: 1.5 }, { reps: 8 }, { durationSeconds: 0 }, { durationSeconds: 3601 }, { durationSeconds: 1.5 }, { durationSeconds: NaN }, { weight: -1 }, { weight: Infinity }]) await assert.rejects(workouts.addExerciseToWorkoutSession({ ...base, ...patch }));
    assert.equal((await workouts.getActiveWorkoutSession()).exercises.length, 0, "invalid measurements cannot write partial rows");
    await workouts.addExerciseToWorkoutSession(base);
    const restored = await workouts.getActiveWorkoutSession();
    assert.equal(restored.exercises[0].durationSeconds, 45, "actual time may differ from the plan");
    assert.equal(restored.exercises[0].reps, 0);
    assert.deepEqual(getPendingProgramExercises(restored.programPlan, restored.exercises).map((entry) => entry.id), ["range"]);
    await workouts.completeWorkoutSession(session.id);
    assert.deepEqual(await workouts.getProgressStrengthSeries(), []);
    assert.deepEqual(await workouts.getProgressVolumeSeries(), []);
    assert.deepEqual(await workouts.getProgressAverageWeightSeries(), []);
    assert.deepEqual(await workouts.getProgressLiftOptions(), []);
    const [history] = await workouts.getCompletedWorkoutSessions();
    assert.equal(history.totalDurationSeconds, 135);
    assert.equal(history.totalSets, 3);
    assert.equal(history.totalVolume, 0);
    assert.equal((await streaks.getStreakSummary()).todayStatus, "workout");
    const mixed = await workouts.createWorkoutSession({ programPlan: toWorkoutProgramPlan(saved) });
    await workouts.addExerciseToWorkoutSession({ ...base, sessionId: mixed.id, durationSeconds: 90 });
    await workouts.addExerciseToWorkoutSession({ sessionId: mixed.id, exercise: { id: "bench", name: "Bench Press", image: 1 }, sets: 2, reps: 7, weight: 100, programEntryId: "range" });
    await workouts.completeWorkoutSession(mixed.id);
    assert.equal((await workouts.getProgressStrengthSeries())[0].exerciseName, "Bench Press");
    assert.equal((await workouts.getProgressVolumeSeries())[0].volume, 1400);
    assert.equal((await workouts.getProgressAverageWeightSeries())[0].totalReps, 14);
    assert.equal((await workouts.getProgressAverageWeightSeries())[0].averageWeight, 100);
    for (const getSeries of [workouts.getProgressVolumeSeries, workouts.getProgressAverageWeightSeries, workouts.getProgressStrengthSeries]) assert.deepEqual(await getSeries({ liftKey: "plank" }), []);
    assert.deepEqual((await workouts.getProgressLiftOptions()).map((lift) => lift.key), ["bench"]);
  });
}

test("multi-day validation requires training targets and valid dates, lengths, and day IDs", () => {
  const value = scheduled();
  assert.equal(validateProgram(value).days.length, 4);
  assert.throws(() => validateProgram({ ...value, days: [] }), /1–28/);
  assert.throws(() => validateProgram(scheduled("weekly")), /7 weekdays/);
  for (const startDate of ["2026-02-30", "2025-02-29", "bad", "2026-9-01"]) assert.throws(() => validateProgram({ ...value, schedule: { mode: "cycle", startDate } }), /valid start date/);
  assert.ok(Number.isFinite(dateOrdinal("2028-02-29")));
  assert.throws(() => validateProgram(scheduled("cycle", "2026-09-01", ["rest", "rest"])), /at least one training/);
  assert.deepEqual(PROGRAM_DAY_CHOICES, ["training", "rest"]);
  assert.throws(() => validateProgram(scheduled("cycle", "2026-09-01", ["training", "off"])), /Day 2: choose Training or Rest/);
  assert.throws(() => validateProgram(withExercises(value, [])), /Day 1.*at least one exercise/);
  assert.throws(() => validateProgram({ ...value, days: [value.days[0], value.days[0]] }), /invalid/);
  assert.throws(() => validateProgram(scheduled("cycle", "2026-09-01", Array(29).fill("training"))), /1–28/);
});

test("weekdays map Monday–Sunday; cycles repeat by calendar day across DST and leap days", () => {
  const weekly = { mode: "weekly", startDate: "2026-09-02" };
  assert.equal(getScheduledDayIndex(weekly, 7, "2026-09-01"), -1);
  assert.equal(getScheduledDayIndex(weekly, 7, "2026-09-02"), 2);
  assert.equal(getScheduledDayIndex(weekly, 7, "2026-09-06"), 6);
  assert.equal(getScheduledDayIndex(weekly, 7, "2026-09-07"), 0);
  for (const [startDate, next, following] of [["2026-03-07", "2026-03-08", "2026-03-09"], ["2026-10-31", "2026-11-01", "2026-11-02"], ["2028-02-28", "2028-02-29", "2028-03-01"], ["2026-12-31", "2027-01-01", "2027-01-02"]]) {
    const cycle = { mode: "cycle", startDate };
    assert.equal(getScheduledDayIndex(cycle, 2, startDate), 0);
    assert.equal(getScheduledDayIndex(cycle, 2, next), 1);
    assert.equal(getScheduledDayIndex(cycle, 2, following), 0);
  }
});

test("rest protection starts on activation, survives edits, stops at switch dates and excludes future days", () => {
  const program = { ...scheduled(), id: "split" };
  let history = reviseSchedule([], program, "2026-09-02");
  assert.deepEqual(getScheduledRestDates(history, "2026-09-01"), []);
  assert.deepEqual(getScheduledRestDates(history, "2026-09-06"), ["2026-09-02", "2026-09-06"]);
  history = reviseSchedule(history, { ...program, days: program.days.map((day) => day.kind === "rest" ? { ...day, kind: "training", exercises: [entry("replacement")] } : day) }, "2026-09-06");
  assert.deepEqual(getScheduledRestDates(history, "2026-09-12"), ["2026-09-02"]);
  history = reviseSchedule(history, program, "2026-09-08");
  history = reviseSchedule(history, null, "2026-09-11");
  assert.deepEqual(getScheduledRestDates(history, "2026-09-30"), ["2026-09-02", "2026-09-10"]);
  assert.throws(() => reviseSchedule(history, program, "2026-09-01"), /device date/);
  assert.deepEqual(getScheduledRestDates(reviseSchedule([], { ...program, schedule: { mode: "cycle", startDate: "2026-10-01" } }, "2026-09-01"), "2026-09-30"), []);
  assert.equal(streaks.calculateStreakSummary(["2026-09-01", "2026-09-03"], ["2026-09-02", "2026-10-01"], new Date(2026, 8, 4, 12)).currentStreak, 3);
  assert.equal(streaks.calculateStreakSummary(["2026-09-01", "2026-09-03"], ["2026-09-02"], new Date(2026, 8, 5, 12)).currentStreak, 0);
});

for (const platform of ["web", "ios"]) {
  test(`${platform}: day-specific workouts, schedule activation, rest streaks, edits and deletion persist atomically`, async (t) => {
    setup(t, platform);
    t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 8, 2, 12).getTime() });
    const saved = await programs.saveTrainingProgram(scheduled());
    assert.equal((await streaks.getStreakSummary()).todayStatus, "open", "saving alone does not follow a schedule");
    await programs.setActiveTrainingProgram(saved.id);
    assert.equal((await streaks.getStreakSummary()).todayStatus, "rest");
    assert.deepEqual((await streaks.getStreakSummary()).activeDates, ["2026-09-02"], "does not backfill earlier days");
    assert.throws(() => toWorkoutProgramPlan(saved, "day-1"), /training day/);
    const snapshot = toWorkoutProgramPlan(saved, "day-2");
    assert.equal(snapshot.dayName, "Lift 3");
    assert.deepEqual(snapshot.exercises, saved.days[2].exercises);
    const session = await workouts.createWorkoutSession({ programPlan: snapshot });
    assert.deepEqual((await workouts.getActiveWorkoutSession()).programPlan, snapshot);
    assert.deepEqual(session.exercises, []);
    assert.deepEqual(await workouts.getProgressVolumeSeries(), []);
    t.mock.timers.setTime(new Date(2026, 8, 6, 12).getTime());
    assert.deepEqual((await streaks.getStreakSummary()).activeDates, ["2026-09-02", "2026-09-06"], "planned rest is recovered even when the app was closed");
    const updated = { ...saved, days: saved.days.map((day) => day.kind === "rest" ? { ...day, kind: "training", exercises: [entry("new-lift")] } : day) };
    state.failWrite = true;
    await assert.rejects(programs.saveTrainingProgram(updated), /Disk full/);
    assert.equal((await streaks.getStreakSummary()).todayStatus, "rest", "failed edits cannot partially change the active schedule");
    state.failWrite = false;
    await programs.saveTrainingProgram(updated);
    assert.deepEqual((await streaks.getStreakSummary()).activeDates, ["2026-09-02"], "edits apply from today, not before");
    await streaks.markTodayAsRestDay();
    await programs.deleteTrainingProgram(saved.id);
    assert.equal((await programs.getProgramLibrary()).activeProgramId, null);
    assert.deepEqual((await workouts.getActiveWorkoutSession()).programPlan, snapshot);
    assert.deepEqual((await streaks.getStreakSummary()).activeDates, ["2026-09-02", "2026-09-06"], "historical and manual rest survive deletion");
  });
}

test("malformed current schedule history never overwrites saved data", async (t) => {
  setup(t, "web");
  const saved = await programs.saveTrainingProgram(scheduled());
  const corrupt = JSON.stringify({ version: 3, programs: [saved], history: [{ effectiveFrom: "2026-09-01", programId: saved.id, schedule: saved.schedule, dayKinds: ["invalid"] }] });
  state.values.set("orca9.programLibrary.v3", corrupt);
  await assert.rejects(programs.setActiveTrainingProgram(saved.id), /Nothing has been overwritten/);
  await assert.rejects(programs.deleteTrainingProgram(saved.id), /Nothing has been overwritten/);
  assert.equal(state.values.get("orca9.programLibrary.v3"), corrupt);
});

for (const platform of ["web", "ios"]) {
  test(`${platform}: Start Session loads the current cycle day, protects rest days, and preserves unfinished workouts across days and program-off`, async (t) => {
    setup(t, platform);
    const clock = (day) => t.mock.timers.setTime(new Date(2026, 8, day, 12).getTime());
    t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 8, 1, 12).getTime() });
    const saved = await programs.saveTrainingProgram(scheduled("cycle", "2026-09-01", ["training", "rest", "training"]));
    assert.equal((await programs.getProgramLibrary()).activeProgramId, null, "saving alone does not turn a program on");
    await programs.setActiveTrainingProgram(saved.id);
    const [first, duplicate] = await Promise.all([workouts.createWorkoutSession({ followActiveProgram: true }), workouts.createWorkoutSession({ followActiveProgram: true })]);
    assert.equal(first.id, duplicate.id, "double taps cannot create separate sessions");
    assert.equal(first.programPlan.dayId, "day-0");
    assert.deepEqual(first.programPlan.exercises, saved.days[0].exercises);
    assert.deepEqual(first.exercises, [], "planned exercises are not completed work");
    assert.equal((await streaks.getStreakSummary()).currentStreak, 0);
    const log = async (sessionId) => workouts.addExerciseToWorkoutSession({ sessionId, exercise: { id: "bench", name: "Bench Press", image: 1 }, sets: 2, reps: 7, weight: 100 });
    await log(first.id);
    await workouts.completeWorkoutSession(first.id);
    clock(2);
    const rest = await streaks.getStreakSummary();
    assert.deepEqual([rest.currentStreak, rest.currentActiveDays, rest.currentRestDays], [2, 1, 1]);
    const free = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(free.programPlan, null, "a rest day does not load another day's exercises");
    clock(3);
    assert.equal((await workouts.createWorkoutSession({ followActiveProgram: true })).id, free.id, "new calendar days never replace an unfinished session");
    await log(free.id); await workouts.completeWorkoutSession(free.id);
    const third = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(third.programPlan.dayId, "day-2");
    assert.equal(third.programPlan.exercises[0].exerciseId, "row");
    const summary = await streaks.getStreakSummary();
    assert.deepEqual([summary.currentStreak, summary.currentActiveDays, summary.currentRestDays], [3, 2, 1]);
    clock(4);
    await programs.setActiveTrainingProgram(null);
    const restored = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(restored.id, third.id);
    assert.deepEqual(restored.programPlan, third.programPlan, "turning off keeps the active snapshot");
    await log(third.id); await workouts.completeWorkoutSession(third.id);
    assert.equal((await workouts.createWorkoutSession({ followActiveProgram: true })).programPlan, null, "the next session is unplanned when the program is off");
  });

  test(`${platform}: automatic starts honor future dates, program switches, and the actual weekday`, async (t) => {
    setup(t, platform);
    t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 8, 2, 12).getTime() });
    const future = await programs.saveTrainingProgram(scheduled("cycle", "2026-09-10", ["training", "rest"]));
    await programs.setActiveTrainingProgram(future.id);
    const free = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(free.programPlan, null);
    assert.equal((await streaks.getStreakSummary()).currentStreak, 0);
    await workouts.addExerciseToWorkoutSession({ sessionId: free.id, exercise: { id: "bench", name: "Bench Press", image: 1 }, sets: 1, reps: 5, weight: 100 });
    await workouts.completeWorkoutSession(free.id);
    const weekly = await programs.saveTrainingProgram(scheduled("weekly", "2026-09-01", ["training", "rest", "training", "rest", "training", "rest", "rest"]));
    await programs.setActiveTrainingProgram(weekly.id);
    assert.equal((await programs.getProgramLibrary()).activeProgramId, weekly.id);
    const wednesday = await workouts.createWorkoutSession({ followActiveProgram: true });
    assert.equal(wednesday.programPlan.programId, weekly.id);
    assert.equal(wednesday.programPlan.dayId, "day-2");
    await programs.setActiveTrainingProgram(future.id);
    assert.equal((await workouts.createWorkoutSession({ followActiveProgram: true })).id, wednesday.id);
    assert.deepEqual((await workouts.getActiveWorkoutSession()).programPlan, wednesday.programPlan, "switching programs cannot replace an active workout");
  });

  test(`${platform}: corrupt schedule data blocks automatic creation without silently creating an empty workout`, async (t) => {
    setup(t, platform);
    const corrupt = JSON.stringify({ version: 3, programs: [], history: [{ programId: "missing" }] });
    if (platform === "web") state.values.set("orca9.programLibrary.v3", corrupt);
    else state.sql.prepare("INSERT INTO program_library (id, data_json) VALUES (1, ?)").run(corrupt);
    await assert.rejects(workouts.createWorkoutSession({ followActiveProgram: true }), /could not be read/);
    assert.equal(await workouts.getActiveWorkoutSession(), null);
    const free = await workouts.createWorkoutSession();
    assert.equal((await workouts.createWorkoutSession({ followActiveProgram: true })).id, free.id, "an existing workout remains resumable even if the program cannot be read");
  });
}
