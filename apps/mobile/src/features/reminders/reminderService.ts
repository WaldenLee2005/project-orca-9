import AsyncStorage from "@react-native-async-storage/async-storage";
import { getReminderHistory } from "../../storage/reminderRepository";
import { getScheduledRestDates, localDateKey } from "../programs/programModel";
import { buildReminderPlan, getValidCompletions } from "./reminderPlan";
import { dismissWorkoutReminders, getReminderPermission, notificationClient, type ReminderPermission } from "./notificationClient";
import { reconcileReminders, REMINDER_PREFIX, type ReminderLedger } from "./reminderScheduler";

const SETTINGS_KEY = "orca9.reminderSettings.v1";
const LEDGER_KEY = "orca9.reminderLedger.v1";
type Preferences = { enabled: boolean; fallbackMinute: number; restMinute: number };
export type ReminderState = Preferences & {
  loaded: boolean; permission: ReminderPermission; averageMinute: number;
  sampleCount: number; scheduledCount: number; error: string | null; busy: boolean;
};
let state: ReminderState = {
  loaded: false, enabled: false, fallbackMinute: 18 * 60, restMinute: 8 * 60,
  permission: "undetermined", averageMinute: 18 * 60, sampleCount: 0,
  scheduledCount: 0, error: null, busy: false
};
const listeners = new Set<() => void>();
let queue: Promise<unknown> = Promise.resolve();
let queued = 0;
export function getReminderState() { return state; }
export function subscribeToReminders(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(update: Partial<ReminderState>) {
  state = { ...state, ...update };
  for (const listener of listeners) listener();
}
const validMinute = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 1440;

async function loadSettings() {
  if (state.loaded) return;
  const stored = await AsyncStorage.getItem(SETTINGS_KEY);
  if (stored !== null) {
    let value;
    try { value = JSON.parse(stored); } catch { throw new Error("Your reminder settings could not be read. Please retry."); }
    if (!value || typeof value.enabled !== "boolean" || !validMinute(value.fallbackMinute) || !validMinute(value.restMinute)) {
      throw new Error("Your reminder settings could not be read. Nothing has been overwritten.");
    }
    publish({ enabled: value.enabled, fallbackMinute: value.fallbackMinute, restMinute: value.restMinute });
  }
  publish({ loaded: true });
}

async function saveSettings(preferences: Preferences) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
  publish(preferences);
}
async function readLedger(): Promise<ReminderLedger> {
  const stored = await AsyncStorage.getItem(LEDGER_KEY);
  if (stored === null) return {};
  let value;
  try { value = JSON.parse(stored); } catch { throw new Error("Your reminder schedule could not be read. Please retry."); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.entries(value).some(([id, at]) => !id.startsWith("orca-reminder:") || typeof at !== "number" || !Number.isFinite(at))) {
    throw new Error("Your reminder schedule could not be read. Please retry.");
  }
  return value;
}
async function saveLedger(value: ReminderLedger) { await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(value)); }

async function cancelPendingReminders() {
  for (const item of await notificationClient.list()) {
    if (item.id.startsWith(REMINDER_PREFIX)) await notificationClient.cancel(item.id);
  }
  await dismissWorkoutReminders();
  publish({ scheduledCount: 0 });
}

function run(action: () => Promise<void>) {
  queued += 1;
  publish({ busy: true });
  const result = queue.then(async () => {
    try { await action(); publish({ error: null }); }
    catch (error) {
      // A corrupt preference/ledger must never prevent stopping stale OS notices.
      // Preserve the unreadable value for retry; cancellation does not depend on it.
      await cancelPendingReminders().catch(() => {});
      publish({ error: error instanceof Error ? error.message : "Could not update reminders. Please retry." });
      throw error;
    } finally { queued -= 1; publish({ busy: queued > 0 }); }
  });
  queue = result.catch(() => {});
  return result;
}

async function sync() {
  await loadSettings();
  const permission = await getReminderPermission();
  publish({ permission });
  if (permission === "unsupported") { publish({ scheduledCount: 0 }); return; }
  const now = new Date();
  if (!state.enabled || permission !== "granted") {
    await cancelPendingReminders();
    const ledger = await readLedger();
    const scheduledCount = await reconcileReminders(notificationClient, [], ledger, now, saveLedger);
    publish({ scheduledCount });
    return;
  }
  const ledger = await readLedger();
  let history;
  try { history = await getReminderHistory(); }
  catch (error) {
    // If schedules/history cannot be read, remove stale nudges instead of guessing.
    await reconcileReminders(notificationClient, [], ledger, now, saveLedger);
    publish({ scheduledCount: 0 });
    throw error;
  }
  const plan = buildReminderPlan({ ...history, now, fallbackMinute: state.fallbackMinute, restMinute: state.restMinute });
  const scheduledCount = await reconcileReminders(notificationClient, plan.reminders, ledger, now, saveLedger);
  const today = localDateKey(now);
  if (getValidCompletions(history.completedAt, now).some((at) => localDateKey(at) === today) || history.restDates.includes(today) || getScheduledRestDates(history.scheduleHistory, today).includes(today)) {
    await dismissWorkoutReminders(today);
  }
  publish({ averageMinute: plan.averageMinute, sampleCount: plan.sampleCount, scheduledCount });
}

export function refreshReminders() { return run(sync); }
export function setRemindersEnabled(enabled: boolean) {
  return run(async () => {
    await loadSettings();
    if (enabled) {
      const permission = await getReminderPermission(true);
      publish({ permission });
      if (permission !== "granted") {
        await saveSettings({ enabled: false, fallbackMinute: state.fallbackMinute, restMinute: state.restMinute });
        await sync();
        return;
      }
    }
    await saveSettings({ enabled, fallbackMinute: state.fallbackMinute, restMinute: state.restMinute });
    await sync();
  });
}
export function updateReminderTimes(times: { fallbackMinute: number; restMinute: number }) {
  return run(async () => {
    await loadSettings();
    if (!validMinute(times.fallbackMinute) || !validMinute(times.restMinute)) throw new Error("Choose a valid reminder time.");
    await saveSettings({ enabled: state.enabled, ...times });
    await sync();
  });
}

export async function shouldPresentReminder(dateKey: string, kind: string) {
  const now = new Date();
  if (!state.enabled || dateKey !== localDateKey(now)) return false;
  const history = await getReminderHistory();
  if (getValidCompletions(history.completedAt, now).some((at) => localDateKey(at) === dateKey)) return false;
  const isRest = history.restDates.includes(dateKey) || getScheduledRestDates(history.scheduleHistory, dateKey).includes(dateKey);
  return kind === "rest" ? isRest : (kind === "workout" || kind === "streak") && !isRest;
}
