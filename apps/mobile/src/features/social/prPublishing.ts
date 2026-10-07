import AsyncStorage from "@react-native-async-storage/async-storage";
import { getOptionalSupabaseClient } from "../../lib/supabase";
import { getSocialPersonalRecordHistory } from "../../storage/workoutsRepository";
import { getCurrentAuthSession } from "./authRepository";
import { publishPersonalRecord } from "./feedRepository";
import { personalRecordDisplayName, personalRecordSummary } from "./prPublishingModel";
import { createPRPublishingService } from "./prPublishingService";

export type { PRVisibility } from "./prPublishingModel";
export type { PRSharingPreferences } from "./prPublishingService";

const publishing = createPRPublishingService({
  storage: AsyncStorage,
  getCurrentUserId: async () => (await getCurrentAuthSession())?.user.id ?? null,
  getHistory: getSocialPersonalRecordHistory,
  publish: (userId, event) => publishPersonalRecord({ userId, eventId: event.eventId,
    workoutSessionId: event.id, exerciseName: personalRecordDisplayName(event.exerciseName), summaryText: personalRecordSummary(event),
    occurredAt: event.completedAt, visibility: event.visibility }),
  now: Date.now
});

export const getPRSharingPreferences = publishing.getPreferences;
export const setPRSharingPreferences = publishing.setPreferences;
export const retryPersonalRecordPublishing = publishing.retry;
export const suppressPersonalRecordPost = publishing.suppress;
export const subscribeToPRSharingChanges = publishing.subscribe;

/** Capture boundaries immediately inside the SDK callback, without awaiting SDK work. */
export function observePRSharingAuth() {
  const client = getOptionalSupabaseClient();
  if (!client) { void publishing.observeAuth(null).catch(() => {}); return () => {}; }
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    void publishing.observeAuth(session?.user.id ?? null).catch(() => {});
    // Defer SDK access until the callback has returned, as required by Supabase auth.
    setTimeout(() => { void publishing.retry().catch(() => {}); }, 0);
  });
  return () => data.subscription.unsubscribe();
}
