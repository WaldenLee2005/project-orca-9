import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { PlannedReminder } from "./reminderPlan";
import type { ReminderSchedulerClient } from "./reminderScheduler";
import { REMINDER_PREFIX } from "./reminderScheduler";

export type ReminderPermission = "undetermined" | "granted" | "denied" | "unsupported";
const CHANNEL = "orca-workout-reminders";
let notifications: Promise<typeof import("expo-notifications")> | undefined;
let observerGeneration = 0;
function load() {
  return notifications ??= import("expo-notifications");
}
export function notificationsSupported() {
  return Platform.OS !== "web" && Boolean(requireOptionalNativeModule("ExpoNotificationScheduler"));
}

export async function getReminderPermission(request = false): Promise<ReminderPermission> {
  if (!notificationsSupported()) return "unsupported";
  const api = await load();
  if (Platform.OS === "android") {
    await api.setNotificationChannelAsync(CHANNEL, {
      name: "Workout and rest reminders", importance: api.AndroidImportance.DEFAULT,
      description: "Adaptive workout, streak, and morning rest-day reminders", sound: "default"
    });
  }
  let permission = await api.getPermissionsAsync();
  const granted = () => permission.granted || (permission.ios && [api.IosAuthorizationStatus.AUTHORIZED, api.IosAuthorizationStatus.PROVISIONAL, api.IosAuthorizationStatus.EPHEMERAL].includes(permission.ios.status));
  if (request && !granted() && permission.canAskAgain) {
    permission = await api.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  }
  return granted() ? "granted" : permission.status === "undetermined" ? "undetermined" : "denied";
}

export const notificationClient: ReminderSchedulerClient = {
  async list() {
    if (!notificationsSupported()) return [];
    return (await (await load()).getAllScheduledNotificationsAsync()).map((item) => ({
      id: item.identifier,
      fingerprint: typeof item.content.data?.reminderFingerprint === "string" ? item.content.data.reminderFingerprint : undefined,
      fireAt: typeof item.content.data?.fireAt === "number" ? item.content.data.fireAt : undefined
    }));
  },
  async cancel(id) { if (notificationsSupported()) await (await load()).cancelScheduledNotificationAsync(id); },
  async schedule(reminder: PlannedReminder, fingerprint: string) {
    const api = await load();
    await api.scheduleNotificationAsync({
      identifier: reminder.id,
      content: {
        title: reminder.title, body: reminder.body, sound: "default",
        data: { orcaReminder: true, kind: reminder.kind, dateKey: reminder.dateKey, fireAt: reminder.fireAt.getTime(), reminderFingerprint: fingerprint }
      },
      trigger: { type: api.SchedulableTriggerInputTypes.DATE, date: reminder.fireAt, channelId: CHANNEL }
    });
  }
};

export async function dismissWorkoutReminders(dateKey?: string) {
  if (!notificationsSupported()) return;
  const api = await load();
  const presented = await api.getPresentedNotificationsAsync();
  for (const item of presented) {
    if (item.request.identifier.startsWith(REMINDER_PREFIX) && (!dateKey || item.request.content.data?.dateKey === dateKey)) {
      await api.dismissNotificationAsync(item.request.identifier);
    }
  }
}

export async function observeReminderNotifications(
  shouldPresent: (dateKey: string, kind: string) => Promise<boolean>,
  onOpen: () => void
) {
  if (!notificationsSupported()) return () => {};
  const api = await load();
  const generation = ++observerGeneration;
  let disposed = false;
  api.setNotificationHandler({ handleNotification: async (notification) => {
    const data = notification.request.content.data;
    const owned = notification.request.identifier.startsWith(REMINDER_PREFIX);
    const present = owned && typeof data?.dateKey === "string" && typeof data.kind === "string"
      ? await shouldPresent(data.dateKey, data.kind).catch(() => false) : false;
    return { shouldShowBanner: present, shouldShowList: present, shouldPlaySound: present, shouldSetBadge: false };
  } });
  let lastOpened: string | undefined;
  const open = (response: import("expo-notifications").NotificationResponse | null) => {
    if (disposed || generation !== observerGeneration) return;
    if (response?.actionIdentifier === api.DEFAULT_ACTION_IDENTIFIER && response.notification.request.identifier.startsWith(REMINDER_PREFIX)) {
      const id = response.notification.request.identifier;
      if (id === lastOpened) return;
      lastOpened = id;
      onOpen();
      void api.clearLastNotificationResponseAsync().catch(() => {});
    }
  };
  const subscription = api.addNotificationResponseReceivedListener(open);
  const cleanup = () => {
    disposed = true;
    subscription.remove();
    if (generation === observerGeneration) api.setNotificationHandler(null);
  };
  try { open(await api.getLastNotificationResponseAsync()); }
  catch (error) { cleanup(); throw error; }
  return cleanup;
}
