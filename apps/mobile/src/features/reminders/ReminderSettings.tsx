import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { createThemedStyles } from "../../theme/designSystem";
import { useThemeStyles } from "../../theme/ThemeProvider";
import {
  getReminderState,
  refreshReminders,
  setRemindersEnabled,
  subscribeToReminders,
  updateReminderTimes
} from "./reminderService";

export function ReminderSettings() {
  const { styles, colors } = useThemeStyles(themedStyles);
  const state = useSyncExternalStore(subscribeToReminders, getReminderState, getReminderState);
  const [actionError, setActionError] = useState<string | null>(null);
  const unsupported = Platform.OS === "web" || state.permission === "unsupported";
  const disabled = !state.loaded || state.busy || unsupported;
  const error = actionError ?? state.error;

  useFocusEffect(useCallback(() => {
    refreshReminders().catch(() => {
      setActionError("Could not refresh reminders. Try again.");
    });
  }, []));

  async function perform(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not update reminders. Try again.");
    }
  }

  function changeTime(key: "fallbackMinute" | "restMinute", minute: number) {
    void perform(() => updateReminderTimes({
      fallbackMinute: state.fallbackMinute,
      restMinute: state.restMinute,
      [key]: minute
    }));
  }

  return (
    <View>
      <Text accessibilityRole="header" style={styles.sectionLabel}>WORKOUT REMINDERS</Text>
      <View style={styles.group}>
        <View style={styles.toggleRow}>
          <View style={styles.flexible}>
            <Text style={styles.label}>Reminders</Text>
            <Text style={styles.caption}>
              {unsupported ? (Platform.OS === "web" ? "Available on iPhone and Android" : "Not available in this app version") :
                !state.loaded ? "Loading…" :
                state.busy ? "Updating reminders…" :
                state.permission === "denied" ? "Notifications are blocked" :
                state.enabled ? "On for this device" : "Off"}
            </Text>
          </View>
          {!unsupported ? (
            <Switch
              accessibilityLabel="Enable workout reminders"
              accessibilityHint="Allow workout and rest day notifications on this device."
              disabled={disabled}
              onValueChange={(enabled) => { void perform(() => setRemindersEnabled(enabled)); }}
              trackColor={{ false: colors.border, true: colors.accent }}
              value={state.enabled}
            />
          ) : null}
        </View>

        <Text style={styles.description}>
          Get a nudge 15 minutes before your average session-save time over the last 28 days.
          If you still haven’t saved a session 2 hours after that time, get a reminder to keep your streak going.
        </Text>
        <Text style={styles.description}>
          Rest days get one reminder at your chosen time. Your rest still protects your streak.
        </Text>

        {state.loaded && !unsupported && state.enabled && state.permission === "granted" ? (
          <View style={styles.averageRow}>
            <Ionicons name="time-outline" size={18} color={colors.accent} />
            <Text style={styles.averageText}>
              {state.sampleCount > 0
                ? `Your usual time: ${formatTime(state.averageMinute)} · based on ${state.sampleCount} saved ${state.sampleCount === 1 ? "session" : "sessions"}.`
                : `No recent sessions yet. Using ${formatTime(state.fallbackMinute)} until you build a routine.`}
            </Text>
          </View>
        ) : null}

        {!unsupported ? (
          <>
            <TimeSetting
              label="Starting workout time"
              description="Used until you have recent saved sessions."
              minute={state.fallbackMinute}
              disabled={disabled}
              onChange={(minute) => changeTime("fallbackMinute", minute)}
            />
            <TimeSetting
              label="Rest day reminder"
              description="Start your recovery day with a reminder."
              minute={state.restMinute}
              disabled={disabled}
              onChange={(minute) => changeTime("restMinute", minute)}
            />
          </>
        ) : null}

        {!unsupported && state.permission === "denied" ? (
          <View style={styles.permissionActions}>
            <Text style={styles.description}>Allow notifications in device settings, then enable reminders here.</Text>
            <ActionButton label="Open device settings" disabled={state.busy} onPress={() => { void perform(() => Linking.openSettings()); }} />
            <ActionButton label="Enable reminders" disabled={disabled} onPress={() => { void perform(() => setRemindersEnabled(true)); }} />
          </View>
        ) : null}

        {error ? (
          <View style={styles.permissionActions}>
            <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            <ActionButton label="Retry reminders" disabled={state.busy || unsupported} onPress={() => { void perform(refreshReminders); }} />
          </View>
        ) : null}
      </View>
      <Text style={styles.footnote}>
        {unsupported
          ? Platform.OS === "web" ? "Open Orca on your phone to turn on notifications." : "Install an updated Orca app to turn on reminders."
          : "Reminder preferences and workout timing stay on this device. Times follow your local clock. Open Orca at least every 28 days to keep reminders scheduled."}
      </Text>
    </View>
  );
}

function TimeSetting({ label, description, minute, disabled, onChange }: {
  label: string;
  description: string;
  minute: number;
  disabled: boolean;
  onChange: (minute: number) => void;
}) {
  const { styles, colors } = useThemeStyles(themedStyles);
  return (
    <View style={styles.timeSetting}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.caption}>{description}</Text>
      <View style={styles.timeControls}>
        <Pressable
          accessibilityLabel={`${label}, 30 minutes earlier`}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onChange((minute + 1440 - 30) % 1440)}
          style={({ pressed }) => [styles.timeButton, (disabled || pressed) && styles.dimmed]}
        >
          <Ionicons name="remove" size={22} color={colors.accent} />
        </Pressable>
        <Text accessibilityLabel={`${label}: ${formatTime(minute)}`} style={styles.timeValue}>{formatTime(minute)}</Text>
        <Pressable
          accessibilityLabel={`${label}, 30 minutes later`}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onChange((minute + 30) % 1440)}
          style={({ pressed }) => [styles.timeButton, (disabled || pressed) && styles.dimmed]}
        >
          <Ionicons name="add" size={22} color={colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}

function ActionButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  const { styles } = useThemeStyles(themedStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, (disabled || pressed) && styles.dimmed]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function formatTime(minute: number) {
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

const themedStyles = createThemedStyles((colors, ui) => ({
  sectionLabel: { color: colors.mutedText, fontSize: 12, fontWeight: "500", letterSpacing: 0.7, marginTop: 28, marginBottom: 10, paddingHorizontal: 4 },
  group: { ...ui.group, padding: 16, gap: 12 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  flexible: { flex: 1 },
  label: { color: colors.text, fontSize: 15, fontWeight: "500", lineHeight: 21 },
  caption: { color: colors.mutedText, fontSize: 12, lineHeight: 18, marginTop: 3 },
  description: { color: colors.secondaryText, fontSize: 13, lineHeight: 20 },
  averageRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  averageText: { color: colors.secondaryText, fontSize: 13, lineHeight: 20, flex: 1 },
  timeSetting: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 14 },
  timeControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 9 },
  timeButton: { ...ui.input, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  timeValue: { color: colors.text, fontSize: 18, fontWeight: "500", fontVariant: ["tabular-nums"], flexShrink: 1 },
  permissionActions: { gap: 8 },
  actionButton: { ...ui.input, minHeight: 44, paddingVertical: 12, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  actionText: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: "500", textAlign: "center" },
  dimmed: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  footnote: { color: colors.mutedText, fontSize: 12, lineHeight: 19, marginTop: 10, paddingHorizontal: 4 }
}));
