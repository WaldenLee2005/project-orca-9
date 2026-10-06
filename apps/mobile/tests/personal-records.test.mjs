import assert from "node:assert/strict";
import { test } from "node:test";
import { getRunningPrSeries } from "../src/features/progress/personalRecords.ts";

const point = (id, weight, exerciseName = "Bench Press", reps = 8) => ({
  id, weight, reps, exerciseName, completedAt: `2026-10-${id.padStart(2, "0")}T12:00:00Z`
});

test("heaviest-weight PRs retain exact weight, reps and source through lower or tied workouts", () => {
  const data = [point("1", 100), point("2", 135.25, "Bench Press", 5), point("3", 120, "Other lift", 12),
    point("4", 135.25, "Other lift", 1), point("5", 140.5, "Squat", 3)];
  const before = structuredClone(data);
  const result = getRunningPrSeries(data);
  assert.deepEqual(result.map((entry) => entry.value), [100, 135.25, 135.25, 135.25, 140.5]);
  assert.deepEqual(result.map((entry) => entry.isNewPr), [true, true, false, false, true]);
  assert.equal(result[3].exerciseName, "Bench Press", "a tied weight cannot replace the record source");
  assert.equal(result[3].reps, 5, "later reps do not replace the winning set's actual reps");
  assert.equal(result[4].exerciseName, "Squat");
  assert.deepEqual(result.map((entry) => [entry.id, entry.completedAt]), data.map((entry) => [entry.id, entry.completedAt]),
    "chart points retain the dates and identity of real qualifying workouts");
  assert.deepEqual(data, before, "deriving records never edits saved points");
});

test("a chart window carries the earlier all-time heaviest weight instead of declaring lower recent loads PRs", () => {
  const old = { ...point("1", 200.25), completedAt: "2026-01-01T12:00:00Z" };
  const recent = [point("2", 120), point("3", 135)];
  const full = getRunningPrSeries([old, ...recent]);
  const visible = full.filter((entry) => entry.completedAt >= "2026-09-01");
  assert.deepEqual(visible.map((entry) => entry.value), [200.25, 200.25]);
  assert.ok(visible.every((entry) => !entry.isNewPr));
  assert.equal(full.at(-1).weight, 200.25);
});

test("empty rep history stays empty and an actual zero-load set stays zero", () => {
  assert.deepEqual(getRunningPrSeries([]), []);
  const [zero] = getRunningPrSeries([point("1", 0)]);
  assert.equal(zero.value, 0);
  assert.equal(zero.isNewPr, true);
});
