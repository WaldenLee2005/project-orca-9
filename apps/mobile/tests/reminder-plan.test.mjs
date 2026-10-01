import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/reminders/reminderPlan.ts") && specifier === "../programs/programModel") {
    return nextResolve(new URL("../programs/programModel.ts", context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
} });
const { buildReminderPlan } = await import("../src/features/reminders/reminderPlan.ts");
const local = (value) => new Date(value);
const plan = (overrides = {}) => buildReminderPlan({
  now: local("2026-10-01T06:00:00"), completedAt: [], restDates: [], scheduleHistory: [],
  fallbackMinute: 18 * 60, restMinute: 8 * 60, ...overrides
});
const day = (result, key = "2026-10-01") => result.reminders.filter((item) => item.dateKey === key);
const times = (result, key) => day(result, key).map((item) => [item.kind, item.fireAt.getHours(), item.fireAt.getMinutes()]);
const cycle = (effectiveFrom, startDate, dayKinds, programId = "program") => ({
  effectiveFrom, programId, schedule: { mode: "cycle", startDate }, dayKinds
});

test("new users get the selected fallback and a bounded 28-day schedule", () => {
  const result = plan();
  assert.equal(result.averageMinute, 18 * 60);
  assert.equal(result.sampleCount, 0);
  assert.deepEqual(times(result), [["workout", 17, 45], ["streak", 20, 0]]);
  assert.equal(result.reminders.length, 56);
  assert.equal(result.reminders.at(-1).dateKey, "2026-10-28");
  assert.equal(new Set(result.reminders.map((item) => item.id)).size, 56);
  assert.equal(result.reminders[0].id, "orca-reminder:2026-10-01:workout");
  assert.deepEqual(times(plan({ fallbackMinute: 9 * 60 + 30 })), [["workout", 9, 15], ["streak", 11, 30]]);
});

test("recent completion times adapt both reminders and an updated log changes the next plan", () => {
  const completedAt = ["2026-09-29T17:00:00", "2026-09-30T19:00:00"];
  const result = plan({ completedAt });
  assert.equal(result.averageMinute, 18 * 60);
  assert.equal(result.sampleCount, 2);
  assert.deepEqual(times(result), [["workout", 17, 45], ["streak", 20, 0]]);
  const updated = plan({ now: local("2026-10-01T20:01:00"), completedAt: [...completedAt, "2026-10-01T20:00:00"] });
  assert.ok(updated.averageMinute > result.averageMinute);
  assert.equal(updated.sampleCount, 3);
  assert.deepEqual(day(updated), [], "completion suppresses all today's pending reminders");
  assert.equal(completedAt.length, 2, "planning leaves the supplied history unchanged");
});

test("only the latest completion per local date counts; old, invalid, and future timestamps do not", () => {
  const result = plan({ completedAt: [
    "2026-09-30T10:00:00", "2026-09-30T18:00:00", "2026-09-30T18:00:00",
    "2026-09-29T18:00:00", "2026-09-04T18:00:00", "2026-09-03T10:00:00",
    "2026-10-01T23:00:00", "2026-10-02T10:00:00", "bad-date",
    "2026-09-31T01:00:00", "2026-09-30T24:00:00"
  ] });
  assert.equal(result.sampleCount, 3);
  assert.equal(result.averageMinute, 18 * 60);
  assert.equal(day(result).length, 2, "a future timestamp cannot cancel today's reminders");
  const history = Array.from({ length: 90 }, (_, i) => new Date(2026, 9, 1 - i, 18).toISOString());
  assert.equal(plan({ now: local("2026-10-01T20:00:00"), completedAt: history }).sampleCount, 28);
});

test("circular averaging handles midnight and clips both offsets to the same calendar day", () => {
  const midnight = plan({ completedAt: ["2026-09-29T23:50:00", "2026-09-30T00:10:00"] });
  assert.equal(midnight.averageMinute, 0);
  assert.deepEqual(times(midnight, "2026-10-02"), [["workout", 0, 0], ["streak", 2, 0]]);
  const late = plan({ completedAt: ["2026-09-30T23:50:00"] });
  assert.deepEqual(times(late), [["workout", 23, 35], ["streak", 23, 59]]);
  const early = plan({ fallbackMinute: 5 });
  assert.deepEqual(times(early, "2026-10-02"), [["workout", 0, 0], ["streak", 2, 5]]);
  const opposed = plan({ completedAt: ["2026-09-29T06:00:00", "2026-09-30T18:00:00"], fallbackMinute: 17 * 60 });
  assert.equal(opposed.averageMinute, 17 * 60, "opposite times have no unique mean");
});

