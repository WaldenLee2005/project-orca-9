import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@react-native-async-storage/async-storage" && context.parentURL?.endsWith("/storage/trainingStorage.ts")) {
    return { shortCircuit: true, url: "data:text/javascript,export default {};" };
  }
  return nextResolve(specifier, context);
} });

const { createTrainingStorageInitializer, TRAINING_SCHEMA_KEY, TRAINING_SCHEMA_VERSION } = await import("../src/storage/trainingStorage.ts");
function makeStorage() {
  const values = new Map(), removed = [];
  return { values, removed, async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { values.set(key, value); },
    async multiRemove(keys) { removed.push([...keys]); for (const key of keys) values.delete(key); } };
}

test("web prelaunch cleanup removes only training keys, runs once, and preserves new data after reload", async () => {
  const storage = makeStorage();
  const oldKeys = ["orca9.workoutSessions", "orca9.restDays", "orca9.trainingPrograms.v1", "orca9.programLibrary.v2", "orca9.programLibrary.v3"];
  for (const key of oldKeys) storage.values.set(key, "old setup");
  storage.values.set("sb-test-auth-token", "keep login");
  storage.values.set("orca9.profile", "keep profile");
  storage.values.set("unrelated-app", "keep unrelated");
  const initialize = createTrainingStorageInitializer(storage);
  await Promise.all([initialize(), initialize(), initialize()]);
  assert.equal(storage.removed.length, 1);
  assert.deepEqual(storage.removed[0], oldKeys);
  assert.equal(storage.values.get(TRAINING_SCHEMA_KEY), TRAINING_SCHEMA_VERSION);
  for (const key of oldKeys) assert.equal(storage.values.has(key), false);
  assert.equal(storage.values.get("sb-test-auth-token"), "keep login");
  assert.equal(storage.values.get("orca9.profile"), "keep profile");
  assert.equal(storage.values.get("unrelated-app"), "keep unrelated");
  storage.values.set("orca9.workoutSessions", "new workout");
  storage.values.set("orca9.programLibrary.v3", "new program");
  await initialize();
  await createTrainingStorageInitializer(storage)();
  assert.equal(storage.removed.length, 1);
  assert.equal(storage.values.get("orca9.workoutSessions"), "new workout");
  assert.equal(storage.values.get("orca9.programLibrary.v3"), "new program");
});

test("failed cleanup stays unmarked, blocks callers, and can retry", async () => {
  const storage = makeStorage();
  let fail = true;
  const normalRemove = storage.multiRemove;
  storage.multiRemove = async (keys) => { if (fail) throw new Error("Storage unavailable"); return normalRemove(keys); };
  storage.values.set("orca9.restDays", "old rest days");
  const initialize = createTrainingStorageInitializer(storage);
  await assert.rejects(initialize(), /Storage unavailable/);
  assert.equal(storage.values.has(TRAINING_SCHEMA_KEY), false);
  assert.equal(storage.values.get("orca9.restDays"), "old rest days");
  fail = false;
  await initialize();
  assert.equal(storage.values.has("orca9.restDays"), false);
  assert.equal(storage.values.get(TRAINING_SCHEMA_KEY), TRAINING_SCHEMA_VERSION);
});

test("an older build cannot clear data from a newer schema", async () => {
  const storage = makeStorage();
  storage.values.set(TRAINING_SCHEMA_KEY, "7");
  storage.values.set("orca9.workoutSessions", "newer data");
  await assert.rejects(createTrainingStorageInitializer(storage)(), /newer version/);
  assert.equal(storage.removed.length, 0);
  assert.equal(storage.values.get("orca9.workoutSessions"), "newer data");
});
