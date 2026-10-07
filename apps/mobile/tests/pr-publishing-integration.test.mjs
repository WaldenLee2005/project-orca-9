import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const mocks = {
  "@react-native-async-storage/async-storage": "export default globalThis.__orcaPRIntegration.storage;",
  "../../lib/supabase": "export const getOptionalSupabaseClient = () => null;",
  "../../storage/workoutsRepository": "export const getSocialPersonalRecordHistory = async () => globalThis.__orcaPRIntegration.history;",
  "./authRepository": "export const getCurrentAuthSession = async () => globalThis.__orcaPRIntegration.session;",
  "./feedRepository": "export const publishPersonalRecord = (input) => globalThis.__orcaPRIntegration.feed.publishPersonalRecord(input);"
};
registerHooks({ resolve(specifier, context, nextResolve) {
  const parent = context.parentURL?.split("?")[0];
  if (parent?.endsWith("/social/prPublishing.ts") && mocks[specifier]) return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}` };
  if (/\/social\/prPublishing(?:Service)?\.ts$/.test(parent ?? "") && ["./prPublishingModel", "./prPublishingService"].includes(specifier)) {
    return nextResolve(new URL(`${specifier}.ts`, parent).href, context);
  }
  return nextResolve(specifier, context);
} });
const { createFeedClient } = await import("../src/features/social/feedClient.ts");

test("publisher integration sends bounded Unicode names through the real feed client without blocking later records or copying notes", async (t) => {
  const start = Date.parse("2026-10-01T12:00:00.000Z");
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const values = new Map(), requests = [];
  const state = {
    session: { user: { id: "account-a" }, access_token: "synthetic-test-token", expires_at: Math.floor(start / 1000) + 86400 * 10 },
    storage: { async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { values.set(key, value); } },
    history: []
  };
  state.feed = createFeedClient({
    getConfig: () => ({ url: "https://synthetic.test", publishableKey: "synthetic-public-key" }),
    getSession: async () => state.session,
    fetch: async (url, input) => { requests.push({ url, body: JSON.parse(input.body) }); return new Response("null", { status: 200 }); }
  });
  globalThis.__orcaPRIntegration = state;
  const publisher = await import("../src/features/social/prPublishing.ts?integration-long-name");
  await publisher.setPRSharingPreferences("account-a", { enabled: true, visibility: "friends" });
  const longName = `${"x".repeat(199)}🏋️${" longer custom lift".repeat(30)}`;
  const timing = { startedAt: "2026-10-02T12:00:00.000Z", completedAt: "2026-10-03T12:00:00.000Z", reps: 5 };
  state.history = [
    { ...timing, id: "one", liftKey: `custom:${longName}`, exerciseName: longName, weight: 100.25 },
    { ...timing, id: "two", liftKey: "bench", exerciseName: "Bench press", weight: 150.5 }
  ];
  t.mock.timers.setTime(start + 86400 * 4 * 1000);
  await publisher.retryPersonalRecordPublishing();
  assert.equal(requests.length, 2, "long names do not strand the next pending record");
  assert.equal(requests[0].body.p_exercise_name, "x".repeat(199));
  assert.ok(requests[0].body.p_client_event_id.length < 240);
  assert.match(requests[0].body.p_summary_text, /100\.25 lb × 5 reps/);
  assert.equal(requests[1].body.p_exercise_name, "Bench press");
  for (const request of requests) {
    assert.equal(request.url, "https://synthetic.test/rest/v1/rpc/orca_publish_pr");
    assert.deepEqual(Object.keys(request.body).sort(), ["p_client_event_id", "p_exercise_name", "p_occurred_at", "p_summary_text", "p_visibility", "p_workout_session_id"]);
  }
  assert.equal((await publisher.getPRSharingPreferences("account-a")).pendingCount, 0);
  await publisher.retryPersonalRecordPublishing();
  assert.equal(requests.length, 2, "transport retries remain deduplicated");
});
