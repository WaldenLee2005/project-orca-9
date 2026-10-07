// Real PostgreSQL policy/RPC checks, with minimal Supabase auth/storage schemas.
// Install @electric-sql/pglite into a temporary folder; set ORCA_PGLITE_MODULE to
// its dist/index.js. No cloud accounts, credentials or repository dependency changes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.ORCA_PGLITE_MODULE;
if (!modulePath) throw new Error('Set ORCA_PGLITE_MODULE to a temporary @electric-sql/pglite/dist/index.js installation.');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const sql = await readFile(new URL('../feed-following.sql', import.meta.url), 'utf8');
const schema = await readFile(new URL('../social-schema.sql', import.meta.url), 'utf8');
const ids = {
  owner: '11111111-1111-1111-1111-111111111111', follower: '22222222-2222-2222-2222-222222222222',
  stranger: '33333333-3333-3333-3333-333333333333', public: '44444444-4444-4444-4444-444444444444'
};
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

test('rerunnable feed migration preserves data and enforces following, audiences, images, retries and deletion', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, unique(bucket_id, name));
      create function storage.foldername(name text) returns text[] language sql immutable as
        $$ select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/') $$;
      alter table storage.objects enable row level security;
      grant usage on schema public, auth, storage to anon, authenticated;
      grant select, insert, update, delete on storage.objects to anon, authenticated;
      grant execute on function auth.uid(), storage.foldername(text) to anon, authenticated;
    `);
    await db.exec(schema);
    await db.exec(`
      insert into auth.users(id,email) values
        (${literal(ids.owner)}, 'owner@example.test'), (${literal(ids.follower)}, 'follower@example.test'),
        (${literal(ids.stranger)}, 'stranger@example.test'), (${literal(ids.public)}, 'public@example.test');
      insert into public.social_profiles(user_id,handle,display_name,profile_visibility) values
        (${literal(ids.owner)}, 'private_owner', 'Private Owner', 'private'),
        (${literal(ids.follower)}, 'follower', 'Follower', 'private'),
        (${literal(ids.stranger)}, 'stranger', 'Stranger', 'private'),
        (${literal(ids.public)}, 'public_lifter', 'Public Lifter', 'public');
      insert into public.feed_events(user_id,event_type,summary_text,visibility,occurred_at)
        values (${literal(ids.owner)}, 'completed_session', 'Legacy session', 'private', now());
    `);
    await db.exec(sql);
    await db.exec(sql);
    assert.equal((await db.query('select count(*)::int as count from public.feed_events')).rows[0].count, 1, 'migration preserves legacy posts');
    assert.equal((await db.query('select count(*)::int as count from public.social_profiles')).rows[0].count, 4, 'migration preserves profiles');
    const bucket = (await db.query("select * from storage.buckets where id = 'feed-images'")).rows[0];
    assert.equal(bucket.public, false);
    assert.equal(Number(bucket.file_size_limit), 5242880);
    assert.deepEqual(bucket.allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp']);

    async function as(user, query) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
      await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
      return db.query(query);
    }
    async function valueAs(user, query) { return (await as(user, query)).rows[0]?.result; }
    async function denied(user, query, pattern = /permission denied|row-level security|Sign in required/) {
      await assert.rejects(() => as(user, query), pattern);
    }
    const owner = ids.owner; const follower = ids.follower; const stranger = ids.stranger;
    const imagePath = `${owner}/image.png`;

    await denied(null, "select public.orca_feed() as result");
    await denied(null, 'select * from public.feed_events');
    await denied(follower, `insert into public.follows values (${literal(follower)}, ${literal(owner)}, 'accepted', now(), now())`);
    await denied(follower, `update public.follows set status = 'accepted'`);
    await denied(follower, `select public.orca_follow(${literal(follower)})`, /cannot follow yourself/);
    await denied(follower, `insert into public.feed_events(user_id,event_type,summary_text,occurred_at) values (${literal(owner)},'user_post','spoof',now())`);
    await denied(follower, `delete from public.feed_events`);

    assert.deepEqual(await valueAs(stranger, "select public.orca_search_people('private') as result"), [], 'private profile absent from broad discovery');
    const exact = await valueAs(stranger, "select public.orca_search_people('@private_owner') as result");
    assert.equal(exact[0].user_id, owner, 'exact handle gives minimal private profile card');
    assert.equal(exact[0].email, undefined);
    assert.equal((await as(stranger, `select * from public.social_profiles where user_id = ${literal(owner)}`)).rows.length, 0, 'direct private profile query remains protected');

    await denied(stranger, `insert into storage.objects(bucket_id,name) values ('feed-images',${literal(imagePath)})`);
    await as(owner, `insert into storage.objects(bucket_id,name) values ('feed-images',${literal(imagePath)})`);
    assert.equal((await as(follower, "select * from storage.objects where bucket_id = 'feed-images'")).rows.length, 0, 'orphan photo is owner only');
    assert.equal((await as(null, "select * from storage.objects where bucket_id = 'feed-images'")).rows.length, 0, 'anonymous photo read is denied');
    assert.equal((await as(owner, `update storage.objects set name=${literal(`${owner}/replaced.png`)} where name=${literal(imagePath)} returning id`)).rows.length, 0, 'published photo paths cannot be updated');
    const photoPost = await valueAs(owner, `select public.orca_create_post('image-post', 'Photo', 'friends', ${literal(imagePath)}) as result`);
    const privatePost = await valueAs(owner, "select public.orca_create_post('private-post', 'Only me', 'private') as result");
    const apparentPublic = await valueAs(owner, "select public.orca_create_post('public-post', 'Followers while profile private', 'public') as result");
    assert.equal(await valueAs(follower, `select public.orca_follow(${literal(owner)}) as result`), 'pending');
    await as(follower, `select public.orca_respond_follow(${literal(owner)},true)`);
    assert.equal((await as(follower, `select status from public.follows where followed_user_id=${literal(owner)}`)).rows[0].status, 'pending', 'requester cannot approve own request');
    assert.deepEqual(await valueAs(follower, "select public.orca_feed() as result"), [], 'pending follower cannot read any posts');
    assert.equal((await as(follower, "select * from storage.objects where bucket_id = 'feed-images'")).rows.length, 0, 'pending follower cannot mint private photo access');
    const requests = await valueAs(owner, 'select public.orca_connections() as result');
    assert.equal(requests.requests[0].user_id, follower, 'owner sees request despite requester private profile');

    await as(owner, `select public.orca_respond_follow(${literal(follower)},true)`);
    const feed = await valueAs(follower, "select public.orca_feed() as result");
    assert.deepEqual(new Set(feed.map((entry) => entry.id)), new Set([photoPost.id, apparentPublic.id]), 'approved followers see shared posts but not private posts');
    assert.equal((await as(follower, "select * from storage.objects where bucket_id = 'feed-images'")).rows.length, 1, 'approved follower can access shared photo');
    assert.deepEqual(await valueAs(stranger, "select public.orca_feed('discover') as result"), [], 'private profile hides public-audience post from strangers');
    const mine = await valueAs(owner, "select public.orca_feed('mine') as result");
    assert.equal(mine.length, 4, 'owner feed includes old and private posts');
    assert.ok(mine.some((entry) => entry.id === privatePost.id));

    await as(owner, `select public.orca_remove_follower(${literal(follower)})`);
    assert.equal((await as(follower, "select * from storage.objects where bucket_id = 'feed-images'")).rows.length, 0, 'revocation blocks new photo access');
    assert.deepEqual(await valueAs(follower, 'select public.orca_feed() as result'), [], 'revocation removes feed access');
    assert.equal(await valueAs(follower, `select public.orca_follow(${literal(ids.public)}) as result`), 'accepted', 'public follow is immediate');
    await as(ids.public, "select public.orca_create_post('open-post', 'Public post', 'public')");
    await as(ids.public, "select public.orca_create_post('public-profile-private-post', 'Still only me', 'private')");
    assert.equal((await valueAs(stranger, "select public.orca_feed('discover') as result")).length, 1);
    assert.equal((await valueAs(follower, 'select public.orca_feed() as result')).length, 1, 'a public profile cannot expose its private-audience post');
    await as(ids.public, `update public.social_profiles set profile_visibility = 'friends' where user_id = ${literal(ids.public)}`);
    assert.deepEqual(await valueAs(stranger, "select public.orca_feed('discover') as result"), [], 'current profile privacy restricts existing public post');
    assert.equal((await valueAs(follower, 'select public.orca_feed() as result')).length, 1, 'approved follower remains allowed after profile privacy change');

    const retry = await valueAs(owner, `select public.orca_create_post('image-post', 'Photo', 'friends', ${literal(imagePath)}) as result`);
    assert.equal(retry.id, photoPost.id, 'same retry never duplicates a post');
    await denied(owner, "select public.orca_create_post('image-post', 'Changed', 'friends')", /already published/);
    await denied(owner, "select public.orca_create_post('too-long',repeat('a',2001),'friends')", /2000/);
    await denied(owner, `select public.orca_create_post('foreign-photo','x','friends',${literal(`${follower}/image.png`)})`, /Upload your photo/);
    assert.equal((await as(follower, `delete from storage.objects where name=${literal(imagePath)} returning id`)).rows.length, 0, 'nonowner cannot remove photo');
    assert.equal((await as(owner, `select * from storage.objects where name=${literal(imagePath)}`)).rows.length, 1);

    const publishPr = "select public.orca_publish_pr('pr-key','local-session','Bench','Bench: 135 lb x 5',now(),'friends') as result";
    assert.equal(await valueAs(owner, publishPr), true);
    assert.equal(await valueAs(owner, publishPr), true);
    const pr = (await valueAs(owner, "select public.orca_feed('mine') as result")).find((entry) => entry.client_event_id === 'pr-key');
    assert.ok(pr);
    assert.equal((await as(owner, "select count(*)::int as count from public.feed_events where client_event_id='pr-key'")).rows[0].count, 1);
    assert.deepEqual(await valueAs(stranger, `select public.orca_delete_post(${literal(photoPost.id)}) as result`), { image_path: null }, 'stranger cannot delete or learn image path');
    assert.deepEqual(await valueAs(owner, `select public.orca_delete_post(${literal(photoPost.id)}) as result`), { image_path: imagePath });
    assert.deepEqual(await valueAs(owner, `select public.orca_delete_post(${literal(photoPost.id)}) as result`), { image_path: imagePath }, 'photo cleanup retry survives removed feed row');
    await denied(owner, `select public.orca_create_post('image-post', 'Photo', 'friends', ${literal(imagePath)})`, /deleted/);
    await as(owner, `select public.orca_delete_post(${literal(pr.id)})`);
    assert.equal(await valueAs(owner, publishPr), false, 'deleted PR cannot be resurrected by an old queue');
    assert.equal((await as(owner, "select count(*)::int as count from public.feed_events where client_event_id='pr-key'")).rows[0].count, 0);
    await as(owner, `delete from storage.objects where name=${literal(imagePath)}`);
    await db.exec('reset role');
    await db.exec(`delete from auth.users where id=${literal(owner)}`);
    assert.equal((await db.query(`select count(*)::int as count from public.social_profiles where user_id=${literal(owner)}`)).rows[0].count, 0, 'account cascade succeeds without tombstone FK failure');
  } finally { await db.close(); }
});
