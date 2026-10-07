import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { getLastSavedExerciseWeight, getRecentExerciseWeight } from "../src/features/workouts/weightHistory.ts";

// Run the real workout repository against isolated web storage and SQLite, never device data.
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
  async withTransactionAsync(callback) {
    state.sql.exec("BEGIN");
    try { await callback(); state.sql.exec("COMMIT"); }
    catch (error) { state.sql.exec("ROLLBACK"); throw error; }
  }
};
globalThis.__orcaSetNotesTest = state;
const modules = {
  "react-native": "export const Platform = globalThis.__orcaSetNotesTest.platform;",
  "@react-native-async-storage/async-storage": "export default globalThis.__orcaSetNotesTest.storage;",
  "./database": "export const getDatabase = async () => globalThis.__orcaSetNotesTest.database; export const compactLocalDatabase = async () => {}; export const createLocalId = (prefix) => prefix + '-' + (++globalThis.__orcaSetNotesTest.nextId);",
  "./profilesRepository": "export const getCachedCurrentUserProfile = () => null; export const warmCurrentUserProfileCache = () => {};",
  "./programsRepository": "export const getProgramLibraryForWorkout = async () => ({ programs: [], activeProgramId: null });",
  "../features/workouts/repdbSessionExercises": "export const sessionExercises = [{ id: 'bench', name: 'Bench Press', image: 1 }];"
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "./trainingMutationQueue") return nextResolve(new URL("../src/storage/trainingMutationQueue.ts", import.meta.url).href, context);
  if (specifier === "../features/programs/programRestart") return nextResolve(new URL("../src/features/programs/programRestart.ts", import.meta.url).href, context);
  if (specifier === "./programModel" && context.parentURL?.endsWith("/programRestart.ts")) return nextResolve(new URL("../src/features/programs/programModel.ts", import.meta.url).href, context);
  const parentPath = context.parentURL ? new URL(context.parentURL).pathname : "";
  if (specifier === "./trainingStorage") return nextResolve(new URL("../src/storage/trainingStorage.ts", import.meta.url).href, context);
  if (specifier === "./trainingChanges") return nextResolve(new URL("../src/storage/trainingChanges.ts", import.meta.url).href, context);
  if (specifier === "../features/programs/programModel") return nextResolve(new URL("../src/features/programs/programModel.ts", import.meta.url).href, context);
  if (parentPath.endsWith("/storage/database.ts") && specifier === "expo-sqlite") {
    return { shortCircuit: true, url: "data:text/javascript,export const openDatabaseAsync = async () => globalThis.__orcaSetNotesTest.database;" };
  }
  if (/\/(workoutsRepository|trainingStorage)\.ts$/.test(parentPath) && modules[specifier]) {
    return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(modules[specifier])}` };
  }
  return nextResolve(specifier, context);
} });
const workouts = await import("../src/storage/workoutsRepository.ts");
const { initializeDatabase } = await import("../src/storage/database.ts");
const schemaSource = readFileSync(new URL("../src/storage/database.ts", import.meta.url), "utf8");
const schema = schemaSource.match(/async function ensureCoreTables[\s\S]*?execAsync\(`([\s\S]*?)`\);/)[1];
const exercise = { id: "bench", name: "Bench Press", category: "Chest", focus: "Chest", equipment: "Barbell", image: 1 };
const key = "orca9.workoutSessions";
function setup(t, platform) {
  state.platform.OS = platform; state.values.clear(); state.failWrite = false;
  state.values.set("orca9.trainingSchemaVersion", "6");
  state.sql = new DatabaseSync(":memory:"); state.sql.exec("PRAGMA foreign_keys = ON;"); state.sql.exec(schema);
  t.after(() => state.sql.close());
}
const add = (sessionId, actualSets, extra = {}) => workouts.addExerciseToWorkoutSession({
  sessionId, exercise, sets: actualSets.length, reps: actualSets[0].reps, weight: actualSets[0].weight,
  durationSeconds: actualSets[0].durationSeconds, actualSets, ...extra
});
const measurements = (sets) => sets.map(({ note, ...set }) => set);
function savedAt(entryId, timestamp) {
  if (state.platform.OS === "web") {
    const sessions = JSON.parse(state.values.get(key));
    for (const session of sessions) {
      const entry = session.exercises.find((exercise) => exercise.id === entryId);
      if (entry) entry.savedAt = timestamp;
    }
    state.values.set(key, JSON.stringify(sessions));
  } else state.sql.prepare("UPDATE workout_exercises SET saved_at = ? WHERE id = ?").run(timestamp, entryId);
}
function sessionDates(sessionId, startedAt, completedAt) {
  if (state.platform.OS === "web") {
    const sessions = JSON.parse(state.values.get(key));
    const session = sessions.find((session) => session.id === sessionId);
    session.startedAt = startedAt; session.completedAt = completedAt;
    state.values.set(key, JSON.stringify(sessions));
  } else state.sql.prepare("UPDATE workout_sessions SET started_at = ?, completed_at = ? WHERE id = ?").run(startedAt, completedAt, sessionId);
}
function storedWork() {
  return state.platform.OS === "web" ? state.values.get(key) : Object.fromEntries(
    ["workout_sessions", "workout_exercises", "set_entries"].map((table) => [table, state.sql.prepare(`SELECT * FROM ${table}`).all()])
  );
}

test("set notes accept omission, blank, multiline and Unicode text with bounded normalization", () => {
  for (const note of [undefined, null, "", " \n\t "]) assert.equal(workouts.normalizeWorkoutSetNote(note), null);
  assert.equal(workouts.normalizeWorkoutSetNote(" \n Brace first\n膝を安定させる 🐋\t "), "Brace first\n膝を安定させる 🐋");
  assert.equal(workouts.normalizeWorkoutSetNote("a".repeat(workouts.MAX_SET_NOTE_LENGTH)).length, 1000);
  for (const note of [false, 1, {}, [], "a".repeat(1001)]) assert.throws(() => workouts.normalizeWorkoutSetNote(note));
});

for (const platform of ["web", "ios"]) {
  test(`${platform}: completed performance history retains custom names across selection IDs and omits private notes`, async (t) => {
    setup(t, platform);
    const session = await workouts.createWorkoutSession();
    await add(session.id, [{ weight: 100, reps: 8, note: "Private catalog note" }]);
    await add(session.id, [{ weight: 135, reps: 8, note: "Private custom note" }], {
      exercise: { ...exercise, id: "custom-first-selection", name: "  My Bench Press  " }
    });
    assert.deepEqual(await workouts.getCoachHistory(), [], "unfinished sessions never enter completed coaching/average history");
    await workouts.completeWorkoutSession(session.id);
    const history = await workouts.getCoachHistory();
    assert.equal(history.length, 2);
    assert.equal(history.find((entry) => entry.exerciseId === "bench").exerciseName, "Bench Press");
    const custom = history.find((entry) => entry.exerciseId.startsWith("custom-"));
    assert.equal(custom.exerciseName, "  My Bench Press  ");
    const storedCustom = (await workouts.getWorkoutSessionExercises(session.id)).find((entry) => entry.exercise.id.startsWith("custom-"));
    assert.equal(custom.exerciseId, storedCustom.exercise.id, "existing platform ID projection stays preserved");
    assert.equal(history.some((entry) => entry.actualSets.some((set) => "note" in set)), false);
    assert.equal(getRecentExerciseWeight(history, "custom-second-selection", {
      now: Date.now(), exerciseName: "my bench press"
    }).weight, 135, "a new custom selection reuses only that custom lift's measured weight");
  });

  test(`${platform}: saved-weight history includes active actual sets with chronological ties and leaves coach history completed-only`, async (t) => {
    setup(t, platform);
    const completed = await workouts.createWorkoutSession();
    const old = await add(completed.id, [{ weight: 100, reps: 8, note: "Private older note" }]);
    await workouts.completeWorkoutSession(completed.id);
    savedAt(old.id, "2026-09-01T10:00:00.000Z");
    sessionDates(completed.id, "2026-09-01T09:00:00.000Z", "2026-10-04T20:00:00.000Z");
    const active = await workouts.createWorkoutSession();
    assert.equal((await workouts.getSavedExerciseHistory("bench")).length, 1, "empty active plan/session adds no actual measurement");
    const first = await add(active.id, [{ weight: 120, reps: 8 }]);
    const prescription = { id: "plan-bench", exerciseId: "bench", exerciseName: "Bench Press", sets: 3,
      target: { kind: "reps", reps: 8 }, load: { unit: "lb", weight: 50, increment: 5, convention: "total", equipmentKey: "Barbell" } };
    const latest = await add(active.id, [
      { weight: 135, reps: 8, note: "Private working note" },
      { weight: 12.25, reps: 6, effort: "hard" },
      { weight: 20, reps: 10, warmup: true, note: "Private warm-up note" }
    ], { prescription });
    savedAt(first.id, "2026-10-05T10:00:00.000Z");
    savedAt(latest.id, "2026-10-05T10:00:00.000Z");
    sessionDates(active.id, "2026-01-01T09:00:00.000Z", null);
    const before = storedWork();
    const saved = await workouts.getSavedExerciseHistory("bench");
    assert.deepEqual(saved.map((entry) => entry.actualSets.map((set) => set.weight)), [[135, 12.25, 20], [120], [100]]);
    assert.ok(saved[0].exerciseOrder > saved[1].exerciseOrder, "later exercise order breaks equal save timestamps");
    assert.equal(saved[0].sessionId, active.id, "an old-start active session's new save stays latest");
    assert.deepEqual(saved[0].prescription, prescription);
    assert.equal(saved.some((entry) => entry.actualSets.some((set) => "note" in set)), false);
    assert.equal(getLastSavedExerciseWeight(saved, "bench", { now: Date.parse("2026-10-06T12:00:00Z"), load: prescription.load }).weight, 12.25,
      "last working set retains its exact decimal, skipping the trailing warm-up");
    const coached = await workouts.getCoachHistory();
    assert.deepEqual(coached.map((entry) => entry.sessionId), [completed.id]);
    await workouts.updateWorkoutSetNote(old.id, 1, "Edited now, still an old measurement");
    assert.deepEqual(await workouts.getSavedExerciseHistory("bench"), saved, "note updates do not change save-time ordering or measurements");
    const afterNote = storedWork();
    await workouts.getSavedExerciseHistory("bench");
    assert.deepEqual(storedWork(), afterNote, "saved-weight reads never alter stored results");
    assert.notDeepEqual(afterNote, before, "the explicit note update was persisted independently");
    await workouts.deleteWorkoutExercise(latest.id);
    assert.equal((await workouts.getSavedExerciseHistory("bench"))[0].actualSets[0].weight, 120, "deleted actual entries stop supplying weights");
  });

  test(`${platform}: custom saved weights match Unicode names across IDs and remain separate from catalog lifts`, async (t) => {
    setup(t, platform);
    const session = await workouts.createWorkoutSession();
    await add(session.id, [{ weight: 500, reps: 8 }], { exercise: { ...exercise, name: "ŽELEZO 🐋" } });
    await add(session.id, [{ weight: 100, reps: 8 }], { exercise: { ...exercise, id: "custom-first", name: "  Železo 🐋  " } });
    const matching = await add(session.id, [{ weight: 0, reps: 10, note: "Private custom note" }], { exercise: { ...exercise, id: "custom-second", name: "ŽELEZO 🐋" } });
    await add(session.id, [{ weight: 400, reps: 8 }], { exercise: { ...exercise, id: "custom-other", name: "Other Lift" } });
    const custom = await workouts.getSavedExerciseHistory("custom-new-selection", "železo 🐋");
    assert.equal(custom.length, 2);
    assert.ok(custom.every((entry) => entry.exerciseId.startsWith("custom-")));
    assert.equal(custom.some((entry) => entry.actualSets.some((set) => "note" in set)), false);
    assert.equal(getLastSavedExerciseWeight(custom, "custom-new-selection", { now: Date.now(), exerciseName: "ŽELEZO 🐋" }).weight, 0);
    const stored = (await workouts.getWorkoutSessionExercises(session.id)).find((entry) => entry.id === matching.id);
    assert.equal((await workouts.getSavedExerciseHistory(stored.exercise.id))[0].actualSets[0].weight, 0, "unnamed request falls back to exact projected ID");
    assert.deepEqual(await workouts.getSavedExerciseHistory("custom-unmatched", "Different Lift"), []);
    assert.equal((await workouts.getSavedExerciseHistory("bench", "ŽELEZO 🐋"))[0].actualSets[0].weight, 500);
    assert.deepEqual(await workouts.getCoachHistory(), []);
    if (platform !== "web") {
      const normalRead = state.database.getAllAsync;
      let reads = 0;
      state.database.getAllAsync = async (...args) => { reads++; return normalRead(...args); };
      try { await workouts.getSavedExerciseHistory("custom-new-selection", "ŽELEZO 🐋"); assert.equal(reads, 1, "native loads matching custom sets in one batch"); }
      finally { state.database.getAllAsync = normalRead; }
    }
  });

  test(`${platform}: a long-unused lift stays available beyond the coach feed's age/session horizon`, async (t) => {
    setup(t, platform);
    const old = await workouts.createWorkoutSession();
    const recorded = await add(old.id, [{ weight: 135, reps: 8 }]);
    await workouts.completeWorkoutSession(old.id);
    savedAt(recorded.id, "2020-01-01T10:00:00.000Z");
    sessionDates(old.id, "2020-01-01T09:00:00.000Z", "2020-01-01T11:00:00.000Z");
    for (let index = 0; index < 121; index++) {
      const unrelated = await workouts.createWorkoutSession();
      await add(unrelated.id, [{ weight: 50, reps: 8 }], { exercise: { ...exercise, id: "other-catalog", name: "Other Catalog Lift" } });
      await workouts.completeWorkoutSession(unrelated.id);
    }
    assert.equal((await workouts.getCoachHistory()).some((entry) => entry.exerciseId === "bench"), false);
    const saved = await workouts.getSavedExerciseHistory("bench");
    assert.equal(saved.length, 1);
    assert.equal(getLastSavedExerciseWeight(saved, "bench", { now: Date.now() }).weight, 135,
      "last saved weight is not limited to recent completed sessions");
    assert.equal(getRecentExerciseWeight(saved, "bench", { now: Date.now() }), null, "optional average retains its 90-day horizon");
  });

  test(`${platform}: optional per-set notes survive save, reload, completed review, edit and clear without altering work`, async (t) => {
    setup(t, platform);
    const session = await workouts.createWorkoutSession();
    const actualSets = [
      { weight: 50, reps: 12, effort: "easy", warmup: true },
      { weight: 100, reps: 8, effort: "hard", note: "  Brace first\n膝を安定 🐋  " },
      { weight: 110, reps: 6, note: "\n " }
    ];
    const first = await add(session.id, actualSets);
    const second = await add(session.id, [{ weight: 75, reps: 10, note: "Other exercise" }]);
    assert.deepEqual(first.actualSets.map((set) => set.note), [null, "Brace first\n膝を安定 🐋", null]);
    assert.equal(actualSets[1].note, "  Brace first\n膝を安定 🐋  ", "saving does not mutate the logger's draft");
    const reloaded = await import(`../src/storage/workoutsRepository.ts?reload-${platform}`);
    const before = await reloaded.getWorkoutSessionExercises(session.id);
    assert.deepEqual((await reloaded.getActiveWorkoutSession()).exercises[0].actualSets.map((set) => set.note), [null, "Brace first\n膝を安定 🐋", null]);
    assert.equal(await reloaded.updateWorkoutSetNote(first.id, 1, " Set one only "), "Set one only");
    assert.equal(await reloaded.updateWorkoutSetNote(first.id, 2, "  Updated\nsecond set  "), "Updated\nsecond set");
    let after = await reloaded.getWorkoutSessionExercises(session.id);
    assert.deepEqual(after[0].actualSets.map((set) => set.note), ["Set one only", "Updated\nsecond set", null]);
    assert.equal(after[1].actualSets[0].note, "Other exercise", "same set number on another entry is isolated");
    assert.deepEqual(measurements(after[0].actualSets), measurements(before[0].actualSets));
    assert.equal(after[0].savedAt, before[0].savedAt);
    assert.equal(after[0].programEntryId, before[0].programEntryId);
    await reloaded.completeWorkoutSession(session.id);
    const summaryBefore = await reloaded.getCompletedWorkoutSessions();
    const coachBefore = await reloaded.getCoachHistory();
    assert.equal(coachBefore.some((entry) => entry.actualSets.some((set) => "note" in set)), false, "private text does not enter coaching inputs");
    assert.equal(await reloaded.updateWorkoutSetNote(first.id, 2, "\n\t "), null);
    assert.equal(await reloaded.updateWorkoutSetNote(second.id, 1, null), null);
    assert.deepEqual((await reloaded.getWorkoutSessionExercises(session.id))[0].actualSets.map((set) => set.note), ["Set one only", null, null]);
    assert.deepEqual(await reloaded.getCompletedWorkoutSessions(), summaryBefore, "note edits do not change volume or completion");
    assert.deepEqual(await reloaded.getCoachHistory(), coachBefore, "note edits do not change coach evidence/fingerprints");
    assert.equal(await reloaded.getActiveWorkoutSession(), null);
  });

  test(`${platform}: missing targets, invalid notes and failed writes leave existing sets intact and allow retry`, async (t) => {
    setup(t, platform);
    const session = await workouts.createWorkoutSession();
    const recorded = await add(session.id, [{ weight: 0, reps: 0, durationSeconds: 30, note: "Timed working set" }]);
    const before = await workouts.getWorkoutSessionExercises(session.id);
    for (const [id, number, note] of [["missing", 1, "test"], [recorded.id, 2, "test"], [recorded.id, 0, "test"], [recorded.id, 1.5, "test"], [recorded.id, 1, false], [recorded.id, 1, "a".repeat(1001)]]) {
      await assert.rejects(workouts.updateWorkoutSetNote(id, number, note));
    }
    await assert.rejects(workouts.getWorkoutSessionExercises("missing"), /could not be found/);
    state.failWrite = true;
    await assert.rejects(workouts.updateWorkoutSetNote(recorded.id, 1, "Changed"), /Disk full/);
    assert.deepEqual(await workouts.getWorkoutSessionExercises(session.id), before);
    state.failWrite = false;
    await workouts.updateWorkoutSetNote(recorded.id, 1, "Retry saved");
    assert.equal((await workouts.getWorkoutSessionExercises(session.id))[0].actualSets[0].note, "Retry saved");
    assert.equal((await workouts.getWorkoutSessionExercises(session.id))[0].actualSets[0].durationSeconds, 30);
    const count = (await workouts.getActiveWorkoutSession()).exercises.length;
    await assert.rejects(add(session.id, [{ reps: 8, weight: 50, note: 42 }]));
    assert.equal((await workouts.getActiveWorkoutSession()).exercises.length, count);
  });

  test(`${platform}: serialized edits retain notes on different sets during completion`, async (t) => {
    setup(t, platform);
    const session = await workouts.createWorkoutSession();
    const recorded = await add(session.id, [{ weight: 100, reps: 8 }, { weight: 105, reps: 6 }]);
    await Promise.all([
      workouts.updateWorkoutSetNote(recorded.id, 1, "First"),
      workouts.completeWorkoutSession(session.id),
      workouts.updateWorkoutSetNote(recorded.id, 2, "Second")
    ]);
    assert.deepEqual((await workouts.getWorkoutSessionExercises(session.id))[0].actualSets.map((set) => set.note), ["First", "Second"]);
    assert.equal((await workouts.getCompletedWorkoutSessions())[0].totalVolume, 1430);
  });
}

