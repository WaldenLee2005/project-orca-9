import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/social/prPublishingService.ts") && specifier === "./prPublishingModel") {
    return nextResolve(new URL("../src/features/social/prPublishingModel.ts", import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
} });
const { createPRPublishingService } = await import("../src/features/social/prPublishingService.ts");
const { derivePersonalRecordEvents, personalRecordEventId, personalRecordSummary, personalRecordDisplayName } = await import("../src/features/social/prPublishingModel.ts");
const day = (value) => `2026-10-${String(value).padStart(2, "0")}T12:00:00.000Z`;
const point = (id, weight, start = day(2), complete = day(3), liftKey = "bench") => ({
  id, startedAt: start, completedAt: complete, liftKey, exerciseName: liftKey === "bench" ? "Bench press" : "Row", weight, reps: 5
});
const accountKey = (userId = "account-a") => `orca9.prSharing.v1:${userId}`;

function setup() {
  const state = { values: new Map(), userId: "account-a", now: Date.parse(day(1)), history: [], published: [], historyReads: 0,
    failPublish: false, failWrite: false, failHistory: false, publishGate: null, storageWrites: 0 };
  const deps = {
    storage: {
      async getItem(key) { return state.values.get(key) ?? null; },
      async setItem(key, value) {
        state.storageWrites++;
        if (state.failWrite && key.startsWith("orca9.prSharing")) throw new Error("Disk unavailable");
        state.values.set(key, value);
      }
    },
    async getCurrentUserId() { return state.userId; },
    async getHistory() { state.historyReads++; if (state.failHistory) throw new Error("History unavailable"); return structuredClone(state.history); },
    async publish(userId, event) {
      if (state.publishGate) await state.publishGate;
      if (state.failPublish) throw new Error("Offline");
      state.published.push({ userId, ...structuredClone(event) });
    },
    now: () => state.now
  };
  const service = createPRPublishingService(deps);
  return { state, service, restart: () => createPRPublishingService(deps) };
}

test("PRs compare full history, preserve exact actual weights/reps, coalesce repeated lifts, and exclude invalid/future work", () => {
  const history = [point("old", 150, day(1), day(1)), point("new", 100), point("new", 175.25),
    { ...point("new", 175.25), reps: 1 }, point("tie", 175.25, day(4), day(5)),
    point("row", 80, day(2), day(3), "row"), point("future", 200, day(6), day(7)),
    { ...point("invalid", 1000), reps: 0 }, point("nan", NaN), point("bad-date", 1000, "invalid")];
  const events = derivePersonalRecordEvents(history, [{ from: day(1), to: null }], "friends", Date.parse(day(6)));
  assert.deepEqual(events.map((event) => [event.id, event.liftKey, event.weight, event.reps, event.previousWeight]),
    [["new", "bench", 175.25, 5, 150], ["row", "row", 80, 5, null]]);
  assert.equal(events[0].eventId, personalRecordEventId("new", "bench"));
  assert.match(personalRecordSummary(events[0]), /175\.25 lb × 5 reps\. Previous PR 150 lb/);
  assert.ok(!JSON.stringify(events).includes("note"));
});

test("stable PR identities are bounded for Unicode custom names and distinct for different sessions/lifts", () => {
  const lift = `custom:${"🏋️ Élite press ".repeat(100)}`;
  const id = personalRecordEventId("session-123", lift);
  assert.equal(id, personalRecordEventId("session-123", lift));
  assert.ok(id.length < 240);
  assert.notEqual(id, personalRecordEventId("session-124", lift));
  assert.notEqual(id, personalRecordEventId("session-123", `${lift} other`));
  const name = `${"x".repeat(199)}🏋️${" longer name".repeat(40)}`;
  const displayed = personalRecordDisplayName(name);
  assert.equal(displayed.length, 199, "display truncation cannot split an emoji's surrogate pair");
  assert.ok(displayed.length <= 200);
});