test("completed and rest dates suppress workout and streak notices, with rest only in the morning", () => {
  const result = plan({ restDates: ["2026-10-01", "invalid", "2026-10-03"] });
  assert.deepEqual(times(result), [["rest", 8, 0]]);
  assert.deepEqual(times(result, "2026-10-02"), [["workout", 17, 45], ["streak", 20, 0]]);
  const completed = plan({ now: local("2026-10-01T07:00:00"), restDates: ["2026-10-01"], completedAt: ["2026-10-01T06:30:00"] });
  assert.deepEqual(day(completed), [], "a completed workout takes precedence over overlapping rest");
  assert.deepEqual(day(plan({ now: local("2026-10-01T09:00:00"), restDates: ["2026-10-01"] })), [], "a missed morning rest notice is not sent late");
});

test("schedule revisions, stops and start dates classify future rest without retroactive changes", () => {
  const scheduleHistory = [
    cycle("2026-09-28", "2026-09-28", ["training", "rest"]),
    cycle("2026-10-03", "2026-10-03", ["training", "training", "rest"], "replacement"),
    { effectiveFrom: "2026-10-06", programId: null, schedule: null, dayKinds: [] },
    cycle("2026-10-07", "2026-10-09", ["rest", "training"], "later")
  ];
  const result = plan({ scheduleHistory });
  for (const key of ["2026-10-01", "2026-10-05", "2026-10-09", "2026-10-11"]) {
    assert.deepEqual(times(result, key), [["rest", 8, 0]], key);
  }
  for (const key of ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-06", "2026-10-07", "2026-10-08"]) {
    assert.deepEqual(times(result, key).map(([kind]) => kind), ["workout", "streak"], key);
  }
});

test("weekly rest continues into the horizon without assuming future training was completed", () => {
  const scheduleHistory = [{ effectiveFrom: "2026-09-28", programId: "weekly",
    schedule: { mode: "weekly", startDate: "2026-09-28" },
    dayKinds: ["training", "training", "rest", "training", "training", "rest", "rest"] }];
  const result = plan({ scheduleHistory, completedAt: ["2026-09-28T18:00:00", "2026-09-29T18:00:00"] });
  assert.match(day(result).find((item) => item.kind === "streak").body, /3-day streak/);
  assert.deepEqual(times(result, "2026-10-03"), [["rest", 8, 0]]);
  assert.deepEqual(times(result, "2026-10-28"), [["rest", 8, 0]]);
  for (const reminder of result.reminders.filter((item) => item.kind === "streak" && item.dateKey !== "2026-10-01")) {
    assert.doesNotMatch(reminder.body, /\d+-day streak/);
  }
  const gap = plan({ completedAt: ["2026-09-28T18:00:00"], restDates: ["2026-09-30"] });
  assert.match(day(gap).find((item) => item.kind === "streak").body, /1-day streak/, "a rest day maintains a real one-day run but cannot bridge a missed workout");
  const noStreak = plan({ completedAt: ["2026-09-28T18:00:00"] });
  assert.doesNotMatch(day(noStreak).find((item) => item.kind === "streak").body, /\d+-day streak/);
});

test("expired triggers are omitted and saving before the follow-up clears it", () => {
  assert.deepEqual(times(plan({ now: local("2026-10-01T17:45:00") })), [["streak", 20, 0]]);
  assert.deepEqual(day(plan({ now: local("2026-10-01T20:00:00") })), []);
  assert.deepEqual(day(plan({ now: local("2026-10-01T19:00:00"), completedAt: ["2026-10-01T18:59:00"] })), []);
});

test("spring and fall DST keep morning and workout reminders at local clock times", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    for (const [now, before, after, elapsedHours] of [
      ["2026-03-07T00:00:00", "2026-03-07", "2026-03-08", 23],
      ["2026-10-31T00:00:00", "2026-10-31", "2026-11-01", 25]
    ]) {
      const result = plan({ now: local(now), restDates: [before, after] });
      assert.deepEqual(times(result, before), [["rest", 8, 0]]);
      assert.deepEqual(times(result, after), [["rest", 8, 0]]);
      assert.equal((day(result, after)[0].fireAt - day(result, before)[0].fireAt) / 3600000, elapsedHours);
      const training = plan({ now: local(now) });
      assert.deepEqual(times(training, before), [["workout", 17, 45], ["streak", 20, 0]]);
      assert.deepEqual(times(training, after), [["workout", 17, 45], ["streak", 20, 0]]);
      assert.equal(new Set(training.reminders.map((item) => item.dateKey)).size, 28);
    }
    const spring = plan({ now: local("2026-03-07T00:00:00"), fallbackMinute: 3 * 60 });
    assert.deepEqual(times(spring, "2026-03-08"), [["workout", 1, 45], ["streak", 5, 0]], "the pre-reminder precedes 03:00 despite the missing 02:00 hour");
    const fall = plan({ now: local("2026-10-31T00:00:00"), fallbackMinute: 1 * 60 + 45 });
    assert.deepEqual(times(fall, "2026-11-01"), [["workout", 1, 30], ["streak", 2, 45]], "the follow-up waits two actual hours across the repeated hour");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});