test("web: legacy aggregate sets without notes can be reviewed and edited while unrelated records remain intact", async (t) => {
  setup(t, "web");
  const legacy = [{ id: "legacy", startedAt: "2026-09-01", completedAt: "2026-09-02", updatedAt: "2026-09-02", exercises: [
    { id: "legacy-exercise", exercise, sets: 2, reps: 8, weight: 100, savedAt: "2026-09-01" }
  ] }];
  state.values.set(key, JSON.stringify(legacy));
  state.values.set("orca9.programLibrary.v3", "preserve program");
  state.values.set("sb-local-auth", "preserve auth");
  assert.deepEqual((await workouts.getWorkoutSessionExercises("legacy"))[0].actualSets.map((set) => set.note), [null, null]);
  await workouts.updateWorkoutSetNote("legacy-exercise", 2, "Legacy note");
  const saved = JSON.parse(state.values.get(key))[0];
  assert.equal(saved.startedAt, legacy[0].startedAt);
  assert.equal(saved.completedAt, legacy[0].completedAt);
  assert.deepEqual(saved.exercises[0].actualSets.map((set) => set.note), [null, "Legacy note"]);
  assert.equal(state.values.get("orca9.programLibrary.v3"), "preserve program");
  assert.equal(state.values.get("sb-local-auth"), "preserve auth");
});

