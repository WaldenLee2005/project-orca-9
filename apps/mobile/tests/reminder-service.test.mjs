import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const SETTINGS_KEY = "orca9.reminderSettings.v1";
const LEDGER_KEY = "orca9.reminderLedger.v1";
let importId = 0;
const modules = {
  "@react-native-async-storage/async-storage": `export default {
    getItem: (key) => globalThis.__orcaReminderServiceTest.storage.getItem(key),
    setItem: (key, value) => globalThis.__orcaReminderServiceTest.storage.setItem(key, value)
  };`,
  "../../storage/reminderRepository": "export const getReminderHistory = () => globalThis.__orcaReminderServiceTest.getHistory();",
  "./notificationClient": `export const getReminderPermission = (request = false) => globalThis.__orcaReminderServiceTest.getPermission(request);
    export const dismissWorkoutReminders = (dateKey) => globalThis.__orcaReminderServiceTest.dismiss(dateKey);
    export const notificationClient = {
      list: () => globalThis.__orcaReminderServiceTest.client.list(),
      cancel: (id) => globalThis.__orcaReminderServiceTest.client.cancel(id),
      schedule: (item, fingerprint) => globalThis.__orcaReminderServiceTest.client.schedule(item, fingerprint)
    };`
};
registerHooks({ resolve(specifier, context, nextResolve) {
  const parent = context.parentURL?.split("?")[0];
  if (parent?.endsWith("/reminders/reminderService.ts") && modules[specifier]) return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(modules[specifier])}` };
  if (parent?.includes("/features/reminders/") && ["../programs/programModel", "./reminderPlan", "./reminderScheduler"].includes(specifier)) {
    return nextResolve(new URL(`${specifier}.ts`, parent).href, context);
  }
  return nextResolve(specifier, context);
} });

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function setup(t, time = "2026-10-01T06:00:00") {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(time).getTime() });
  const state = {
    values: new Map(), permission: "granted", permissions: [], dismissed: [],
    history: { completedAt: [], restDates: [], scheduleHistory: [] }, historyReads: 0,
    pending: new Map([["another-feature:notice", { id: "another-feature:notice" }]]),
    scheduled: [], cancelled: [], settingsWrites: [], failHistory: false, failSettingsWrite: false, failSchedule: null,
    settingsGate: null
  };
  state.storage = {
    async getItem(key) { return state.values.get(key) ?? null; },
    async setItem(key, value) {
      if (key === SETTINGS_KEY) {
        if (state.failSettingsWrite) throw new Error("Settings disk full");
        if (state.settingsGate) {
          const gate = state.settingsGate;
          state.settingsGate = null;
          gate.started.resolve(); await gate.release.promise;
        }
        state.settingsWrites.push(JSON.parse(value));
      }
      state.values.set(key, value);
    }
  };
  state.getHistory = async () => {
    state.historyReads++;
    if (state.failHistory) throw new Error("Training history could not be read");
    return structuredClone(state.history);
  };
  state.getPermission = async (request) => { state.permissions.push(request); return state.permission; };
  state.dismiss = async (dateKey) => { state.dismissed.push(dateKey); };
  state.client = {
    async list() { return [...state.pending.values()].map((item) => ({ ...item })); },
    async cancel(id) { state.cancelled.push(id); state.pending.delete(id); },
    async schedule(item, fingerprint) {
      if (state.failSchedule === item.id) throw new Error("Notification scheduling failed");
      state.scheduled.push({ ...item });
      state.pending.set(item.id, { id: item.id, fingerprint, fireAt: item.fireAt.getTime(), kind: item.kind, dateKey: item.dateKey });
    }
  };
  globalThis.__orcaReminderServiceTest = state;
  const service = await import(`../src/features/reminders/reminderService.ts?service-test=${++importId}`);
  return { state, service };
}
const owned = (state) => [...state.pending.values()].filter((item) => item.id.startsWith("orca-reminder:"));
const today = (state) => owned(state).filter((item) => item.dateKey === "2026-10-01");

test("permission is requested only by Enable; denial, revocation and disabling cancel owned reminders", async (t) => {
  const { state, service } = await setup(t);
  await service.refreshReminders();
  assert.equal(service.getReminderState().loaded, true);
  assert.deepEqual(state.permissions, [false]);
  assert.equal(state.historyReads, 0, "disabled reminders do not load training history");
  state.permission = "denied";
  await service.setRemindersEnabled(true);
  assert.equal(service.getReminderState().enabled, false);
  assert.equal(service.getReminderState().permission, "denied");
  assert.deepEqual(state.permissions, [false, true, false]);
  assert.equal(owned(state).length, 0);
  state.permission = "granted";
  await service.setRemindersEnabled(true);
  assert.equal(service.getReminderState().scheduledCount, 56);
  const scheduled = state.scheduled.length;
  await service.refreshReminders();
  assert.equal(state.scheduled.length, scheduled, "ordinary refresh is idempotent");
  state.permission = "denied";
  await service.refreshReminders();
  assert.equal(service.getReminderState().enabled, true, "revocation retains the user's preference for recovery in device Settings");
  assert.equal(service.getReminderState().permission, "denied");
  assert.equal(service.getReminderState().scheduledCount, 0);
  assert.equal(owned(state).length, 0);
  assert.ok(state.pending.has("another-feature:notice"));
  state.permission = "granted";
  await service.refreshReminders();
  assert.equal(owned(state).length, 56);
  await service.setRemindersEnabled(false);
  assert.equal(service.getReminderState().enabled, false);
  assert.equal(owned(state).length, 0);
  assert.equal(state.permissions.filter(Boolean).length, 2, "background refresh, time updates, and disabling cannot prompt");
  assert.deepEqual(JSON.parse(state.values.get(SETTINGS_KEY)), { enabled: false, fallbackMinute: 1080, restMinute: 480 });
});

test("concurrent preference changes serialize without losing the latest time or enabled state", async (t) => {
  const { state, service } = await setup(t);
  await service.refreshReminders();
  const gate = { started: deferred(), release: deferred() };
  state.settingsGate = gate;
  const first = service.updateReminderTimes({ fallbackMinute: 600, restMinute: 420 });
  const enabled = service.setRemindersEnabled(true);
  const last = service.updateReminderTimes({ fallbackMinute: 900, restMinute: 480 });
  await gate.started.promise;
  assert.equal(service.getReminderState().busy, true);
  assert.deepEqual(state.settingsWrites, []);
  assert.equal(state.permissions.filter(Boolean).length, 0, "Enable waits for the earlier preference save");
  gate.release.resolve();
  await Promise.all([first, enabled, last]);
  assert.deepEqual(state.settingsWrites, [
    { enabled: false, fallbackMinute: 600, restMinute: 420 },
    { enabled: true, fallbackMinute: 600, restMinute: 420 },
    { enabled: true, fallbackMinute: 900, restMinute: 480 }
  ]);
  assert.equal(service.getReminderState().busy, false);
  assert.equal(service.getReminderState().enabled, true);
  assert.equal(service.getReminderState().averageMinute, 900);
  assert.deepEqual(today(state).map((item) => [item.kind, new Date(item.fireAt).getHours(), new Date(item.fireAt).getMinutes()]), [["workout", 14, 45], ["streak", 17, 0]]);
  assert.equal(state.permissions.filter(Boolean).length, 1);
});

test("saving a completed session cancels today's follow-up and adapts the remaining schedule", async (t) => {
  const { state, service } = await setup(t, "2026-10-01T18:30:00");
  state.history.completedAt = [new Date("2026-09-30T18:00:00").toISOString()];
  await service.setRemindersEnabled(true);
  assert.equal(service.getReminderState().averageMinute, 1080);
  assert.deepEqual(today(state).map((item) => item.kind), ["streak"]);
  state.history.completedAt.push(new Date("2026-10-01T18:20:00").toISOString());
  await service.refreshReminders();
  assert.equal(service.getReminderState().averageMinute, 1090);
  assert.equal(service.getReminderState().sampleCount, 2);
  assert.deepEqual(today(state), []);
  const tomorrow = state.pending.get("orca-reminder:2026-10-02:workout");
  assert.equal(new Date(tomorrow.fireAt).getHours(), 17);
  assert.equal(new Date(tomorrow.fireAt).getMinutes(), 55);
  assert.ok(state.cancelled.includes("orca-reminder:2026-10-01:streak"));
  assert.ok(state.dismissed.includes("2026-10-01"));
  assert.equal(await service.shouldPresentReminder("2026-10-01", "streak"), false);
});

test("marking a rest day replaces workout and streak notices with the selected morning reminder", async (t) => {
  const { state, service } = await setup(t);
  await service.setRemindersEnabled(true);
  assert.deepEqual(today(state).map((item) => item.kind), ["workout", "streak"]);
  state.history.restDates = ["2026-10-01"];
  await service.refreshReminders();
  assert.deepEqual(today(state).map((item) => [item.kind, new Date(item.fireAt).getHours()]), [["rest", 8]]);
  assert.equal(await service.shouldPresentReminder("2026-10-01", "workout"), false);
  assert.equal(await service.shouldPresentReminder("2026-10-01", "streak"), false);
  assert.equal(await service.shouldPresentReminder("2026-10-01", "rest"), true);
  assert.equal(await service.shouldPresentReminder("2026-10-02", "rest"), false);
  t.mock.timers.setTime(new Date("2026-10-01T09:00:00").getTime());
  await service.refreshReminders();
  assert.deepEqual(today(state), [], "an elapsed morning reminder is not moved to later in the day");
  state.history.restDates = [];
  state.history.scheduleHistory = [{ effectiveFrom: "2026-10-01", programId: "program", schedule: { mode: "cycle", startDate: "2026-10-01" }, dayKinds: ["rest", "training"] }];
  assert.equal(await service.shouldPresentReminder("2026-10-01", "rest"), true, "scheduled recovery gets the same foreground protection as manual rest");
  assert.equal(await service.shouldPresentReminder("2026-10-01", "workout"), false);
});

test("unreadable training history removes stale nudges, reports the error, and retries without changing preferences", async (t) => {
  const { state, service } = await setup(t);
  await service.setRemindersEnabled(true);
  const preferences = state.values.get(SETTINGS_KEY);
  state.failHistory = true;
  await assert.rejects(service.refreshReminders(), /Training history could not be read/);
  assert.equal(service.getReminderState().busy, false);
  assert.match(service.getReminderState().error, /Training history could not be read/);
  assert.equal(service.getReminderState().scheduledCount, 0);
  assert.equal(owned(state).length, 0);
  assert.equal(state.values.get(SETTINGS_KEY), preferences);
  assert.ok(state.pending.has("another-feature:notice"));
  state.failHistory = false;
  await service.refreshReminders();
  assert.equal(owned(state).length, 56);
  assert.equal(service.getReminderState().error, null);
  assert.equal(state.permissions.filter(Boolean).length, 1);
});

test("failed preference writes preserve the saved value, leave the queue usable, and reject invalid time inputs", async (t) => {
  const { state, service } = await setup(t);
  await service.refreshReminders();
  state.failSettingsWrite = true;
  await assert.rejects(service.setRemindersEnabled(true), /Settings disk full/);
  assert.equal(service.getReminderState().enabled, false);
  assert.equal(owned(state).length, 0);
  assert.equal(state.values.has(SETTINGS_KEY), false);
  state.failSettingsWrite = false;
  await service.setRemindersEnabled(true);
  const before = state.values.get(SETTINGS_KEY);
  for (const value of [-1, 1440, NaN, 8.5]) {
    await assert.rejects(service.updateReminderTimes({ fallbackMinute: value, restMinute: 480 }), /valid reminder time/);
  }
  assert.equal(state.values.get(SETTINGS_KEY), before);
  await service.refreshReminders();
  assert.equal(service.getReminderState().error, null);
  assert.equal(service.getReminderState().busy, false);
});

test("corrupt settings and ledgers remain intact and fail visibly instead of inventing defaults", async (t) => {
  const { state, service } = await setup(t);
  state.values.set(SETTINGS_KEY, "corrupt settings");
  await assert.rejects(service.refreshReminders(), /settings could not be read/);
  await assert.rejects(service.setRemindersEnabled(true), /settings could not be read/);
  assert.equal(state.values.get(SETTINGS_KEY), "corrupt settings");
  assert.equal(state.permissions.length, 0);
  state.values.set(SETTINGS_KEY, JSON.stringify({ enabled: true, fallbackMinute: 1080, restMinute: 480 }));
  state.values.set(LEDGER_KEY, JSON.stringify({ "another-feature:notice": 123 }));
  await assert.rejects(service.refreshReminders(), /schedule could not be read/);
  assert.equal(state.values.get(LEDGER_KEY), JSON.stringify({ "another-feature:notice": 123 }));
  assert.equal(owned(state).length, 0);
  assert.equal(state.historyReads, 0);
  state.values.delete(LEDGER_KEY);
  await service.refreshReminders();
  assert.equal(owned(state).length, 56);
});

test("unsupported devices do not read training history or schedule notifications", async (t) => {
  const { state, service } = await setup(t);
  state.permission = "unsupported";
  state.values.set(SETTINGS_KEY, JSON.stringify({ enabled: true, fallbackMinute: 1080, restMinute: 480 }));
  await service.refreshReminders();
  assert.equal(service.getReminderState().permission, "unsupported");
  assert.equal(service.getReminderState().scheduledCount, 0);
  assert.equal(state.historyReads, 0);
  assert.deepEqual(state.scheduled, []);
  assert.deepEqual(state.permissions, [false]);
});

test("Disable removes stale notifications even when the saved schedule ledger is corrupt", async (t) => {
  const { state, service } = await setup(t);
  await service.setRemindersEnabled(true);
  assert.equal(owned(state).length, 56);
  state.values.set(LEDGER_KEY, "corrupt ledger");
  await assert.rejects(service.setRemindersEnabled(false), /schedule could not be read/);
  assert.equal(service.getReminderState().enabled, false);
  assert.equal(JSON.parse(state.values.get(SETTINGS_KEY)).enabled, false);
  assert.equal(service.getReminderState().scheduledCount, 0);
  assert.equal(owned(state).length, 0);
  assert.equal(state.values.get(LEDGER_KEY), "corrupt ledger", "cancellation cannot silently overwrite corrupt storage");
  assert.ok(state.pending.has("another-feature:notice"));
  assert.match(service.getReminderState().error, /schedule could not be read/);
});

test("a partial OS scheduling failure clears incomplete reminders and can retry from saved preferences", async (t) => {
  const { state, service } = await setup(t);
  state.failSchedule = "orca-reminder:2026-10-01:streak";
  await assert.rejects(service.setRemindersEnabled(true), /Notification scheduling failed/);
  assert.equal(service.getReminderState().enabled, true);
  assert.equal(service.getReminderState().busy, false);
  assert.equal(owned(state).length, 0, "a partial plan is removed until it can be reconciled successfully");
  assert.ok(state.cancelled.includes("orca-reminder:2026-10-01:workout"));
  assert.ok(state.pending.has("another-feature:notice"));
  state.failSchedule = null;
  await service.refreshReminders();
  assert.equal(owned(state).length, 56);
  assert.equal(service.getReminderState().error, null);
  assert.equal(state.permissions.filter(Boolean).length, 1, "retry does not request permission again");
});

test("future and impossible completion timestamps cannot suppress today's foreground reminders", async (t) => {
  const { state, service } = await setup(t);
  state.history.completedAt = ["2026-10-01T23:00:00", "2026-09-31T00:00:00", "2026-10-01T99:00:00"];
  await service.setRemindersEnabled(true);
  assert.equal(service.getReminderState().sampleCount, 0);
  assert.deepEqual(today(state).map((item) => item.kind), ["workout", "streak"]);
  assert.equal(state.dismissed.includes("2026-10-01"), false);
  assert.equal(await service.shouldPresentReminder("2026-10-01", "workout"), true);
  assert.equal(await service.shouldPresentReminder("2026-10-01", "streak"), true);
  assert.equal(await service.shouldPresentReminder("2026-10-01", "unknown"), false);
  assert.equal(await service.shouldPresentReminder("2026-09-30", "workout"), false);
  state.history.completedAt.push(new Date("2026-10-01T05:30:00").toISOString());
  assert.equal(await service.shouldPresentReminder("2026-10-01", "workout"), false);
  assert.equal(await service.shouldPresentReminder("2026-10-01", "streak"), false);
});