test("default-off and opt-in never backfill old, paused, or guest sessions", async () => {
  const { state, service } = setup();
  state.history = [point("old", 150, day(1), day(1))];
  assert.deepEqual(await service.getPreferences("account-a"), { enabled: false, visibility: "friends", pendingCount: 0, lastError: null });
  await service.retry();
  assert.equal(state.historyReads, 0);
  state.now = Date.parse(day(2));
  await service.setPreferences("account-a", { enabled: true, visibility: "friends" });
  state.history.push(point("guest-paused", 200, day(1), day(3)), point("equal-boundary", 210, day(2), day(3)));
  state.now = Date.parse(day(4));
  await service.retry();
  assert.deepEqual(state.published, []);
  state.history.push(point("own", 220.5, day(3), day(4)));
  await service.retry();
  assert.deepEqual(state.published.map((event) => event.id), ["own"]);
  assert.equal(state.published[0].previousWeight, 210, "unshared local history still supplies the true prior PR");
});

test("audience can be chosen while sharing is off and survives restart without adopting workouts or another account's preference", async () => {
  const { state, service, restart } = setup();
  state.history = [point("before-opt-in", 100)];
  state.now = Date.parse(day(4));
  await service.setPreferences("account-a", { enabled: false, visibility: "public" });
  assert.deepEqual(await restart().getPreferences("account-a"), { enabled: false, visibility: "public", pendingCount: 0, lastError: null });
  assert.deepEqual(JSON.parse(state.values.get(accountKey())).windows, [], "changing an audience does not grant consent to share");
  await service.retry();
  assert.equal(state.historyReads, 0);
  assert.deepEqual(state.published, []);

  state.userId = "account-b";
  await service.observeAuth("account-b");
  assert.equal((await service.getPreferences("account-b")).visibility, "friends", "new accounts keep the conservative default");
  await service.setPreferences("account-b", { enabled: false, visibility: "private" });
  assert.equal((await restart().getPreferences("account-b")).visibility, "private", "an existing Only me preference remains private");
  state.userId = "account-a";
  await service.observeAuth("account-a");
  assert.equal((await service.getPreferences("account-a")).visibility, "public");
  assert.equal(JSON.parse(state.values.get(accountKey("account-b"))).visibility, "private");
  assert.deepEqual(state.published, []);
});

test("offline candidates are durable, launch recovers a completion before queue persistence, and retries never duplicate", async () => {
  const { state, service, restart } = setup();
  await service.setPreferences("account-a", { enabled: true, visibility: "friends" });
  state.history = [point("new", 123.75)];
  state.now = Date.parse(day(4));
  state.failPublish = true;
  await assert.rejects(service.retry(), /Offline/);
  assert.equal((await service.getPreferences("account-a")).pendingCount, 1);
  assert.equal((await service.getPreferences("account-a")).lastError, "Offline");
  state.failPublish = false;
  const restored = restart();
  await restored.retry();
  await restored.retry();
  assert.equal(state.published.length, 1);
  assert.equal((await restored.getPreferences("account-a")).pendingCount, 0);
  // No successful coordinator run occurs between this local completion and app restart.
  state.history.push(point("crash-gap", 130, day(4), day(5)));
  state.now = Date.parse(day(6));
  await restart().retry();
  assert.deepEqual(state.published.map((event) => event.id), ["new", "crash-gap"]);
});