test("web: corrupt or ambiguous workout data is reported before a note update can overwrite it", async (t) => {
  setup(t, "web");
  const session = await workouts.createWorkoutSession();
  const recorded = await add(session.id, [{ weight: 100, reps: 8 }]);
  const saved = JSON.parse(state.values.get(key));
  const malformed = structuredClone(saved);
  malformed[0].exercises[0].actualSets[0].note = {};
  const duplicate = structuredClone(saved);
  duplicate[0].exercises.push(structuredClone(duplicate[0].exercises[0]));
  for (const value of ["invalid json", "{}", JSON.stringify(malformed), JSON.stringify(duplicate), JSON.stringify([...saved, { id: "broken" }])]) {
    state.values.set(key, value);
    await assert.rejects(workouts.updateWorkoutSetNote(recorded.id, 1, "New note"));
    assert.equal(state.values.get(key), value);
  }
});

test("SQLite: a failure after the note write rolls back the note and timestamps together", async (t) => {
  setup(t, "ios");
  const session = await workouts.createWorkoutSession();
  const recorded = await add(session.id, [{ weight: 100, reps: 8, note: "Original" }]);
  const beforeSet = state.sql.prepare("SELECT * FROM set_entries").all();
  const beforeSession = state.sql.prepare("SELECT * FROM workout_sessions").all();
  const normalRun = state.database.runAsync;
  state.database.runAsync = async (sql, params) => {
    if (sql.startsWith("UPDATE workout_sessions")) throw new Error("Session update failed");
    return normalRun(sql, params);
  };
  try { await assert.rejects(workouts.updateWorkoutSetNote(recorded.id, 1, "Changed"), /Session update failed/); }
  finally { state.database.runAsync = normalRun; }
  assert.deepEqual(state.sql.prepare("SELECT * FROM set_entries").all(), beforeSet);
  assert.deepEqual(state.sql.prepare("SELECT * FROM workout_sessions").all(), beforeSession);
  await workouts.updateWorkoutSetNote(recorded.id, 1, "Retry saved");
  assert.equal((await workouts.getWorkoutSessionExercises(session.id))[0].actualSets[0].note, "Retry saved");
});

