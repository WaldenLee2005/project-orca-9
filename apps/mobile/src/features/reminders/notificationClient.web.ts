import type { ReminderPermission } from "./notificationClient";
import type { ReminderSchedulerClient } from "./reminderScheduler";

export function notificationsSupported() { return false; }
export async function getReminderPermission(_request = false): Promise<ReminderPermission> { return "unsupported"; }
export const notificationClient: ReminderSchedulerClient = {
  async list() { return []; }, async cancel() {}, async schedule() {}
};
export async function dismissWorkoutReminders(_dateKey?: string) {}
export async function observeReminderNotifications(_shouldPresent: (dateKey: string, kind: string) => Promise<boolean>, _onOpen: () => void) { return () => {}; }