test("changing a PR audience persists for offline retries without changing published posts or consent windows", async () => {
  const { state, service, restart } = setup();
  await service.setPreferences("account-a", { enabled: true, visibility: "public" });
  state.history = [point("pending", 100)];
  state.now = Date.parse(day(4));
  state.failPublish = true;
  await assert.rejects(service.retry(), /Offline/);
  const queued = JSON.parse(state.values.get(accountKey()));
  assert.equal(queued.pending[0].visibility, "public");
  await service.setPreferences("account-a", { enabled: true, visibility: "friends" });
  const changed = JSON.parse(state.values.get(accountKey()));
  assert.deepEqual(changed.windows, queued.windows, "audience changes retain the original future-workout consent boundary");
  assert.equal(changed.pending[0].eventId, queued.pending[0].eventId, "changing privacy does not create a second PR identity");
  assert.equal(changed.pending[0].visibility, "friends");
  assert.equal((await restart().getPreferences("account-a")).visibility, "friends");
  state.failPublish = false;
  const restored = restart();
  await restored.retry();
  assert.deepEqual(state.published.map((event) => [event.id, event.visibility]), [["pending", "friends"]]);

  await restored.setPreferences("account-a", { enabled: true, visibility: "public" });
  await restored.retry();
  assert.deepEqual(state.published.map((event) => [event.id, event.visibility]), [["pending", "friends"]], "already-published posts retain their original audience");
  state.history.push(point("future", 110, day(4), day(5)));
  state.now = Date.parse(day(6));
  await restored.retry();
  assert.deepEqual(state.published.map((event) => [event.id, event.visibility]), [["pending", "friends"], ["future", "public"]]);
});

test("candidate storage failures never publish; retry queue and stored workouts remain usable", async () => {
  const { state, service } = setup();
  await service.setPreferences("account-a", { enabled: true, visibility: "friends" });
  state.history = [point("new", 100)];
  state.now = Date.parse(day(4));
  const historyBefore = structuredClone(state.history);
  state.failWrite = true;
  await assert.rejects(service.retry(), /Disk unavailable/);
  assert.equal(state.published.length, 0);
  assert.deepEqual(state.history, historyBefore);
  state.failWrite = false;
  await service.retry();
  assert.equal(state.published.length, 1);
});

test("disabling cancels pending and unqueued records; re-enabling starts a fresh baseline", async () => {
  const { state, service } = setup();
  await service.setPreferences("account-a", { enabled: true, visibility: "friends" });
  state.history = [point("pending", 100)];
  state.now = Date.parse(day(4)); state.failPublish = true;
  await assert.rejects(service.retry(), /Offline/);
  state.history.push(point("unqueued", 110, day(4), day(5)));
  state.now = Date.parse(day(6));
  await service.setPreferences("account-a", { enabled: false, visibility: "friends" });
  state.now = Date.parse(day(7));
  await service.setPreferences("account-a", { enabled: true, visibility: "public" });
  state.failPublish = false;
  state.now = Date.parse(day(10));
  await service.retry();
  assert.equal(state.published.length, 0);
  state.history.push(point("after-reenable", 120, day(8), day(9)));
  await service.retry();
  assert.deepEqual(state.published.map((event) => event.id), ["after-reenable"]);
  assert.equal(state.published[0].visibility, "public");
});

test("deleting/suppressing a record remains permanent across restart and new opt-in", async () => {
  const { state, service, restart } = setup();
  await service.setPreferences("account-a", { enabled: true, visibility: "friends" });
  state.history = [point("deleted", 100)]; state.now = Date.parse(day(4));
  await service.suppress("account-a", personalRecordEventId("deleted", "bench"));
  await restart().retry();
  assert.equal(state.published.length, 0);
  assert.ok(JSON.parse(state.values.get(accountKey())).settled.includes(personalRecordEventId("deleted", "bench")));
});

