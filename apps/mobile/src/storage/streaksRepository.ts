import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getDatabase } from "./database";
import { getProgramScheduleHistory } from "./programsRepository";
import { dateOrdinal, getScheduledRestDates } from "../features/programs/programModel";
import { ensureWebTrainingStorage } from "./trainingStorage";
import { emitTrainingChange } from "./trainingChanges";

const WEB_REST_DAYS_KEY = "orca9.restDays";

export type StreakSummary = {
  currentStreak: number;
  currentActiveDays: number;
  currentRestDays: number;
  bestStreak: number;
  todayStatus: "workout" | "rest" | "open";
  activeDates: string[];
};

export function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calculateStreakSummary(
  workoutDates: Iterable<string>,
  restDates: Iterable<string>,
  today = new Date()
): StreakSummary {
  const todayKey = getDateKey(today);
  const eligible = (key: string) => Number.isFinite(dateOrdinal(key)) && key <= todayKey;
  const workouts = new Set([...workoutDates].filter(eligible));
  const active = new Set([...workouts, ...[...restDates].filter(eligible)]);
  const todayStatus = workouts.has(todayKey) ? "workout" : active.has(todayKey) ? "rest" : "open";

  let currentStreak = 0;
  let currentActiveDays = 0;
  let currentRestDays = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!active.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (active.has(getDateKey(cursor))) {
    currentStreak += 1;
    // A completed workout takes precedence when a date is also marked as rest.
    if (workouts.has(getDateKey(cursor))) currentActiveDays += 1;
    else currentRestDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const orderedDates = [...active].sort();
  let bestStreak = 0;
  let run = 0;
  let previousKey: string | null = null;
  for (const dateKey of orderedDates) {
    const expectedNextKey: string | null = previousKey
      ? getDateKey(nextLocalDay(new Date(`${previousKey}T00:00:00`)))
      : null;
    if (expectedNextKey === dateKey) {
      run += 1;
    } else {
      run = 1;
    }
    bestStreak = Math.max(bestStreak, run);
    previousKey = dateKey;
  }

  return {
    currentStreak,
    currentActiveDays,
    currentRestDays,
    bestStreak,
    todayStatus,
    activeDates: [...active].sort()
  };
}

function nextLocalDay(date: Date) {
  date.setDate(date.getDate() + 1);
  return date;
}

export async function markTodayAsRestDay() {
  const dateKey = getDateKey(new Date());
  if (Platform.OS === "web") {
    const dates = await getWebRestDays();
    if (!dates.includes(dateKey)) {
      await AsyncStorage.setItem(WEB_REST_DAYS_KEY, JSON.stringify([...dates, dateKey]));
      emitTrainingChange();
    }
    return dateKey;
  }

  const database = await getDatabase();
  const result = await database.runAsync(
    "INSERT OR IGNORE INTO consistency_days (date_key, kind, created_at) VALUES (?, 'rest', ?);",
    [dateKey, new Date().toISOString()]
  );
  if (result.changes > 0) emitTrainingChange();
  return dateKey;
}

export async function getStreakSummary(): Promise<StreakSummary> {
  const scheduledRest = getScheduledRestDates(await getProgramScheduleHistory());
  if (Platform.OS === "web") {
    const sessions = await getWebWorkoutSessions();
    const restDates = await getWebRestDays();
    return calculateStreakSummary(
      sessions.filter((session) => session.completedAt).map((session) => getDateKey(new Date(session.completedAt!))),
      [...restDates, ...scheduledRest]
    );
  }

  const database = await getDatabase();
  const [workouts, restDays] = await Promise.all([
    database.getAllAsync<{ completed_at: string }>(
      "SELECT completed_at FROM workout_sessions WHERE completed_at IS NOT NULL;"
    ),
    database.getAllAsync<{ date_key: string }>("SELECT date_key FROM consistency_days WHERE kind = 'rest';")
  ]);

  return calculateStreakSummary(
    workouts.map((workout) => getDateKey(new Date(workout.completed_at))),
    [...restDays.map((day) => day.date_key), ...scheduledRest]
  );
}

type WebSession = { completedAt: string | null };

async function getWebWorkoutSessions(): Promise<WebSession[]> {
  await ensureWebTrainingStorage();
  const stored = await AsyncStorage.getItem("orca9.workoutSessions");
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getWebRestDays(): Promise<string[]> {
  await ensureWebTrainingStorage();
  const stored = await AsyncStorage.getItem(WEB_REST_DAYS_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}
