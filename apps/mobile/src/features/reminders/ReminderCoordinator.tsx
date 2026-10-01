import { router, useRootNavigationState } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { subscribeToTrainingChanges } from "../../storage/trainingChanges";
import { observeReminderNotifications } from "./notificationClient";
import { refreshReminders, shouldPresentReminder } from "./reminderService";

export function ReminderCoordinator() {
  const navigation = useRootNavigationState();
  useEffect(() => {
    const refresh = () => { void refreshReminders().catch(() => {}); };
    const clockKey = () => `${new Date().toDateString()}:${new Date().getTimezoneOffset()}:${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
    let lastClock = clockKey();
    refresh();
    const unsubscribe = subscribeToTrainingChanges(refresh);
    const appState = AppState.addEventListener("change", (value) => { if (value === "active") { lastClock = clockKey(); refresh(); } });
    const timer = setInterval(() => {
      const current = clockKey();
      if (AppState.currentState === "active" && current !== lastClock) { lastClock = current; refresh(); }
    }, 60_000);
    return () => { unsubscribe(); appState.remove(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!navigation?.key) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    void observeReminderNotifications(shouldPresentReminder, () => {
      if (active) router.push("/(tabs)/workouts");
    }).then((unsubscribe) => { if (active) cleanup = unsubscribe; else unsubscribe(); }).catch(() => {});
    return () => { active = false; cleanup?.(); };
  }, [navigation?.key]);
  return null;
}