test("SDK account boundaries isolate preferences, pending records, guest work, and cross-account paused sessions", async () => {
  const { state, service } = setup();
  await service.setPreferences("account-a", { enabled: true, visibility: "friends" });
  state.history = [point("a-pending", 100)]; state.now = Date.parse(day(4)); state.failPublish = true;
  await assert.rejects(service.retry(), /Offline/);
  state.userId = null; await service.observeAuth(null);
  state.history.push(point("guest", 110, day(5), day(6)));
  state.userId = "account-b"; state.now = Date.parse(day(7)); await service.observeAuth("account-b");
  assert.equal((await service.getPreferences("account-b")).enabled, false);
  await service.setPreferences("account-b", { enabled: true, visibility: "public" });
  state.history.push(point("guest-paused", 120, day(5), day(8)), point("b-own", 130, day(8), day(9)));
  state.now = Date.parse(day(10)); state.failPublish = false;
  await service.retry();
  assert.deepEqual(state.published.map((event) => [event.userId, event.id]), [["account-b", "b-own"]]);
  await assert.rejects(service.setPreferences("account-a", { enabled: false, visibility: "friends" }), /Sign in/);
  state.userId = "account-a"; state.now = Date.parse(day(11)); await service.observeAuth("account-a");
  await service.retry();
  assert.deepEqual(state.published.map((event) => [event.userId, event.id]), [["account-b", "b-own"], ["account-a", "a-pending"]]);
  assert.equal((await service.getPreferences("account-a")).visibility, "friends");
});

test("account switch during a publication cannot send further original-account events as the new user", async () => {
  const { state, service } = setup();
  await service.setPreferences("account-a", { enabled: true, visibility: "friends" });
  state.history = [point("one", 100), point("two", 50, day(2), day(3), "row")];
  state.now = Date.parse(day(4));
  let release;
  state.publishGate = new Promise((resolve) => { release = resolve; });
  const retry = service.retry();
  while (!JSON.parse(state.values.get(accountKey())).pending.length) await new Promise((resolve) => setTimeout(resolve, 1));
  state.userId = "account-b";
  const changed = service.observeAuth("account-b");
  release();
  await assert.rejects(retry, /account changed/);
  await changed;
  assert.equal(state.published.length, 1);
  assert.equal(state.published[0].userId, "account-a");
  assert.equal(JSON.parse(state.values.get(accountKey())).pending.length, 1);
});

test("opt-out and preferences stay responsive during an in-flight publication and cancel later pending records", async () => {
  const { state, service } = setup();
  await service.setPreferences("account-a", { enabled: true, visibility: "friends" });
  state.history = [point("one", 100), point("two", 50, day(2), day(3), "row")]; state.now = Date.parse(day(4));
  let release;
  state.publishGate = new Promise((resolve) => { release = resolve; });
  const retry = service.retry();
  while (!JSON.parse(state.values.get(accountKey())).pending.length) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal((await service.getPreferences("account-a")).pendingCount, 2, "reads do not wait for cloud publication");
  await service.setPreferences("account-a", { enabled: false, visibility: "friends" });
  assert.equal((await service.getPreferences("account-a")).enabled, false, "opt-out persists before network finishes");
  release(); await retry;
  assert.equal(state.published.length, 1, "only the request already in flight finishes");
  assert.equal((await service.getPreferences("account-a")).pendingCount, 0);
});

test("corrupt sharing settings fail visibly and preserve stored values", async () => {
  const { state, service } = setup();
  state.values.set(accountKey(), "corrupt data");
  await assert.rejects(service.getPreferences("account-a"), /could not be read/);
  await assert.rejects(service.retry(), /could not be read/);
  assert.equal(state.values.get(accountKey()), "corrupt data");
  assert.equal(state.published.length, 0);
});

test("failed auth-boundary writes retain the original switch time before retry derivation", async () => {
  const { state, service } = setup();
  await service.setPreferences("account-a", { enabled: true, visibility: "friends" });
  state.now = Date.parse(day(2)); state.userId = null; state.failWrite = true;
  await assert.rejects(service.observeAuth(null), /Disk unavailable/);
  state.history = [point("guest", 100, day(3), day(4))];
  state.now = Date.parse(day(5)); state.userId = "account-a";
  const switchBack = service.observeAuth("account-a");
  state.failWrite = false;
  await switchBack;
  await service.retry();
  assert.equal(state.published.length, 0);
  assert.equal(JSON.parse(state.values.get(accountKey())).windows[0].to, day(2));
});
