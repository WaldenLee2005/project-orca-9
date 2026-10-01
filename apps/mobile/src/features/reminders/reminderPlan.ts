import { dateOrdinal, getScheduledRestDates, localDateKey, type ScheduleRevision } from "../programs/programModel";

export const REMINDER_HORIZON_DAYS = 28;
const MINUTES_PER_DAY = 24 * 60;
const LOOKBACK_DAYS = 28;

export type PlannedReminder = {
  id: string;
  kind: "workout" | "streak" | "rest";
  dateKey: string;
  fireAt: Date;
  title: string;
  body: string;
};

export type ReminderPlan = {
  averageMinute: number;
  sampleCount: number;
  reminders: PlannedReminder[];
};

export type ReminderPlanInput = {
  now: Date;
  completedAt: readonly string[];
  restDates: readonly string[];
  scheduleHistory: ScheduleRevision[];
  fallbackMinute: number;
  restMinute: number;
};

function minuteOfDay(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(value))) : fallback;
}

function keyFromOrdinal(ordinal: number) {
  return new Date(ordinal * 86400000).toISOString().slice(0, 10);
}

function localTime(dateKey: string, minute: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  // Construct each civil date independently: adding 24 hours drifts across DST.
  return new Date(year, month - 1, day, Math.floor(minute / 60), minute % 60);
}

function offsetTime(dateKey: string, averageMinute: number, offsetMinutes: number) {
  const anchor = localTime(dateKey, averageMinute).getTime();
  // Offset the instant, so "15 minutes before" stays before across a DST gap.
  return new Date(Math.max(localTime(dateKey, 0).getTime(),
    Math.min(localTime(dateKey, MINUTES_PER_DAY - 1).getTime(), anchor + offsetMinutes * 60000)));
}

export function getValidCompletions(completedAt: readonly string[], now: Date): Date[] {
  return completedAt.filter((value) => typeof value === "string" &&
    Number.isFinite(dateOrdinal(value.slice(0, 10))) && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d/.test(value))
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()) && date.getTime() <= now.getTime())
    .sort((a, b) => b.getTime() - a.getTime());
}

/** Plan at most 56 local notifications without creating any workout/rest records. */
export function buildReminderPlan(input: ReminderPlanInput): ReminderPlan {
  const { now, completedAt, restDates, scheduleHistory } = input;
  if (!Number.isFinite(now.getTime())) throw new Error("The device date is invalid.");
  const todayKey = localDateKey(now), today = dateOrdinal(todayKey);
  const fallback = minuteOfDay(input.fallbackMinute, 18 * 60);
  const restMinute = minuteOfDay(input.restMinute, 8 * 60);
  const completed = getValidCompletions(completedAt, now);
  const workoutDates = new Set(completed.map((date) => localDateKey(date)));
  const sampledDates = new Set<string>();
  const samples: number[] = [];
  for (const date of completed) {
    const key = localDateKey(date);
    if (dateOrdinal(key) < today - LOOKBACK_DAYS + 1 || sampledDates.has(key)) continue;
    sampledDates.add(key);
    samples.push(date.getHours() * 60 + date.getMinutes());
    if (samples.length === LOOKBACK_DAYS) break;
  }

  // Circular averaging keeps 23:50 and 00:10 near midnight, rather than noon.
  const radians = samples.map((minute) => minute * 2 * Math.PI / MINUTES_PER_DAY);
  const x = radians.reduce((sum, angle) => sum + Math.cos(angle), 0);
  const y = radians.reduce((sum, angle) => sum + Math.sin(angle), 0);
  // Opposing times have no meaningful circular mean; use the user's fallback.
  const averageMinute = Math.hypot(x, y) < 1e-6 ? fallback
    : (Math.round(Math.atan2(y, x) * MINUTES_PER_DAY / (2 * Math.PI)) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const lastKey = keyFromOrdinal(today + REMINDER_HORIZON_DAYS - 1);
  const allRestDates = new Set([...restDates.filter((key) => Number.isFinite(dateOrdinal(key))),
    ...getScheduledRestDates(scheduleHistory, lastKey)]);

  // Only today's message can quote the known streak. Future workouts are unknown.
  let currentStreak = 0;
  for (let day = today - 1; workoutDates.has(keyFromOrdinal(day)) || allRestDates.has(keyFromOrdinal(day)); day -= 1) {
    currentStreak += 1;
  }

  const reminders: PlannedReminder[] = [];
  function add(dateKey: string, kind: PlannedReminder["kind"], fireAt: Date, title: string, body: string) {
    if (fireAt.getTime() <= now.getTime() || localDateKey(fireAt) !== dateKey) return;
    reminders.push({ id: `orca-reminder:${dateKey}:${kind}`, kind, dateKey, fireAt, title, body });
  }
  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset += 1) {
    const dateKey = keyFromOrdinal(today + offset);
    if (workoutDates.has(dateKey)) continue;
    if (allRestDates.has(dateKey)) {
      add(dateKey, "rest", localTime(dateKey, restMinute), "Today is a rest day", "Recovery is part of your plan. Enjoy your rest day—your streak is protected.");
      continue;
    }
    // Near midnight, keep both notices on their own day instead of nagging tomorrow.
    add(dateKey, "workout", offsetTime(dateKey, averageMinute, -15), "Time for your workout",
      samples.length ? "Your usual session time is coming up. Make a little time for your workout."
        : "Make time for your workout today, then log your session in Orca.");
    const knownStreak = dateKey === todayKey ? currentStreak : 0;
    add(dateKey, "streak", offsetTime(dateKey, averageMinute, 120),
      knownStreak ? "Protect your streak" : "Remember your session",
      knownStreak ? `Keep your ${knownStreak}-day streak going. Log today's workout once you're done.`
        : "Build your streak one session at a time. If you train today, remember to log your workout.");
  }
  return { averageMinute, sampleCount: samples.length, reminders: reminders.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()) };
}
