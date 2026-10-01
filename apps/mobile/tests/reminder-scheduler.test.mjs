import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileReminders, reminderFingerprint } from "../src/features/reminders/reminderScheduler.ts";

const date = (value) => new Date(value);
const now = date("2026-10-01T06:00:00");
function reminder(day = "2026-10-01", kind = "workout", time = "17:45:00", body = "Make time for your workout.") {
  return { id: `orca-reminder:${day}:${kind}`, dateKey: day, kind, fireAt: date(`${day}T${time}`), title: "Orca reminder", body };
}
function harness() {
  const state = { pending: new Map([["another-feature:notice", { id: "another-feature:notice", fireAt: now.getTime() + 1000 }]]), scheduled: [], cancelled: [], ledger: {}, saves: 0, failSchedule: null, failCancel: null, failSaveNumber: null };
  state.client = {
    async list() { return [...state.pending.values()].map((item) => ({ ...item })); },
    async cancel(id) {
      if (state.failCancel === id) throw new Error("Cancel failed");
      state.cancelled.push(id); state.pending.delete(id);
    },
    async schedule(item, fingerprint) {
      if (state.failSchedule === item.id) throw new Error("Schedule failed");
      state.scheduled.push(item.id);
      state.pending.set(item.id, { id: item.id, fingerprint, fireAt: item.fireAt.getTime() });
    }
  };
  state.save = async (ledger) => {
    state.saves++;
    if (state.failSaveNumber === state.saves) throw new Error("Ledger write failed");
    state.ledger = { ...ledger };
  };
  state.sync = (plan, clock = now) => reconcileReminders(state.client, plan, state.ledger, clock, state.save);
  return state;
}

test("scheduler is idempotent, changes only stale owned notices, and leaves unrelated notifications intact", async () => {
  const state = harness();
  const workout = reminder(), streak = reminder("2026-10-01", "streak", "20:00:00");
  assert.equal(await state.sync([workout, streak]), 2);
  assert.deepEqual(state.scheduled, [workout.id, streak.id]);
  assert.equal(await state.sync([workout, streak]), 2);
  assert.equal(state.scheduled.length, 2);
  assert.deepEqual(state.cancelled, []);
  const revised = reminder("2026-10-01", "workout", "18:15:00", "Your average session time changed.");
  assert.equal(await state.sync([revised, streak]), 2);
  assert.deepEqual(state.cancelled, [workout.id]);
  assert.deepEqual(state.scheduled, [workout.id, streak.id, workout.id]);
  assert.equal(state.pending.get(workout.id).fingerprint, reminderFingerprint(revised));
  assert.ok(state.pending.has("another-feature:notice"));
});

test("removed or disabled reminders cancel only owned notices and release future reservations", async () => {
  const state = harness();
  const workout = reminder(), rest = reminder("2026-10-02", "rest", "08:00:00");
  await state.sync([workout, rest]);
  assert.equal(await state.sync([rest]), 1);
  assert.equal(state.ledger[workout.id], undefined);
  assert.equal(await state.sync([]), 0);
  assert.deepEqual(state.ledger, {});
  assert.deepEqual([...state.pending.keys()], ["another-feature:notice"]);
  await state.sync([workout]);
  assert.equal(state.scheduled.filter((id) => id === workout.id).length, 2, "a cancelled future notice may be enabled again");
});

test("elapsed reservations prevent a second same-day nudge after the learned time moves later", async () => {
  const state = harness();
  const sent = reminder("2026-10-01", "workout", "09:00:00");
  await state.sync([sent]);
  state.pending.delete(sent.id); // The operating system delivered this notification.
  const previous = { ...state.ledger };
  const moved = reminder("2026-10-01", "workout", "13:00:00");
  const tomorrow = reminder("2026-10-02", "workout", "13:00:00");
  assert.equal(await state.sync([moved, tomorrow], date("2026-10-01T10:00:00")), 1);
  assert.equal(state.scheduled.filter((id) => id === sent.id).length, 1);
  assert.equal(state.ledger[sent.id], previous[sent.id]);
  assert.deepEqual(previous, { [sent.id]: sent.fireAt.getTime() }, "the input ledger is not mutated");
  await state.sync([], date("2026-10-01T10:00:00"));
  assert.equal(state.ledger[sent.id], sent.fireAt.getTime(), "turning reminders off retains today's already-delivered reservation");
  await state.sync([moved], date("2026-10-01T10:00:00"));
  assert.equal(state.scheduled.filter((id) => id === sent.id).length, 1);
  await state.sync([tomorrow], date("2026-10-02T06:00:00"));
  assert.equal(state.ledger[sent.id], undefined, "old dates are pruned on the next day");
});

test("pending elapsed metadata also prevents duplicates after an interrupted ledger save", async () => {
  const state = harness();
  const sent = reminder("2026-10-01", "workout", "09:00:00");
  state.pending.set(sent.id, { id: sent.id, fireAt: sent.fireAt.getTime(), fingerprint: reminderFingerprint(sent) });
  const moved = reminder("2026-10-01", "workout", "13:00:00");
  assert.equal(await state.sync([moved], date("2026-10-01T10:00:00")), 0);
  assert.deepEqual(state.scheduled, []);
  assert.equal(state.ledger[sent.id], sent.fireAt.getTime());
  assert.deepEqual(state.cancelled, [sent.id]);
});

test("a partial scheduling failure keeps successful reservations and retries only missing reminders", async () => {
  const state = harness();
  const first = reminder(), second = reminder("2026-10-01", "streak", "20:00:00");
  state.failSchedule = second.id;
  await assert.rejects(state.sync([first, second]), /Schedule failed/);
  assert.equal(state.pending.has(first.id), true);
  assert.equal(state.pending.has(second.id), false);
  assert.deepEqual(state.ledger, { [first.id]: first.fireAt.getTime() });
  state.failSchedule = null;
  assert.equal(await state.sync([first, second]), 2);
  assert.deepEqual(state.scheduled, [first.id, second.id]);
});

test("a ledger failure after OS scheduling recovers from pending metadata without scheduling a duplicate", async () => {
  const state = harness();
  const first = reminder(), second = reminder("2026-10-01", "streak", "20:00:00");
  state.failSaveNumber = 2; // The first save succeeds; the reservation save fails after scheduling.
  await assert.rejects(state.sync([first, second]), /Ledger write failed/);
  assert.deepEqual(state.ledger, {});
  assert.deepEqual(state.scheduled, [first.id]);
  state.failSaveNumber = null;
  assert.equal(await state.sync([first, second]), 2);
  assert.deepEqual(state.scheduled, [first.id, second.id]);
  assert.deepEqual(state.ledger, { [first.id]: first.fireAt.getTime(), [second.id]: second.fireAt.getTime() });
});

test("failed cancellation does not schedule a conflicting replacement and remains retryable", async () => {
  const state = harness();
  const original = reminder(), changed = reminder("2026-10-01", "workout", "18:15:00");
  await state.sync([original]);
  state.failCancel = original.id;
  await assert.rejects(state.sync([changed]), /Cancel failed/);
  assert.deepEqual(state.scheduled, [original.id]);
  assert.equal(state.pending.get(original.id).fingerprint, reminderFingerprint(original));
  state.failCancel = null;
  await state.sync([changed]);
  assert.deepEqual(state.scheduled, [original.id, changed.id]);
  assert.equal(state.pending.get(original.id).fingerprint, reminderFingerprint(changed));
});
