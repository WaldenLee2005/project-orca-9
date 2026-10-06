import assert from "node:assert/strict";
import { test } from "node:test";
import { fillUntouchedDraftWeights, getRecentExerciseWeight } from "../src/features/workouts/weightHistory.ts";

const now = new Date(2026, 9, 5, 12).getTime();
const time = (daysAgo, hour = 10) => {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};
const set = (weight = 135, reps = 8, extra = {}) => ({ weight, reps, ...extra });
const exposure = (sessionId, daysAgo, actualSets = [set()], extra = {}) => ({
  sessionId, performedAt: time(daysAgo), exerciseId: "bench", actualSets, ...extra
});
const load = (extra = {}) => ({ weight: 135, increment: 5, unit: "lb", convention: "total", equipmentKey: "Barbell", ...extra });
const prescription = (chosenLoad) => ({ id: "planned-bench", exerciseId: "bench", exerciseName: "Bench", sets: 3, target: { kind: "reps", reps: 8 }, load: chosenLoad });
const recent = (history, extra = {}) => getRecentExerciseWeight(history, "bench", { now, ...extra });

test("uses rep-weighted actual working weights, with half-pound prefill and unchanged saved decimals", () => {
  const history = [exposure("one", 1, [set(100, 2), set(150, 8), set(12.25, 100, { warmup: true })])];
  const before = structuredClone(history);
  assert.deepEqual(recent(history), {
    source: "history", weight: 140, averageWeight: 140, setCount: 2, sessionCount: 1, latestPerformedAt: time(1)
  });
  assert.equal(recent([exposure("decimal", 1, [set(12.25, 8)])]).weight, 12.5);
  assert.equal(recent([exposure("decimal", 1, [set(12.25, 8)])]).averageWeight, 12.25);
  assert.deepEqual(history, before, "history is never rounded or mutated");
});

test("takes the latest three distinct qualifying sessions, including repeated lift entries in a session", () => {
  const history = [
    exposure("old", 20, [set(500)]),
    exposure("latest", 1, [set(150)]),
    exposure("third", 3, [set(100)]),
    exposure("second", 2, [set(125)]),
    exposure("latest", 1, [set(125)], { performedAt: time(1, 11) }),
    exposure("warmups", 0, [set(20, 8, { warmup: true })])
  ];
  const result = recent(history);
  assert.equal(result.weight, 125);
  assert.equal(result.setCount, 4);
  assert.equal(result.sessionCount, 3);
  assert.equal(result.latestPerformedAt, time(1, 11));
  assert.deepEqual(recent([...history].reverse()), result, "input order does not decide which sessions qualify");
});

test("ignores warm-ups, timed work, invalid results and other exercises without inventing a starting load", () => {
  const badSets = [
    set(50, 8, { warmup: true }), set(50, 8, { durationSeconds: 45 }), set(50, 8, { durationSeconds: 0 }),
    set(NaN), set(Infinity), set(-1), set(10001), set(100, 0), set(100, 101), set(100, 1.5), null
  ];
  assert.equal(recent([exposure("invalid", 1, badSets)]), null);
  assert.equal(recent([exposure("other", 1, [set(135)], { exerciseId: "squat" })]), null);
  assert.equal(recent([]), null);
  assert.equal(recent([exposure("missing-sets", 1, null)]), null);
  assert.equal(recent([null]), null);
  assert.equal(recent([exposure("empty-session", 1, [set()], { sessionId: "" })]), null);
  assert.equal(recent([exposure("zero-load", 1, [set(0, 10)])]).weight, 0, "actual zero external load stays useful");
  assert.equal(recent([exposure("boundary", 1, [set(10000, 100)])]).weight, 10000);
});

test("includes the 90th local calendar day but excludes older, future and invalid dates or clocks", () => {
  assert.equal(recent([exposure("boundary", 90)]).weight, 135);
  assert.equal(recent([exposure("stale", 91)]), null);
  assert.equal(recent([exposure("future-day", -1)]), null);
  assert.equal(recent([exposure("future-time", 0, [set()], { performedAt: time(0, 13) })]), null);
  assert.equal(recent([exposure("invalid-date", 1, [set()], { performedAt: "invalid" })]), null);
  for (const clock of [NaN, Infinity, -Infinity, 1e20]) assert.equal(recent([exposure("one", 1)], { now: clock }), null);
});

