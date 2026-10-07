import type { SocialPersonalRecordPoint } from "../../storage/workoutsRepository";

export type PRVisibility = "private" | "friends" | "public";
export type PRSharingWindow = { from: string; to: string | null };
export type PersonalRecordEvent = SocialPersonalRecordPoint & { eventId: string; previousWeight: number | null; visibility: PRVisibility };

export function personalRecordEventId(sessionId: string, liftKey: string): string {
  // Custom lift names can be long or Unicode. Keep identities bounded without
  // collapsing different names that share the same displayed prefix.
  let a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762;
  for (let index = 0; index < liftKey.length; index++) {
    const value = liftKey.charCodeAt(index);
    a = b ^ Math.imul(a ^ value, 597399067);
    b = c ^ Math.imul(b ^ value, 2869860233);
    c = d ^ Math.imul(c ^ value, 951274213);
    d = a ^ Math.imul(d ^ value, 2716044179);
  }
  a = Math.imul(c ^ (a >>> 18), 597399067);
  b = Math.imul(d ^ (b >>> 22), 2869860233);
  c = Math.imul(a ^ (c >>> 17), 951274213);
  d = Math.imul(b ^ (d >>> 19), 2716044179);
  const digest = [a ^ b ^ c ^ d, b ^ a, c ^ a, d ^ a].map((value) => (value >>> 0).toString(16).padStart(8, "0")).join("");
  return `pr:${encodeURIComponent(sessionId)}:${digest}`;
}

/** Compare every completed lift against its complete local history before filtering sharing windows. */
export function derivePersonalRecordEvents(
  history: readonly SocialPersonalRecordPoint[], windows: readonly PRSharingWindow[], visibility: PRVisibility, now: number
): PersonalRecordEvent[] {
  const records = new Map<string, number>();
  const result: PersonalRecordEvent[] = [];
  const best = new Map<string, SocialPersonalRecordPoint>();
  for (const point of history) {
    const completed = Date.parse(point.completedAt);
    const started = Date.parse(point.startedAt);
    if (!Number.isFinite(completed) || !Number.isFinite(started) || started > completed || completed > now
      || !Number.isFinite(point.weight) || point.weight < 0 || point.weight > 10000
      || !Number.isInteger(point.reps) || point.reps <= 0 || point.reps > 100) continue;
    const key = personalRecordEventId(point.id, point.liftKey);
    if (!best.has(key) || point.weight > best.get(key)!.weight) best.set(key, point);
  }
  const ordered = [...best.values()].sort((a, b) => a.completedAt.localeCompare(b.completedAt)
    || a.id.localeCompare(b.id) || a.liftKey.localeCompare(b.liftKey));
  for (const point of ordered) {
    const previousWeight = records.get(point.liftKey) ?? null;
    if (previousWeight !== null && point.weight <= previousWeight) continue;
    records.set(point.liftKey, point.weight);
    const started = Date.parse(point.startedAt), completed = Date.parse(point.completedAt);
    // Requiring the entire session inside one window prevents signing in from adopting guest
    // work or finishing another account's paused session. Equal-start timestamps are conservative.
    if (!windows.some((window) => started > Date.parse(window.from)
      && (window.to === null || completed < Date.parse(window.to)))) continue;
    result.push({ ...point, eventId: personalRecordEventId(point.id, point.liftKey), previousWeight, visibility });
  }
  return result;
}

export function personalRecordSummary(event: PersonalRecordEvent): string {
  const improvement = event.previousWeight === null ? "First recorded PR" : `Previous PR ${event.previousWeight} lb`;
  return `${event.weight} lb × ${event.reps} ${event.reps === 1 ? "rep" : "reps"}. ${improvement}.`;
}

/** Limit only the public display name, keeping the local comparison identity intact. */
export function personalRecordDisplayName(name: string): string {
  return name.slice(0, 200).replace(/[\uD800-\uDBFF]$/, "");
}
