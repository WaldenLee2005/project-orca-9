import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { dateOrdinal, type ScheduleRevision } from "../features/programs/programModel";
import { getDatabase } from "./database";
import { getProgramScheduleHistory } from "./programsRepository";
import { ensureWebTrainingStorage } from "./trainingStorage";

export type ReminderHistory = {
  completedAt: string[];
  restDates: string[];
  scheduleHistory: ScheduleRevision[];
};

function readArray(stored: string | null): unknown[] {
  if (stored === null) return [];
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) throw new Error("Invalid reminder history");
  return parsed;
}

function readCompletion(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error("Invalid workout completion time");
  return value;
}

function readRestDate(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(dateOrdinal(value))) throw new Error("Invalid rest date");
  return value;
}

// Read existing training data only. A failed read must not turn into an empty schedule.
export async function getReminderHistory(): Promise<ReminderHistory> {
  try {
    if (Platform.OS === "web") {
      await ensureWebTrainingStorage();
      const [sessions, restDates, scheduleHistory] = await Promise.all([
        AsyncStorage.getItem("orca9.workoutSessions"),
        AsyncStorage.getItem("orca9.restDays"),
        getProgramScheduleHistory()
      ]);
      const completedAt = readArray(sessions).flatMap((session) => {
        if (!session || typeof session !== "object" || !("completedAt" in session)) throw new Error("Invalid workout history");
        return session.completedAt === null ? [] : [readCompletion(session.completedAt)];
      });
      return { completedAt, restDates: readArray(restDates).map(readRestDate), scheduleHistory };
    }

    const database = await getDatabase();
    const [sessions, restDays, scheduleHistory] = await Promise.all([
      database.getAllAsync<{ completed_at: string }>("SELECT completed_at FROM workout_sessions WHERE completed_at IS NOT NULL;"),
      database.getAllAsync<{ date_key: string }>("SELECT date_key FROM consistency_days WHERE kind = 'rest';"),
      getProgramScheduleHistory()
    ]);
    return {
      completedAt: sessions.map((session) => readCompletion(session.completed_at)),
      restDates: restDays.map((day) => readRestDate(day.date_key)),
      scheduleHistory
    };
  } catch {
    throw new Error("Your workout or rest-day history could not be read. Nothing has been overwritten. Try again to refresh reminders.");
  }
}