test("matches explicit equipment and pound conventions while unknown context matches unknown only", () => {
  const manual = exposure("manual", 1, [set(400)]);
  const compatible = exposure("compatible", 2, [set(135)], { prescription: prescription(load({ equipmentKey: " BARBELL " })) });
  const perHand = exposure("per-hand", 1, [set(65)], { prescription: prescription(load({ convention: "perHand" })) });
  const equipment = exposure("machine", 1, [set(200)], { prescription: prescription(load({ equipmentKey: "Machine" })) });
  const wrongUnit = exposure("kg", 1, [set(50)], { prescription: prescription(load({ unit: "kg" })) });
  const history = [manual, compatible, perHand, equipment, wrongUnit];
  assert.equal(recent(history).weight, 400);
  assert.equal(recent(history, { load: load() }).weight, 135);
  assert.equal(recent([manual], { load: load() }), null);
  assert.equal(recent([compatible]), null);
  assert.equal(recent([compatible], { load: load({ equipmentKey: "" }) }), null);
  assert.equal(recent([wrongUnit], { load: load({ unit: "kg" }) }), null);
});

test("custom lift history follows normalized saved names across recreated IDs without matching catalog lifts", () => {
  const history = [
    exposure("custom-one", 1, [set(100)], { exerciseId: "custom-old-selection", exerciseName: "  My Bench Press  " }),
    exposure("custom-two", 2, [set(150)], { exerciseId: "custom-native-row", exerciseName: "MY BENCH PRESS" }),
    exposure("custom-other", 1, [set(400)], { exerciseId: "custom-other", exerciseName: "My Squat" }),
    exposure("catalog", 1, [set(500)], { exerciseId: "catalog-bench", exerciseName: "My Bench Press" })
  ];
  const result = getRecentExerciseWeight(history, "custom-new-selection", { now, exerciseName: "my bench press" });
  assert.equal(result.weight, 125);
  assert.equal(result.sessionCount, 2);
  assert.equal(result.setCount, 2);
  assert.equal(getRecentExerciseWeight(history, "catalog-bench", { now, exerciseName: "My Bench Press" }).weight, 500);
  assert.equal(getRecentExerciseWeight(history, "different-catalog-bench", { now, exerciseName: "My Bench Press" }), null);
  assert.equal(getRecentExerciseWeight(history, "custom-new-selection", { now, exerciseName: "My Deadlift" }), null);
});

test("missing custom lift names require an exact ID and never group unnamed or differently named lifts", () => {
  const named = exposure("named", 1, [set(100)], { exerciseId: "custom-named", exerciseName: "My Lift" });
  const unnamed = exposure("unnamed", 1, [set(135)], { exerciseId: "custom-unnamed" });
  const blank = exposure("blank", 1, [set(150)], { exerciseId: "custom-blank", exerciseName: "   " });
  assert.equal(getRecentExerciseWeight([named], "custom-named", { now }).weight, 100);
  assert.equal(getRecentExerciseWeight([unnamed], "custom-unnamed", { now, exerciseName: "My Lift" }).weight, 135);
  assert.equal(getRecentExerciseWeight([blank], "custom-blank", { now, exerciseName: "My Lift" }).weight, 150);
  assert.equal(getRecentExerciseWeight([named, unnamed, blank], "custom-new", { now }), null);
  assert.equal(getRecentExerciseWeight([unnamed, blank], "custom-new", { now, exerciseName: "My Lift" }), null);
  assert.equal(getRecentExerciseWeight([named], "custom-named", { now, exerciseName: "Different Lift" }), null);
});

test("late prefills preserve exact/manual/copied weights, explicit clearing, notes and unrelated draft edits", () => {
  const drafts = [
    set(NaN, 7, { note: "Controlled reps", effort: "hard", warmup: true }),
    set(12.25, 10), set(0, 5), set(NaN, 8, { note: "I cleared this weight" }), set(Infinity)
  ];
  const next = fillUntouchedDraftWeights(drafts, 135, new Set([3]));
  assert.equal(next[0].weight, 135);
  assert.deepEqual(next[0], { ...drafts[0], weight: 135 });
  assert.ok(Number.isNaN(drafts[0].weight), "draft input is unchanged");
  for (const index of [1, 2, 3, 4]) assert.equal(next[index], drafts[index]);
  assert.equal(fillUntouchedDraftWeights(next, 140, new Set([3])), next, "refreshing history does not replace a prefill");
  assert.equal(fillUntouchedDraftWeights(drafts, 135, new Set([0, 3])), drafts, "all protected rows avoid a needless state update");
  for (const invalidWeight of [NaN, Infinity, -1, 10001]) assert.equal(fillUntouchedDraftWeights(drafts, invalidWeight), drafts);
  assert.equal(fillUntouchedDraftWeights([set(NaN)], 0)[0].weight, 0);
});
