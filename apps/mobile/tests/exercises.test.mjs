import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { filterExercises, toCatalogMetadata } from "../src/features/exercises/exerciseSearch.ts";

const dataset = JSON.parse(readFileSync(new URL("../assets/repdb/exercises.json", import.meta.url), "utf8"));
const catalog = dataset.exercises.map(toCatalogMetadata);

test("all 400 bundled exercises have unique stable IDs, instructions, and local free-tier stills", () => {
  assert.equal(catalog.length, 400);
  assert.equal(new Set(catalog.map((exercise) => exercise.id)).size, 400);
  const manifest = readFileSync(new URL("../src/features/exercises/repdbImages.ts", import.meta.url), "utf8");
  for (const exercise of dataset.exercises) {
    assert.ok(exercise.instructions_en.length);
    const path = exercise.images.flat.start ?? exercise.images.flat.main ?? Object.values(exercise.images.flat)[0];
    assert.ok(existsSync(new URL(`../assets/repdb/${path}`, import.meta.url)), path);
    assert.ok(manifest.includes(`"${exercise.id}": require("../../../assets/repdb/${path}")`), exercise.id);
  }
});

test("search handles case, whitespace, punctuation, abbreviations, and any token order", () => {
  for (const query of ["  DB   BENCH ", "bench dumbbell", "dumbbell-bench"]) {
    assert.ok(filterExercises(catalog, query).some((exercise) => exercise.id === "db-bench-press"));
  }
  assert.ok(filterExercises(catalog, "rdl").some((exercise) => exercise.id === "dumbbell-romanian-deadlift"));
  assert.ok(filterExercises(catalog, "pullups").length > 0);
  assert.equal(filterExercises(catalog, "   ").length, 400);
});

test("search matches muscle aliases and equipment; filters combine with the query", () => {
  assert.ok(filterExercises(catalog, "quads").some((exercise) => exercise.id === "front-squat"));
  assert.ok(filterExercises(catalog, "lats cable").some((exercise) => exercise.id === "wide-grip-seated-cable-row"));
  const results = filterExercises(catalog, "bench", "Chest", "Dumbbell");
  assert.ok(results.length > 0);
  assert.ok(results.every((exercise) => exercise.category === "Chest" && exercise.equipment === "Dumbbell"));
  assert.equal(filterExercises(catalog, "not-an-exercise-zzzz").length, 0);
  assert.equal(filterExercises(catalog, "bench", "Calves").length, 0);
});

test("missing equipment and secondary muscles still produce searchable bodyweight exercises", () => {
  const exercise = toCatalogMetadata({ id: "test", name_en: "Test", category: "strength", body_part: "core", primary_muscles: ["rectus_abdominis"], description_en: "", instructions_en: [] });
  assert.equal(exercise.equipment, "Bodyweight");
  assert.equal(filterExercises([exercise], "abs bodyweight").length, 1);
});
