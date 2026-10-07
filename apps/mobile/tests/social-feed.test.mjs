import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFeedClient, validateFeedImage, FEED_IMAGE_LIMIT_BYTES } from '../src/features/social/feedClient.ts';

const userId = '11111111-1111-1111-1111-111111111111';
const otherId = '22222222-2222-2222-2222-222222222222';
const config = { url: 'https://orca-test.supabase.co', publishableKey: 'sb_publishable_test' };
const png = { base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64'), mimeType: 'image/png' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const post = (id = 'post-id', image = null) => ({
  id, user_id: userId, client_event_id: 'event-1', event_type: 'user_post', summary_text: 'A good training day',
  visibility: 'friends', occurred_at: '2026-10-06T18:00:00Z', created_at: '2026-10-06T18:00:00Z', image_path: image,
  exercise_name_snapshot: null, author: { user_id: userId, handle: 'lifter', display_name: 'Lifter', avatar_url: null, profile_visibility: 'private' }
});
function fixture(responder, initialUser = userId, options = {}) {
  let currentUser = initialUser;
  const calls = [];
  const client = createFeedClient({
    getConfig: () => config,
    getSession: async () => currentUser ? { user: { id: currentUser }, access_token: `token-for-${currentUser}` } : null,
    fetch: async (url, init) => { const call = { url, ...init }; calls.push(call); return responder(call); },
    ...options
  });
  return { client, calls, switchUser: (id) => { currentUser = id; } };
}

test('guest social access makes no account request and never publishes a forged owner', async () => {
  const { client, calls } = fixture(() => { throw new Error('Unexpected request'); }, null);
  await assert.rejects(() => client.loadFeed(), /Sign in/);
  await assert.rejects(() => client.createFeedPost({ userId, eventId: 'new', text: 'hello', visibility: 'friends' }), /account changed/);
  assert.equal(calls.length, 0);
  const signedIn = fixture(() => { throw new Error('Unexpected request'); });
  await assert.rejects(() => signedIn.client.createFeedPost({ userId: otherId, eventId: 'new', text: 'hello', visibility: 'friends' }), /account changed/);
  assert.equal(signedIn.calls.length, 0);
});

test('text posts use owner-bound RPC, trim text and retry the same identity', async () => {
  const { client, calls } = fixture(() => json(post()));
  const input = { userId, eventId: 'event-1', text: ' A good training day ', visibility: 'friends' };
  assert.equal((await client.createFeedPost(input)).clientEventId, 'event-1');
  await client.createFeedPost(input);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.ok(call.url.endsWith('/rest/v1/rpc/orca_create_post'));
    assert.equal(new Headers(call.headers).get('Authorization'), `Bearer token-for-${userId}`);
    assert.deepEqual(JSON.parse(call.body), { p_client_event_id: 'event-1', p_text: 'A good training day', p_visibility: 'friends', p_image_path: null });
  }
});

test('image posts upload immutable owner paths and request short private signed URLs', async () => {
  const path = `${userId}/event-1.png`;
  const { client, calls } = fixture(({ url }) => url.includes('/rpc/') ? json(post('post-id', path))
    : url.includes('/object/sign/') ? json({ signedURL: '/object/sign/feed-images/example?token=test' }) : json({ Key: path }));
  const result = await client.createFeedPost({ userId, eventId: 'event-1', text: '', image: png, visibility: 'private' });
  assert.ok(result.imageUrl.startsWith(`${config.url}/storage/v1/object/sign/`));
  assert.ok(calls[0].url.endsWith(`/storage/v1/object/feed-images/${path}`));
  assert.equal(new Headers(calls[0].headers).get('Content-Type'), 'image/png');
  assert.equal(new Headers(calls[0].headers).get('x-upsert'), 'false');
  assert.deepEqual(Array.from(calls[0].body), [137, 80, 78, 71, 13, 10, 26, 10, 0]);
  assert.equal(JSON.parse(calls[2].body).expiresIn, 60);
});

test('an uncertain completed image upload can retry without replacing the object', async () => {
  const { client, calls } = fixture(({ url }) => url.includes('/rpc/') ? json(post()) : json({ message: 'The resource already exists', statusCode: '409' }, 400));
  await client.createFeedPost({ userId, eventId: 'event-1', text: 'hello', image: png, visibility: 'friends' });
  assert.equal(calls.length, 2);
  assert.equal(new Headers(calls[0].headers).get('x-upsert'), 'false');
});

test('switching accounts during image upload stops the subsequent post write', async () => {
  let scope;
  scope = fixture(() => { scope.switchUser(otherId); return json({ Key: 'uploaded' }); });
  await assert.rejects(() => scope.client.createFeedPost({ userId, eventId: 'event-1', text: 'hello', image: png, visibility: 'friends' }), /account changed/);
  assert.equal(scope.calls.length, 1);
  assert.ok(scope.calls[0].url.includes('/storage/'));
});

test('a late response from a signed-out account cannot populate the new account feed', async () => {
  let scope;
  scope = fixture(() => { scope.switchUser(null); return json([post()]); });
  await assert.rejects(() => scope.client.loadFeed(), /account changed/);
  assert.equal(scope.calls.length, 1);
});

