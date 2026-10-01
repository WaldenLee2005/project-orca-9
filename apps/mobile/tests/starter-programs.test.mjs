import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { getScheduledDayIndex, getScheduledRestDates, reviseSchedule, validateProgram } from "../src/features/programs/programModel.ts";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/starterPrograms.ts") && specifier === "./programModel") return nextResolve(new URL("./programModel.ts", context.parentURL).href, context);
  return nextResolve(specifier, context);
} });
const { STARTER_PROGRAMS, createStarterProgram, starterSetSummary } = await import("../src/features/programs/starterPrograms.ts");
const dataset = JSON.parse(readFileSync(new URL("../assets/repdb/exercises.json", import.meta.url), "utf8")).exercises;
const catalog = dataset.map((exercise) => ({ id: exercise.id, name: exercise.name_en }));
let nextId = 0;
const createId = (prefix) => `${prefix}-${++nextId}`;
const copy = (id, start = "2026-09-07") => createStarterProgram(id, start, catalog, createId);
const dateAt = (offset) => new Date(Date.UTC(2026, 8, 7 + offset)).toISOString().slice(0, 10);
const primaryGroups = {
  chest: ["pectoralis_major"], back: ["latissimus_dorsi", "rhomboids"], shoulders: ["anterior_deltoid", "lateral_deltoid", "posterior_deltoid"],
  biceps: ["biceps_brachii"], triceps: ["triceps_brachii"], quads: ["quadriceps"], hamstrings: ["hamstrings"], glutes: ["gluteus_maximus"],
  calves: ["gastrocnemius", "soleus"], core: ["rectus_abdominis", "transverse_abdominis"]
};
const directSets = (day, muscles) => day.exercises.reduce((sum, entry) => sum + (dataset.find((item) => item.id === entry.exerciseId).primary_muscles.some((muscle) => muscles.includes(muscle)) ? entry.sets : 0), 0);

test("all three starter programs validate against the real RepDB catalog with moderate working sets and no invented loads", () => {
  assert.deepEqual(STARTER_PROGRAMS.map((starter) => starter.id), ["push-pull-legs", "upper-lower", "full-body-eod"]);
  for (const starter of STARTER_PROGRAMS) {
    const program = copy(starter.id);
    assert.deepEqual(validateProgram(program), program);
    assert.equal(program.id, undefined);
    assert.equal(program.days.length, starter.mode === "weekly" ? 7 : 4);
    for (const day of program.days) {
      if (day.kind === "rest") { assert.deepEqual(day.exercises, []); continue; }
      const sets = day.exercises.reduce((sum, entry) => sum + entry.sets, 0);
      assert.ok(sets >= 10 && sets <= 16, `${starter.id}: ${day.name} has ${sets} working sets`);
      assert.equal(new Set(day.exercises.map((entry) => entry.exerciseId)).size, day.exercises.length);
      for (const entry of day.exercises) {
        assert.equal(entry.exerciseName, catalog.find((exercise) => exercise.id === entry.exerciseId).name);
        assert.ok(entry.sets >= 1 && entry.sets <= 3);
        assert.equal(entry.load, undefined);
        assert.ok(entry.target.kind === "repRange" || entry.target.kind === "duration");
      }
    }
  }
  assert.deepEqual(STARTER_PROGRAMS.map(starterSetSummary), ["10–13 working sets / session", "13–16 working sets / session", "14 working sets / session"]);
});

test("weekly presets directly train each major group at least twice, without inflating volume from secondary muscles", () => {
  for (const starter of STARTER_PROGRAMS.filter((item) => item.mode === "weekly")) {
    const program = copy(starter.id);
    for (const [group, muscles] of Object.entries(primaryGroups)) {
      const days = program.days.map((day) => directSets(day, muscles));
      assert.ok(days.filter((sets) => sets > 0).length >= 2, `${starter.id}: ${group} needs two exposures`);
      assert.ok(days.reduce((sum, sets) => sum + sets, 0) <= 12, `${starter.id}: ${group} exceeds starter volume`);
    }
    for (const group of ["chest", "back", "quads", "hamstrings", "glutes"]) {
      assert.ok(program.days.reduce((sum, day) => sum + directSets(day, primaryGroups[group]), 0) >= 6);
    }
  }
});

test("weekly rest days are fixed to weekdays, including midweek starts", () => {
  const expected = { "push-pull-legs": [6], "upper-lower": [2, 5, 6] };
  for (const [id, restIndices] of Object.entries(expected)) {
    const program = copy(id, "2026-09-09");
    assert.deepEqual(program.days.flatMap((day, index) => day.kind === "rest" ? [index] : []), restIndices);
    assert.equal(getScheduledDayIndex(program.schedule, 7, "2026-09-08"), -1);
    assert.equal(getScheduledDayIndex(program.schedule, 7, "2026-09-09"), 2);
    const history = reviseSchedule([], { ...program, id: "saved" }, "2026-09-09");
    assert.deepEqual(getScheduledRestDates(history, "2026-09-13"), restIndices.filter((i) => i >= 2).map(dateAt));
  }
});

test("FBEOD alternates training/rest across calendar weeks, with 3–4 full-body exposures per rolling seven days", () => {
  const program = copy("full-body-eod");
  assert.deepEqual(program.days.map((day) => day.kind), ["training", "rest", "training", "rest"]);
  for (let start = 0; start < 21; start++) {
    const week = Array.from({ length: 7 }, (_, index) => program.days[getScheduledDayIndex(program.schedule, 4, dateAt(start + index))]);
    assert.equal(week.filter((day) => day.kind === "training").length, start % 2 === 0 ? 4 : 3);
    for (const muscles of Object.values(primaryGroups)) assert.equal(week.filter((day) => directSets(day, muscles) > 0).length, start % 2 === 0 ? 4 : 3);
  }
  const history = reviseSchedule([], { ...program, id: "saved" }, "2026-09-07");
  assert.deepEqual(getScheduledRestDates(history, "2026-09-20"), [1, 3, 5, 7, 9, 11, 13].map(dateAt));
});

test("using a preset creates independent editable copies with fresh identities and nested targets", () => {
  for (const starter of STARTER_PROGRAMS) {
    const before = JSON.stringify(starter);
    const first = copy(starter.id), second = copy(starter.id);
    const ids = (program) => program.days.flatMap((day) => [day.id, ...day.exercises.map((entry) => entry.id)]);
    const all = [...ids(first), ...ids(second)];
    assert.equal(new Set(all).size, all.length);
    first.days[0].exercises[0].target.min = 20;
    first.days[0].exercises[0].sets = 10;
    first.days[0].name = "Changed";
    first.days.pop();
    assert.equal(JSON.stringify(starter), before);
    assert.notEqual(second.days[0].exercises[0].sets, 10);
    assert.equal(second.days.length, starter.days.length);
  }
});

test("unknown presets, missing catalog exercises, and invalid start dates fail without producing a partial plan", () => {
  assert.throws(() => copy("unknown"), /unavailable/);
  assert.throws(() => createStarterProgram("upper-lower", "2026-09-07", [], createId), /exercise is unavailable/);
  assert.throws(() => copy("upper-lower", "2026-02-30"), /date/i);
});
