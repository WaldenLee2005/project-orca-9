import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/programRestart.ts") && specifier === "./programModel") {
    return nextResolve(new URL("./programModel.ts", context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
} });
const { findMissedProgramDay } = await import("../src/features/programs/programRestart.ts");
const program = { id: "p", name: "Upper Lower", schedule: { mode: "cycle", startDate: "2026-10-01" },
  days: ["training", "rest", "training"].map((kind, index) => ({ id: `day-${index}`, name: "", kind, exercises: [] })) };
const revision = { effectiveFrom: "2026-10-01", programId: "p", schedule: program.schedule, dayKinds: program.days.map((day) => day.kind) };
const saved = (date, dayId, programId = "p") => ({ date, dayId, programId });

test("program misses require a closed training date and matching program/day completion", () => {
  assert.equal(findMissedProgramDay(program, revision, [], "2026-10-01"), null, "today is still open");
  assert.equal(findMissedProgramDay(program, revision, [], "2026-10-02"), "2026-10-01");
  assert.equal(findMissedProgramDay(program, revision, [saved("2026-10-01", "day-0")], "2026-10-03"), null, "planned rest is protected");
  assert.equal(findMissedProgramDay(program, revision, [saved("2026-10-01", "day-0")], "2026-10-04"), "2026-10-03");
  for (const completed of [saved("2026-10-01", "day-2"), saved("2026-10-01", "day-0", "other"), saved("2026-10-02", "day-0")]) {
    assert.equal(findMissedProgramDay(program, revision, [completed], "2026-10-03"), "2026-10-01");
  }
});

test("activation, future starts and newer revisions exclude earlier program misses", () => {
  assert.equal(findMissedProgramDay(program, { ...revision, effectiveFrom: "2026-10-03" }, [], "2026-10-03"), null);
  assert.equal(findMissedProgramDay(program, { ...revision, schedule: { mode: "cycle", startDate: "2026-10-10" } }, [], "2026-10-05"), null);
  assert.equal(findMissedProgramDay(program, { ...revision, programId: "other" }, [], "2026-10-05"), null);
  assert.equal(findMissedProgramDay(program, { ...revision, schedule: null }, [], "2026-10-05"), null);
  const restarted = { ...revision, effectiveFrom: "2026-10-03", schedule: { mode: "cycle", startDate: "2026-10-03" } };
  assert.equal(findMissedProgramDay(program, restarted, [saved("2026-10-03", "day-0")], "2026-10-05"), null);
  assert.equal(findMissedProgramDay(program, restarted, [saved("2026-10-03", "day-0")], "2026-10-06"), "2026-10-05");
});

test("weekly slots use their weekdays until restart and civil dates work across DST", () => {
  const weekly = { ...program, schedule: { mode: "weekly", startDate: "2026-10-01" },
    days: Array.from({ length: 7 }, (_, index) => ({ id: `day-${index}`, kind: index === 0 ? "training" : "rest" })) };
  const history = { ...revision, schedule: weekly.schedule, dayKinds: weekly.days.map((day) => day.kind) };
  assert.equal(findMissedProgramDay(weekly, history, [], "2026-10-05"), null);
  assert.equal(findMissedProgramDay(weekly, history, [], "2026-10-06"), "2026-10-05");
  const spring = { ...revision, effectiveFrom: "2026-03-07", schedule: { mode: "cycle", startDate: "2026-03-07" } };
  assert.equal(findMissedProgramDay(program, spring, [saved("2026-03-07", "day-0")], "2026-03-09"), null);
  assert.equal(findMissedProgramDay(program, spring, [saved("2026-03-07", "day-0")], "2026-03-10"), "2026-03-09");
});
