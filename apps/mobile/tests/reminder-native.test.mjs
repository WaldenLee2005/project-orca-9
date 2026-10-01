import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const state = { platform: { OS: "ios" } };
const undetermined = () => ({ status: "undetermined", granted: false, canAskAgain: true });
const granted = () => ({ status: "granted", granted: true, canAskAgain: true });
function reset(platform = "ios") {
  state.platform.OS = platform;
  state.supported = true;
  state.permission = undetermined();
  state.requestResult = granted();
  state.calls = [];
  state.scheduled = [];
  state.presented = [];
  state.handler = null;
  state.listeners = new Set();
  state.lastResponse = null;
  state.getLastResponse = async () => state.lastResponse;
}
reset();
state.requireOptionalNativeModule = (name) => {
  assert.equal(name, "ExpoNotificationScheduler");
  return state.supported ? {} : null;
};
state.api = {
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  async setNotificationChannelAsync(id, options) { state.calls.push(["channel", id, options]); },
  async getPermissionsAsync() { state.calls.push(["permission"]); return state.permission; },
  async requestPermissionsAsync(options) { state.calls.push(["request", options]); state.permission = state.requestResult; return state.permission; },
  async getAllScheduledNotificationsAsync() { state.calls.push(["list"]); return state.scheduled; },
  async cancelScheduledNotificationAsync(id) { state.calls.push(["cancel", id]); },
  async scheduleNotificationAsync(value) { state.calls.push(["schedule", value]); return value.identifier; },
  async getPresentedNotificationsAsync() { state.calls.push(["presented"]); return state.presented; },
  async dismissNotificationAsync(id) { state.calls.push(["dismiss", id]); },
  setNotificationHandler(handler) { state.handler = handler; },
  addNotificationResponseReceivedListener(listener) {
    state.listeners.add(listener);
    return { remove() { state.listeners.delete(listener); } };
  },
  async getLastNotificationResponseAsync() { return state.getLastResponse(); },
  async clearLastNotificationResponseAsync() { state.calls.push(["clearResponse"]); state.lastResponse = null; }
};
globalThis.__orcaReminderNativeTest = state;
const mocks = {
  expo: "export const requireOptionalNativeModule = globalThis.__orcaReminderNativeTest.requireOptionalNativeModule;",
  "react-native": "export const Platform = globalThis.__orcaReminderNativeTest.platform;",
  "expo-notifications": Object.keys(state.api).map((name) => `export const ${name} = globalThis.__orcaReminderNativeTest.api.${name};`).join("\n")
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/reminders/notificationClient.ts")) {
    if (mocks[specifier]) return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}` };
    if (specifier === "./reminderScheduler") return nextResolve(new URL("../src/features/reminders/reminderScheduler.ts", import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
} });
const { notificationsSupported, getReminderPermission, notificationClient, dismissWorkoutReminders, observeReminderNotifications } = await import("../src/features/reminders/notificationClient.ts");
const dateKey = "2026-10-01";
const notification = (kind = "workout", key = dateKey, id = `orca-reminder:${key}:${kind}`) => ({
  request: { identifier: id, content: { data: { dateKey: key, kind } } }
});
const response = (notice, actionIdentifier = state.api.DEFAULT_ACTION_IDENTIFIER) => ({ notification: notice, actionIdentifier });
const calls = (name) => state.calls.filter(([action]) => action === name);
const hidden = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };

test("missing native support is safe and cannot prompt for notification permission", async () => {
  reset();
  state.supported = false;
  assert.equal(notificationsSupported(), false);
  assert.equal(await getReminderPermission(), "unsupported");
  assert.equal(await getReminderPermission(true), "unsupported");
  assert.deepEqual(await notificationClient.list(), []);
  await notificationClient.cancel("orca-reminder:2026-10-01:workout");
  await dismissWorkoutReminders();
  const cleanup = await observeReminderNotifications(async () => assert.fail("must not evaluate foreground notices"), () => assert.fail("must not navigate"));
  cleanup();
  assert.deepEqual(state.calls, []);
  assert.equal(state.handler, null);
  assert.equal(state.listeners.size, 0);
});

test("Android creates its reminder channel before checking or requesting permission", async () => {
  reset("android");
  assert.equal(await getReminderPermission(), "undetermined");
  assert.deepEqual(state.calls.map(([action]) => action), ["channel", "permission"]);
  assert.equal(calls("channel")[0][1], "orca-workout-reminders");
  assert.equal(calls("channel")[0][2].importance, state.api.AndroidImportance.DEFAULT);
  state.calls = [];
  assert.equal(await getReminderPermission(true), "granted");
  assert.deepEqual(state.calls.map(([action]) => action), ["channel", "permission", "request"]);
});

test("permission requests require explicit enable and respect permanent denial", async () => {
  reset();
  assert.equal(await getReminderPermission(), "undetermined");
  assert.equal(calls("request").length, 0);
  assert.equal(await getReminderPermission(true), "granted");
  assert.deepEqual(calls("request")[0][1], { ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  await getReminderPermission(true);
  assert.equal(calls("request").length, 1, "already granted permission is never requested again");

  state.calls = [];
  state.permission = { status: "denied", granted: false, canAskAgain: false };
  assert.equal(await getReminderPermission(true), "denied");
  assert.equal(calls("request").length, 0);

  state.permission = { status: "denied", granted: false, canAskAgain: true };
  state.requestResult = { status: "denied", granted: false, canAskAgain: false };
  assert.equal(await getReminderPermission(true), "denied");
  assert.equal(calls("request").length, 1);
});

test("iOS provisional and ephemeral permission can schedule without another prompt", async () => {
  for (const iosStatus of [state.api.IosAuthorizationStatus.PROVISIONAL, state.api.IosAuthorizationStatus.EPHEMERAL, state.api.IosAuthorizationStatus.AUTHORIZED]) {
    reset();
    state.permission = { status: "undetermined", granted: false, canAskAgain: true, ios: { status: iosStatus } };
    assert.equal(await getReminderPermission(true), "granted");
    assert.equal(calls("request").length, 0);
    assert.equal(calls("channel").length, 0, "iOS does not attempt Android channel setup");
  }
});

test("scheduling sends a dated local trigger and owned metadata; listing validates optional metadata", async () => {
  reset("android");
  const reminder = { id: `orca-reminder:${dateKey}:workout`, kind: "workout", dateKey, fireAt: new Date("2026-10-01T17:45:00-07:00"), title: "Time for your workout", body: "Your usual time is coming up." };
  await notificationClient.schedule(reminder, "schedule fingerprint");
  assert.deepEqual(calls("schedule")[0][1], {
    identifier: reminder.id,
    content: { title: reminder.title, body: reminder.body, sound: "default", data: {
      orcaReminder: true, kind: "workout", dateKey, fireAt: reminder.fireAt.getTime(), reminderFingerprint: "schedule fingerprint"
    } },
    trigger: { type: "date", date: reminder.fireAt, channelId: "orca-workout-reminders" }
  });
  state.scheduled = [
    { identifier: reminder.id, content: { data: { reminderFingerprint: "schedule fingerprint", fireAt: reminder.fireAt.getTime() } } },
    { identifier: "unrelated-notification", content: { data: { reminderFingerprint: 42, fireAt: "invalid" } } }
  ];
  assert.deepEqual(await notificationClient.list(), [
    { id: reminder.id, fingerprint: "schedule fingerprint", fireAt: reminder.fireAt.getTime() },
    { id: "unrelated-notification", fingerprint: undefined, fireAt: undefined }
  ]);
  await notificationClient.cancel(reminder.id);
  assert.deepEqual(calls("cancel"), [["cancel", reminder.id]]);
});

test("dismissal only removes Orca reminders, optionally limited to the completed or rest date", async () => {
  reset();
  const today = notification();
  const earlier = notification("streak", "2026-09-30");
  state.presented = [today, earlier, notification("workout", dateKey, "unrelated-notification")];
  await dismissWorkoutReminders(dateKey);
  assert.deepEqual(calls("dismiss"), [["dismiss", today.request.identifier]]);
  state.calls = [];
  await dismissWorkoutReminders();
  assert.deepEqual(calls("dismiss"), [["dismiss", today.request.identifier], ["dismiss", earlier.request.identifier]]);
});

test("foreground reminders honor live workout and rest checks and suppress errors or unrelated notices", async (t) => {
  reset();
  const checked = [];
  let shouldPresent = true;
  let failHistory = false;
  const cleanup = await observeReminderNotifications(async (key, kind) => {
    checked.push([key, kind]);
    if (failHistory) throw new Error("History unavailable");
    return shouldPresent;
  }, () => assert.fail("foreground presentation must not navigate"));
  t.after(cleanup);
  assert.deepEqual(await state.handler.handleNotification(notification()), { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false });
  assert.deepEqual(checked, [[dateKey, "workout"]]);
  shouldPresent = false;
  assert.deepEqual(await state.handler.handleNotification(notification("streak")), hidden);
  failHistory = true;
  assert.deepEqual(await state.handler.handleNotification(notification("rest")), hidden);
  const callsBeforeUnrelated = checked.length;
  assert.deepEqual(await state.handler.handleNotification(notification("workout", dateKey, "unrelated-notification")), hidden);
  assert.deepEqual(await state.handler.handleNotification({ request: { identifier: "orca-reminder:malformed", content: { data: {} } } }), hidden);
  assert.equal(checked.length, callsBeforeUnrelated);
});

test("a tap received live and on cold start navigates once, with cleanup for listeners and handler", async () => {
  reset();
  let opened = 0;
  const initialResponse = response(notification());
  state.getLastResponse = async () => {
    for (const listener of state.listeners) listener(initialResponse);
    return initialResponse;
  };
  const cleanup = await observeReminderNotifications(async () => true, () => { opened++; });
  try {
    assert.equal(opened, 1);
    assert.equal(calls("clearResponse").length, 1);
    assert.equal(state.listeners.size, 1);
    for (const listener of state.listeners) {
      listener(initialResponse);
      listener(response(notification("rest"), "dismiss"));
      listener(response(notification("workout", dateKey, "unrelated-notification")));
    }
    assert.equal(opened, 1, "duplicates, custom actions and unrelated notices cannot navigate");
    for (const listener of state.listeners) listener(response(notification("streak")));
    assert.equal(opened, 2, "a distinct reminder remains actionable");
    assert.equal(calls("clearResponse").length, 2);
  } finally { cleanup(); }
  assert.equal(state.listeners.size, 0);
  assert.equal(state.handler, null);
});

test("a failed initial response lookup cleans up the native listener and foreground handler", async () => {
  reset();
  state.getLastResponse = async () => { throw new Error("Response unavailable"); };
  await assert.rejects(observeReminderNotifications(async () => true, () => assert.fail("must not navigate")), /Response unavailable/);
  assert.equal(state.listeners.size, 0);
  assert.equal(state.handler, null);
  assert.equal(calls("clearResponse").length, 0);
});
