import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuthClient, createAuthStorage, createFetchWithTimeout, getAuthStorageKey, LEGACY_AUTH_SESSION_KEY } from "../src/lib/authClient.ts";
import { createAuthService } from "../src/features/social/authService.ts";

const config = { url: "https://orca-test.supabase.co", publishableKey: "sb_publishable_test" };
const sessionKey = getAuthStorageKey(config.url);
const user = { id: "test-user", aud: "authenticated", role: "authenticated", email: "test@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function session(seconds = 3600, refreshToken = "refresh-original") {
  const expiresAt = Math.floor(Date.now() / 1000) + seconds;
  const encode = (data) => Buffer.from(JSON.stringify(data)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, iss: `${config.url}/auth/v1`, exp: expiresAt, iat: Math.floor(Date.now() / 1000), role: "authenticated" })}.test-signature`;
  return { access_token: token, refresh_token: refreshToken, expires_in: seconds, expires_at: expiresAt, token_type: "bearer", user };
}

function memoryStorage(initial = []) {
  const values = new Map(initial);
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); }
  };
}

function service(client) {
  return createAuthService({
    getOptionalClient: () => client,
    getClient: () => { assert.ok(client); return client; },
    getCallbackUrl: () => "projectorca9://auth/callback"
  });
}

async function fixture(t, responder, initial = []) {
  const calls = [];
  const storage = memoryStorage(initial);
  const client = createAuthClient(config, storage, async (input, init) => {
    const call = { url: String(input), ...init };
    calls.push(call);
    return responder(call);
  });
  assert.ok(client);
  t.after(() => client.auth.stopAutoRefresh());
  await client.auth.getSession();
  await client.auth.stopAutoRefresh();
  return { client, auth: service(client), storage, calls };
}

test("missing or placeholder configuration allows guest access without storage or network", async () => {
  const forbidden = () => { throw new Error("Guest mode touched account infrastructure"); };
  for (const value of [{ url: "", publishableKey: "" }, { url: "bad-url", publishableKey: "key" }, { url: "https://your-project-id.supabase.co", publishableKey: "your-publishable-key" }]) {
    const client = createAuthClient(value, { getItem: forbidden, setItem: forbidden, removeItem: forbidden }, forbidden);
    assert.equal(client, null);
    assert.equal(await service(client).getCurrentAuthSession(), null);
    assert.equal(await service(client).getCurrentAccessToken(), null);
    await service(client).signOut();
  }
});

test("password login persists a session and the same client authenticates avatar storage", async (t) => {
  const loggedIn = session();
  const { auth, client, storage, calls } = await fixture(t, ({ url }) => url.includes("/storage/") ? json({ Key: "avatars/test-user/avatar.jpg" }) : json(loggedIn));
  await auth.signInWithEmailPassword("test@example.test", "test-only-password");
  assert.equal(JSON.parse(storage.values.get(sessionKey)).refresh_token, loggedIn.refresh_token);
  await client.storage.from("avatars").upload("test-user/avatar.jpg", new Uint8Array([1]), { contentType: "image/jpeg" });
  const upload = calls.find((call) => call.url.includes("/storage/"));
  assert.equal(new Headers(upload.headers).get("Authorization"), `Bearer ${loggedIn.access_token}`);
});

test("concurrent requests refresh an expired token once and persist rotated credentials", async (t) => {
  const renewed = session(3600, "refresh-rotated");
  const { auth, storage, calls } = await fixture(t, async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return json(renewed);
  });
  await storage.setItem(sessionKey, JSON.stringify(session(-120)));
  const tokens = await Promise.all(Array.from({ length: 8 }, () => auth.getCurrentAccessToken()));
  assert.deepEqual(tokens, Array(8).fill(renewed.access_token));
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("grant_type=refresh_token"));
  assert.equal(JSON.parse(calls[0].body).refresh_token, "refresh-original");
  assert.equal(JSON.parse(storage.values.get(sessionKey)).refresh_token, "refresh-rotated");
});

test("a restarted client restores a saved login without another password request", async (t) => {
  const saved = session();
  const { auth, calls } = await fixture(t, () => { throw new Error("Unexpected network request"); }, [[sessionKey, JSON.stringify(saved)]]);
  assert.equal((await auth.getCurrentAuthSession()).user.id, user.id);
  assert.equal(await auth.getCurrentAccessToken(), saved.access_token);
  assert.equal(calls.length, 0);
});

test("legacy sessions migrate and refresh without touching local workout data", async (t) => {
  const old = session(-120);
  const legacy = JSON.stringify({ accessToken: old.access_token, refreshToken: old.refresh_token, expiresAt: old.expires_at, user });
  const renewed = session(3600, "migrated-refresh");
  const { auth, storage } = await fixture(t, () => json(renewed), [[LEGACY_AUTH_SESSION_KEY, legacy], ["orca9.workoutSessions", "workouts"], ["orca9.restDays", "rest"]]);
  assert.equal(await auth.getCurrentAccessToken(), renewed.access_token);
  assert.equal(storage.values.has(LEGACY_AUTH_SESSION_KEY), false);
  assert.equal(JSON.parse(storage.values.get(sessionKey)).refresh_token, "migrated-refresh");
  assert.equal(storage.values.get("orca9.workoutSessions"), "workouts");
  assert.equal(storage.values.get("orca9.restDays"), "rest");
});

test("invalid legacy data and sessions belonging to another project are not imported", async () => {
  for (const legacy of ["not-json", "null", JSON.stringify({ accessToken: session().access_token, refreshToken: "old", user })]) {
    const storage = memoryStorage([[LEGACY_AUTH_SESSION_KEY, legacy]]);
    const other = { ...config, url: "https://another-project.supabase.co" };
    const adapter = createAuthStorage(storage, other);
    assert.equal(await adapter.getItem(getAuthStorageKey(other.url)), null);
  }
});

test("a rejected expired refresh clears the account without clearing workouts", async (t) => {
  const { auth, storage } = await fixture(t, () => json({ code: "refresh_token_not_found", msg: "Invalid Refresh Token" }, 400));
  await storage.setItem(sessionKey, JSON.stringify(session(-120)));
  await storage.setItem("orca9.workoutSessions", "workouts");
  await assert.rejects(() => auth.getCurrentAccessToken(), /Invalid Refresh Token/);
  assert.equal(await auth.getCurrentAuthSession(), null);
  assert.equal(storage.values.get("orca9.workoutSessions"), "workouts");
});

test("a failed refresh cannot return an expired access token and keeps credentials for retry", async (t) => {
  const { auth, storage } = await fixture(t, () => json({ message: "Offline" }, 503));
  await storage.setItem(sessionKey, JSON.stringify(session(-120)));
  await assert.rejects(() => auth.getCurrentAccessToken(), /reconnect|Offline/);
  assert.ok(storage.values.has(sessionKey));
});

test("sign out clears persisted auth and legacy imports but preserves workout history", async (t) => {
  const { auth, storage, calls } = await fixture(t, () => new Response(null, { status: 204 }));
  await storage.setItem(sessionKey, JSON.stringify(session()));
  await storage.setItem(LEGACY_AUTH_SESSION_KEY, "old-session");
  await storage.setItem("orca9.workoutSessions", "workouts");
  await auth.signOut();
  assert.equal(await auth.getCurrentAuthSession(), null);
  assert.equal(storage.values.has(LEGACY_AUTH_SESSION_KEY), false);
  assert.equal(storage.values.get("orca9.workoutSessions"), "workouts");
  assert.ok(calls[0].url.includes("scope=local"));
});

test("email confirmation imports both tokens into the shared SDK session", async (t) => {
  const confirmed = session();
  const { auth, storage } = await fixture(t, () => json(user));
  await auth.storeAuthSessionFromCallbackUrl(`projectorca9://auth/callback#access_token=${confirmed.access_token}&refresh_token=${confirmed.refresh_token}`);
  assert.equal(JSON.parse(storage.values.get(sessionKey)).refresh_token, confirmed.refresh_token);
  await assert.rejects(() => auth.storeAuthSessionFromCallbackUrl("projectorca9://auth/callback#error_description=Link+expired"), /Link expired/);
  await assert.rejects(() => auth.storeAuthSessionFromCallbackUrl("projectorca9://auth/callback#access_token=incomplete"), /complete session/);
});

test("signup requiring confirmation does not create a fake signed-in session", async (t) => {
  const { auth, calls } = await fixture(t, () => json(user));
  const result = await auth.signUpWithEmailPassword("test@example.test", "test-only-password", undefined, { handle: "lifter" });
  assert.equal(result.session, null);
  assert.equal(await auth.getCurrentAuthSession(), null);
  assert.equal(JSON.parse(calls[0].body).data.handle, "lifter");
  assert.ok(calls[0].url.includes("redirect_to="));
});

test("hung requests are aborted and caller cancellation is respected", async () => {
  const waitingFetch = (_input, init) => new Promise((_resolve, reject) => {
    if (init.signal.aborted) return reject(new Error("aborted"));
    init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  await assert.rejects(() => createFetchWithTimeout(waitingFetch, 15)("https://example.test"), /aborted/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => createFetchWithTimeout(waitingFetch)("https://example.test", { signal: controller.signal }), /aborted/);
});