test('following and owner feeds paginate equal timestamps with the unique post ID', async () => {
  const { client, calls } = fixture(() => json([post('3'), post('2'), post('1')]));
  const page = await client.loadFeed({ mode: 'following', limit: 2 });
  assert.deepEqual(page.posts.map((value) => value.id), ['3', '2']);
  assert.deepEqual(page.nextCursor, { occurredAt: post().occurred_at, id: '2' });
  await client.loadFeed({ mode: 'mine', before: page.nextCursor, limit: 2 });
  assert.deepEqual(JSON.parse(calls[1].body), { p_mode: 'mine', p_limit: 3, p_before_time: post().occurred_at, p_before_id: '2' });
});

test('missing photos do not drop posts and account switches while signing are rejected', async () => {
  const { client } = fixture(({ url }) => url.includes('/rpc/') ? json([post('1', `${userId}/photo.png`)]) : json({ message: 'Object not found' }, 404));
  const result = await client.loadFeed();
  assert.equal(result.posts[0].imageUnavailable, true);
  assert.equal(result.posts[0].imageUrl, undefined);
  let scope;
  scope = fixture(({ url }) => {
    if (url.includes('/rpc/')) return json([post('1', `${userId}/photo.png`)]);
    scope.switchUser(otherId);
    return json({ signedURL: '/object/sign/feed-images/test?token=secret' });
  });
  await assert.rejects(() => scope.client.loadFeed(), /account changed/);
});

test('follow operations use scoped RPCs, leave approval to the owner and cannot self-follow', async () => {
  const { client, calls } = fixture(({ url }) => json(url.endsWith('/orca_follow') ? 'pending' : null));
  assert.equal(await client.followUser(otherId), 'pending');
  await client.respondToFollowRequest(otherId, true);
  await client.unfollowUser(otherId);
  await client.removeFollower(otherId);
  await assert.rejects(() => client.followUser(userId), /yourself/);
  assert.deepEqual(calls.map(({ url }) => url.split('/').at(-1)), ['orca_follow', 'orca_respond_follow', 'orca_unfollow', 'orca_remove_follower']);
  assert.deepEqual(JSON.parse(calls[1].body), { p_user_id: otherId, p_accept: true });
});

test('PR publishing emits compact allowlisted data and the owner-scoped event ID', async () => {
  const { client, calls } = fixture(() => json(true));
  await client.publishPersonalRecord({ userId, eventId: 'session:lift', workoutSessionId: 'session', exerciseName: ' Bench ', summaryText: ' Bench: 135 lb × 5 ', occurredAt: '2026-10-06T18:00:00Z', visibility: 'friends', note: 'private note', sets: ['raw workout'] });
  assert.deepEqual(JSON.parse(calls[0].body), { p_client_event_id: 'session:lift', p_workout_session_id: 'session', p_exercise_name: 'Bench', p_summary_text: 'Bench: 135 lb × 5', p_occurred_at: '2026-10-06T18:00:00Z', p_visibility: 'friends' });
  assert.ok(!calls[0].body.includes('private note'));
});

test('deletion removes the post before the photo and reports a retryable orphan cleanup', async () => {
  const { client, calls } = fixture(({ url }) => url.includes('/rpc/') ? json({ image_path: `${userId}/photo.png` }) : json({ message: 'Offline' }, 503));
  assert.deepEqual(await client.deleteFeedPost('post-id', userId), { imageCleanupPending: true });
  assert.ok(calls[0].url.endsWith('/orca_delete_post'));
  assert.equal(calls[1].method, 'DELETE');
  assert.deepEqual(JSON.parse(calls[1].body), { prefixes: [`${userId}/photo.png`] });
});

test('invalid content, non-images and oversized files are rejected before upload', async () => {
  const { client, calls } = fixture(() => { throw new Error('Unexpected request'); });
  for (const text of ['', ' '.repeat(5), 'a'.repeat(2001)]) await assert.rejects(() => client.createFeedPost({ userId, eventId: 'new', text, visibility: 'friends' }), /2000/);
  assert.throws(() => validateFeedImage({ ...png, mimeType: 'image/gif' }), /JPEG/);
  assert.throws(() => validateFeedImage({ base64: Buffer.from('not a photo').toString('base64'), mimeType: 'image/jpeg' }), /valid JPEG/);
  const large = Buffer.alloc(FEED_IMAGE_LIMIT_BYTES + 1); large.set([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.throws(() => validateFeedImage({ base64: large.toString('base64'), mimeType: 'image/png' }), /5 MB/);
  assert.equal(calls.length, 0);
});

test('missing server migration is actionable and hung requests can retry', async () => {
  const missing = fixture(() => json({ code: 'PGRST202', message: 'Missing function' }, 404));
  await assert.rejects(() => missing.client.loadFeed(), /feed is unavailable/);
  const hanging = fixture((_call) => { throw new Error('unused'); }, userId, {
    timeoutMs: 10,
    fetch: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }))
  });
  await assert.rejects(() => hanging.client.loadFeed(), /timed out/);
});
