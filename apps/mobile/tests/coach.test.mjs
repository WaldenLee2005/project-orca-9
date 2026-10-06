import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCoach, reviewTraining, DEFAULT_READINESS } from "../src/features/coach/coachModel.ts";

const now = new Date(2026, 8, 29, 12);
const entry = { id: "bench-entry", exerciseId: "bench", exerciseName: "Bench Press", sets: 3, target: { kind: "repRange", min: 8, max: 10 }, load: { weight: 100, increment: 5, unit: "lb", convention: "total", equipmentKey: "Home barbell" } };
const readiness = { ...DEFAULT_READINESS, feeling: "good", sameEquipment: true };
function exposure(daysAgo, patch = {}) {
  const date = new Date(now); date.setDate(date.getDate() - daysAgo);
  return { sessionId: `session-${daysAgo}`, exerciseId: "bench", performedAt: date.toISOString(), prescription: structuredClone(entry),
    actualSets: Array.from({ length: 3 }, () => ({ weight: 100, reps: 10, effort: "moderate" })), ...patch };
}
const run = (history = [exposure(2), exposure(5)], changes = {}) => evaluateCoach({ entry, history, readiness, now, ...changes });

test("coach proposes one increment from two recent complete comparable exposures without mutating anything", () => {
  const context = { entry, history: [exposure(2), exposure(5)], readiness, now };
  const before = JSON.stringify(context);
  const result = evaluateCoach(context);
  assert.equal(result.reason, "progress"); assert.equal(result.weight, 105); assert.equal(result.sets, 3);
  assert.deepEqual(evaluateCoach(context), result, "repeated reviews never compound a load");
  assert.equal(JSON.stringify(context), before);
});
test("three weeks away freezes an old increase, whether the user skipped logs or trained elsewhere", () => {
  const history = [exposure(21), exposure(24)];
  for (const gap of ["unknown", "elsewhere"]) { const result = run(history, { readiness: { ...readiness, gap } }); assert.equal(result.reason, "gap"); assert.equal(result.canApply, false); }
  const returning = run(history, { readiness: { ...readiness, gap: "break" } });
  assert.equal(returning.reason, "return"); assert.ok(returning.weight <= 100); assert.equal(returning.sets, 2);
  assert.notEqual(returning.key, run().key);
});
test("recent cardio does not reset bench recency; two new sessions are required after a gap", () => {
  assert.equal(run([exposure(0, { exerciseId: "treadmill" }), exposure(21), exposure(24)]).reason, "gap");
  assert.equal(run([exposure(1, { actualSets: [{ reps: 5, weight: 20, warmup: true }] }), exposure(21), exposure(24)]).reason, "gap", "warmup-only entries cannot reset training recency");
  assert.equal(run([exposure(1), exposure(22)]).reason, "hold");
  assert.equal(run([exposure(1), exposure(4), exposure(22)]).reason, "progress");
});
test("readiness and concern override positive performance; lighter days do not increase load", () => {
  for (const feeling of ["unknown", "low", "concern"]) {
    const result = run(undefined, { readiness: { ...readiness, feeling } });
    assert.notEqual(result.reason, "progress"); assert.ok(result.weight == null || result.weight <= 100);
    if (feeling === "concern") assert.equal(result.canApply, false);
  }
  assert.equal(run(undefined, { readiness: { ...readiness, lighter: true } }).sets, 2);
});
test("one hard session holds; repeated difficulty offers less volume", () => {
  const hard = (days) => exposure(days, { actualSets: [{ weight: 100, reps: 5, effort: "hard" }] });
  assert.equal(run([hard(2), exposure(5)]).reason, "hold");
  assert.equal(run([hard(2), hard(5)]).reason, "struggling");
});
test("unknown effort, missed sets, warmups and mixed set weights cannot qualify for increases", () => {
  for (const actualSets of [
    [{ weight: 100, reps: 10, effort: "easy" }],
    Array.from({ length: 3 }, () => ({ weight: 100, reps: 10 })),
    Array.from({ length: 3 }, () => ({ weight: 100, reps: 10, effort: "easy", warmup: true })),
    [{ weight: 100, reps: 10, effort: "easy" }, { weight: 100, reps: 7, effort: "easy" }, { weight: 95, reps: 10, effort: "easy" }]
  ]) assert.notEqual(run([exposure(2, { actualSets }), exposure(5)]).reason, "progress");
});
test("same session/day duplicates, future dates, other equipment and missing prescriptions cannot count as repeat success", () => {
  for (const history of [
    [exposure(2), exposure(2)], [exposure(2), exposure(5, { sessionId: "session-2" })], [exposure(-2), exposure(5)],
    [exposure(2, { prescription: { ...entry, load: { ...entry.load, equipmentKey: "Other gym" } } }), exposure(5)],
    [exposure(2, { prescription: undefined }), exposure(5)]
  ]) assert.notEqual(run(history).reason, "progress");
});
test("new, timed, unsupported units, no equipment confirmation and excessively large steps remain conservative", () => {
  assert.equal(run([]).reason, "calibrate");
  assert.equal(run(undefined, { entry: { ...entry, load: undefined } }).canApply, false);
  assert.equal(run(undefined, { entry: { ...entry, target: { kind: "duration", seconds: 30 } } }).canApply, false);
  assert.equal(run(undefined, { entry: { ...entry, load: { ...entry.load, unit: "kg" } } }).canApply, false);
  assert.equal(run(undefined, { readiness: { ...readiness, sameEquipment: false } }).canApply, false);
  assert.notEqual(run(undefined, { entry: { ...entry, load: { ...entry.load, increment: 50 } } }).reason, "progress");
});
test("program coaching without old load settings offers only bounded sets reductions and never invents weights", () => {
  const manual = { ...entry, load: undefined };
  assert.equal(run([], { entry: manual }).reason, "calibrate");
  for (const feedback of [{ ...readiness, lighter: true }, { ...readiness, feeling: "low" }]) {
    const proposal = run([], { entry: manual, readiness: feedback });
    assert.equal(proposal.canApply, true);
    assert.equal(proposal.weight, null);
    assert.equal(proposal.sets, 2);
    assert.notEqual(proposal.reason, "progress");
  }
  assert.equal(run([], { entry: { ...manual, sets: 1 }, readiness: { ...readiness, lighter: true } }).canApply, false, "never reduces below one set");
  assert.equal(run(undefined, { entry: manual }).weight, null, "even successful history does not invent equipment or load meaning");
  assert.equal(run(undefined, { entry: manual, readiness: { ...readiness, feeling: "concern", lighter: true } }).canApply, false);
  for (const gap of ["unknown", "elsewhere"]) assert.equal(run([exposure(21)], { entry: manual, readiness: { ...readiness, gap, lighter: true } }).canApply, false);
  const returning = run([exposure(21)], { entry: manual, readiness: { ...readiness, gap: "break" } });
  assert.equal(returning.reason, "return");
  assert.equal(returning.weight, null);
  assert.equal(returning.sets, 2);
  assert.equal(returning.canApply, true);
  assert.equal(run([], { entry: { ...manual, target: { kind: "duration", seconds: 30 } }, readiness: { ...readiness, lighter: true } }).canApply, false);
});
test("load increases need fresh successful evidence at the new load", () => {
  const next = exposure(1, { actualSets: Array.from({ length: 3 }, () => ({ weight: 105, reps: 10, effort: "moderate" })) });
  assert.equal(run([next, exposure(4)]).reason, "hold");
  assert.equal(run([next, { ...next, sessionId: "other", performedAt: exposure(4).performedAt }]).weight, 110);
});
test("proposal identity changes on midnight, history edits, readiness and prescription changes", () => {
  const original = run();
  assert.notEqual(run(undefined, { now: new Date(2026, 8, 30, 1) }).key, original.key);
  assert.notEqual(run([exposure(2)]).key, original.key);
  assert.notEqual(run(undefined, { readiness: { ...readiness, lighter: true } }).key, original.key);
  assert.notEqual(run(undefined, { entry: { ...entry, sets: 2 } }).key, original.key);
});
test("review counts real completed workout sessions and excludes future and warmup-only results", () => {
  const result = reviewTraining([exposure(2), exposure(2, { exerciseId: "row" }), exposure(5), exposure(21), exposure(-1)], now);
  assert.equal(result.sessions, 2); assert.equal(result.sets, 9); assert.equal(result.daysAway, 2);
  assert.equal(reviewTraining([], now).daysAway, null);
});