for (const version of [6, 7, 8]) {
  test(`SQLite ${version} → 10 adds optional notes transactionally and preserves all current training/profile records`, async (t) => {
    setup(t, "ios");
    state.sql.exec("INSERT INTO user_profiles (id, display_name, goal, experience_level, created_at, updated_at) VALUES ('profile', 'Kept', 'strength', 'beginner', '2026-09-01', '2026-09-01');");
    const session = await workouts.createWorkoutSession();
    const recorded = await add(session.id, [{ weight: 100, reps: 8, effort: "hard", warmup: true }], {
      prescription: { id: "prescribed", exerciseId: "bench", exerciseName: "Bench Press", sets: 1, target: { kind: "reps", reps: 8 } }
    });
    state.sql.exec("INSERT INTO consistency_days VALUES ('2026-09-02', 'rest', '2026-09-02'); INSERT INTO program_library VALUES (1, '{\"preserved\":true}');");
    state.sql.exec("ALTER TABLE set_entries DROP COLUMN note;");
    if (version < 8) state.sql.exec("ALTER TABLE set_entries DROP COLUMN effort; ALTER TABLE set_entries DROP COLUMN is_warmup; ALTER TABLE workout_exercises DROP COLUMN prescription_json;");
    if (version < 7) state.sql.exec("ALTER TABLE set_entries DROP COLUMN duration_seconds;");
    state.sql.exec(`PRAGMA user_version = ${version};`);
    const tables = ["user_profiles", "workout_sessions", "workout_exercises", "set_entries", "consistency_days", "program_library"];
    const before = Object.fromEntries(tables.map((table) => [table, state.sql.prepare(`SELECT * FROM ${table}`).all()]));
    const failing = { ...state.database, async execAsync(sql) {
      if (sql.includes("PRAGMA user_version = 10")) throw new Error("Migration interrupted");
      await state.database.execAsync(sql);
    } };
    await assert.rejects(initializeDatabase(failing), /Migration interrupted/);
    assert.equal(state.sql.prepare("PRAGMA user_version").get().user_version, version);
    assert.equal(state.sql.prepare("PRAGMA table_info(set_entries)").all().some((column) => column.name === "note"), false);
    for (const table of tables) assert.deepEqual(state.sql.prepare(`SELECT * FROM ${table}`).all(), before[table], "failure rolls back all migration changes");
    await initializeDatabase(state.database);
    await initializeDatabase(state.database);
    assert.equal(state.sql.prepare("PRAGMA user_version").get().user_version, 10);
    for (const table of tables) {
      const after = state.sql.prepare(`SELECT * FROM ${table}`).all();
      assert.equal(after.length, before[table].length);
      before[table].forEach((row, index) => {
        for (const [column, value] of Object.entries(row)) assert.deepEqual(after[index][column], value, `${table}.${column} is preserved`);
      });
    }
    assert.equal((await workouts.getWorkoutSessionExercises(session.id))[0].actualSets[0].note, null);
    await workouts.updateWorkoutSetNote(recorded.id, 1, "After upgrade");
    await initializeDatabase(state.database);
    assert.equal((await workouts.getWorkoutSessionExercises(session.id))[0].actualSets[0].note, "After upgrade");
  });
}
