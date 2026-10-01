import type { PlannedReminder } from "./reminderPlan";

export type PendingReminder = { id: string; fingerprint?: string; fireAt?: number };
export type ReminderLedger = Record<string, number>;
export type ReminderSchedulerClient = {
  list(): Promise<PendingReminder[]>;
  cancel(id: string): Promise<void>;
  schedule(reminder: PlannedReminder, fingerprint: string): Promise<void>;
};

export const REMINDER_PREFIX = "orca-reminder:";
export function reminderFingerprint(reminder: PlannedReminder) {
  return JSON.stringify([reminder.fireAt.getTime(), reminder.title, reminder.body]);
}

// One identifier per date/kind, including after a notification has already fired.
// Keep elapsed reservations so a newly learned time cannot send the same nudge twice.
export async function reconcileReminders(
  client: ReminderSchedulerClient,
  reminders: PlannedReminder[],
  previous: ReminderLedger,
  now: Date,
  saveLedger: (ledger: ReminderLedger) => Promise<void>
) {
  const pending = (await client.list()).filter((item) => item.id.startsWith(REMINDER_PREFIX));
  const ledger: ReminderLedger = { ...previous };
  for (const item of pending) {
    if (Number.isFinite(item.fireAt)) ledger[item.id] = item.fireAt!;
  }
  const desired = new Map(reminders.filter((item) => item.fireAt > now && !(ledger[item.id] <= now.getTime())).map((item) => [item.id, item]));
  for (const item of pending) {
    const replacement = desired.get(item.id);
    if (!replacement || item.fingerprint !== reminderFingerprint(replacement)) {
      await client.cancel(item.id);
      if (ledger[item.id] > now.getTime()) delete ledger[item.id];
    } else {
      desired.delete(item.id);
    }
  }
  // Prune old dates and cancelled future reservations, retaining elapsed ones today.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const requested = new Set(reminders.map((item) => item.id));
  for (const [id, timestamp] of Object.entries(ledger)) {
    if (timestamp < startOfToday || (timestamp > now.getTime() && !requested.has(id))) delete ledger[id];
  }
  await saveLedger(ledger);
  for (const reminder of desired.values()) {
    await client.schedule(reminder, reminderFingerprint(reminder));
    ledger[reminder.id] = reminder.fireAt.getTime();
    // Persist each success so a partial OS failure or app exit remains retryable.
    await saveLedger({ ...ledger });
  }
  return (await client.list()).filter((item) => item.id.startsWith(REMINDER_PREFIX)).length;
}
