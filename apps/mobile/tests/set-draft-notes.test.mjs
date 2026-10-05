import assert from "node:assert/strict";
import { test } from "node:test";
import { preserveWorkoutSetNotes } from "../src/features/workouts/setDraftNotes.ts";

const set = (weight, note = null) => ({ weight, reps: 8, effort: null, warmup: false, note });

test("applying and undoing coach values preserves current notes, including edits and clearing", () => {
  const before = [set(100, "Use a slower descent"), set(95, "Old note"), set(90)];
  const suggestion = [set(105), set(105), set(105)];
  const applied = preserveWorkoutSetNotes(suggestion, before);
  assert.deepEqual(applied.map((set) => set.weight), [105, 105, 105]);
  assert.deepEqual(applied.map((set) => set.note), ["Use a slower descent", "Old note", null]);

  const edited = applied.map((set, index) => ({ ...set, note: ["Stay balanced", "", "Check setup"][index] }));
  const restored = preserveWorkoutSetNotes(before, edited);
  assert.deepEqual(restored.map((set) => set.weight), [100, 95, 90]);
  assert.deepEqual(restored.map((set) => set.note), ["Stay balanced", "", "Check setup"]);
  assert.equal(before[1].note, "Old note", "draft snapshots are not mutated");
  assert.equal(suggestion[0].note, null, "suggested values are not mutated");
});

test("a shorter recommendation keeps rows through the last noted set without moving notes", () => {
  const before = [set(100, "First set"), set(95), set(90, "Third set"), set(85)];
  const applied = preserveWorkoutSetNotes([set(100), set(100)], before);
  assert.equal(applied.length, 3);
  assert.deepEqual(applied.map((set) => set.note), ["First set", null, "Third set"]);
  assert.equal(applied[2].weight, 90, "retained rows keep their own actual values");

  const restored = preserveWorkoutSetNotes(before, applied);
  assert.equal(restored.length, 4);
  assert.deepEqual(restored.map((set) => set.note), before.map((set) => set.note));
});

test("an undo or changed recommendation retains new notes on additional suggested rows", () => {
  const before = [set(100)];
  const applied = [set(105, "Set one"), set(105), set(105, "Set three")];
  const restored = preserveWorkoutSetNotes(before, applied);
  assert.deepEqual(restored.map((set) => set.note), ["Set one", null, "Set three"]);
  assert.deepEqual(restored.map((set) => set.weight), [100, 105, 105]);
});

test("unnoted draft rows can still be reduced, and missing optional notes stay empty", () => {
  const reduced = preserveWorkoutSetNotes([set(100)], [{ weight: 95, reps: 8 }, set(95)]);
  assert.deepEqual(reduced, [set(100)]);
  assert.deepEqual(preserveWorkoutSetNotes([set(100), set(100)], [set(95, "First")]).map((set) => set.note), ["First", null]);
});
