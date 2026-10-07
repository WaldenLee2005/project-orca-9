-- Run after social-schema.sql and avatar-storage.sql. Additive and rerunnable:
-- existing profiles, friendships, feed events and workout data are preserved.
begin;

create schema if not exists orca_private;
revoke all on schema orca_private from public;
grant usage on schema orca_private to authenticated;

create table if not exists public.follows (
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  followed_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  constraint follows_no_self check (follower_user_id <> followed_user_id)
);
create index if not exists follows_incoming on public.follows (followed_user_id, status);
alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;
grant select on public.follows to authenticated;
drop policy if exists "Follow participants can read their connections" on public.follows;
create policy "Follow participants can read their connections"
on public.follows for select to authenticated
using (follower_user_id = (select auth.uid()) or followed_user_id = (select auth.uid()));
-- Writes are RPC-only: a requester cannot approve themselves or change endpoints.

alter table public.feed_events add column if not exists client_event_id text;
alter table public.feed_events add column if not exists image_path text;
alter table public.feed_events drop constraint if exists feed_events_event_type_check;
alter table public.feed_events add constraint feed_events_event_type_check
  check (event_type in ('personal_record', 'completed_session', 'weekly_consistency', 'user_post')) not valid;
alter table public.feed_events drop constraint if exists feed_events_content_bounds;
alter table public.feed_events add constraint feed_events_content_bounds check (
  client_event_id is null or (length(client_event_id) between 1 and 240
  and length(summary_text) <= 2000 and (length(btrim(summary_text)) > 0 or image_path is not null))
) not valid;
alter table public.feed_events drop constraint if exists feed_events_owned_image;
alter table public.feed_events add constraint feed_events_owned_image check (
  image_path is null or (event_type = 'user_post' and image_path ~ ('^' || user_id::text || '/[^/]+\.(jpg|png|webp)$'))
) not valid;
create unique index if not exists feed_events_client_event_unique on public.feed_events (user_id, client_event_id);
create index if not exists feed_events_feed_order on public.feed_events (occurred_at desc, id desc);
create index if not exists feed_events_owner_order on public.feed_events (user_id, occurred_at desc, id desc);

-- A deletion tombstone prevents an old offline PR retry from recreating a removed post.
create table if not exists orca_private.deleted_feed_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_event_id text not null,
  post_id uuid,
  image_path text,
  deleted_at timestamptz not null default now(),
  primary key (user_id, client_event_id)
);
alter table orca_private.deleted_feed_events add column if not exists post_id uuid;
alter table orca_private.deleted_feed_events add column if not exists image_path text;
create unique index if not exists deleted_feed_events_post_id on orca_private.deleted_feed_events(post_id);
revoke all on orca_private.deleted_feed_events from public, anon, authenticated;

create or replace function orca_private.is_following(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.follows f where f.follower_user_id = (select auth.uid())
    and f.followed_user_id = p_owner and f.status = 'accepted');
$$;

create or replace function orca_private.can_view_feed(p_owner uuid, p_visibility text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    p_owner = (select auth.uid()) or (p_visibility <> 'private' and exists (
      select 1 from public.social_profiles p where p.user_id = p_owner and (
        (p.profile_visibility = 'public' and p_visibility = 'public')
        or orca_private.is_following(p_owner)
      )
    ))
  );
$$;
revoke all on function orca_private.is_following(uuid), orca_private.can_view_feed(uuid, text) from public, anon;
grant execute on function orca_private.is_following(uuid), orca_private.can_view_feed(uuid, text) to authenticated;

drop policy if exists "Authenticated users can view non-private social profiles." on public.social_profiles;
drop policy if exists "Profiles respect discovery and accepted followers" on public.social_profiles;
revoke all on public.social_profiles from anon, authenticated;
grant select, insert, update on public.social_profiles to authenticated;
create policy "Profiles respect discovery and accepted followers"
on public.social_profiles for select to authenticated using (
  (select auth.uid()) is not null and (user_id = (select auth.uid())
    or profile_visibility in ('friends', 'public') or orca_private.is_following(user_id))
);

alter table public.feed_events enable row level security;
revoke all on public.feed_events from anon, authenticated;
grant select on public.feed_events to authenticated;
drop policy if exists "Users can view their own feed events." on public.feed_events;
drop policy if exists "Users can create their own feed events." on public.feed_events;
drop policy if exists "Feed events respect post and current profile audience" on public.feed_events;
create policy "Feed events respect post and current profile audience"
on public.feed_events for select to authenticated
using (orca_private.can_view_feed(user_id, visibility));
-- Existing owner-delete policy is preserved but has no direct client grant.
-- RPCs enforce validation and deletion tombstones for all writes.

create or replace function orca_private.remember_feed_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.client_event_id is not null and exists(select 1 from auth.users where id = old.user_id) then
    insert into orca_private.deleted_feed_events(user_id, client_event_id, post_id, image_path)
    values (old.user_id, old.client_event_id, old.id, old.image_path) on conflict do nothing;
  end if;
  return old;
end;
$$;
revoke all on function orca_private.remember_feed_deletion() from public, anon, authenticated;
drop trigger if exists feed_deletion_tombstone on public.feed_events;
create trigger feed_deletion_tombstone before delete on public.feed_events
for each row execute function orca_private.remember_feed_deletion();

create or replace function orca_private.feed_json(p_event public.feed_events)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(p_event) || jsonb_build_object('author', jsonb_build_object(
    'user_id', p.user_id, 'handle', p.handle, 'display_name', p.display_name,
    'avatar_url', p.avatar_url, 'profile_visibility', p.profile_visibility
  )) from public.social_profiles p where p.user_id = p_event.user_id;
$$;
revoke all on function orca_private.feed_json(public.feed_events) from public, anon, authenticated;

create or replace function public.orca_feed(
  p_mode text default 'following', p_limit integer default 21,
  p_before_time timestamptz default null, p_before_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_mode is null or p_mode not in ('following', 'mine', 'discover') then raise exception 'Invalid feed'; end if;
  if (p_before_time is null) <> (p_before_id is null) then raise exception 'Invalid feed cursor'; end if;
  return coalesce((select jsonb_agg(orca_private.feed_json(e::public.feed_events) order by e.occurred_at desc, e.id desc)
    from (select fe.* from public.feed_events fe
      join public.social_profiles p on p.user_id = fe.user_id
      where orca_private.can_view_feed(fe.user_id, fe.visibility)
        and (case p_mode
          when 'mine' then fe.user_id = auth.uid()
          when 'following' then fe.user_id = auth.uid() or orca_private.is_following(fe.user_id)
          else fe.visibility = 'public' and p.profile_visibility = 'public' end)
        and (p_before_time is null or (fe.occurred_at, fe.id) < (p_before_time, p_before_id))
      order by fe.occurred_at desc, fe.id desc limit greatest(1, least(coalesce(p_limit, 21), 51))
    ) e), '[]'::jsonb);
end;
$$;

create or replace function orca_private.person_json(p_person public.social_profiles)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id', p_person.user_id, 'handle', p_person.handle,
    'display_name', p_person.display_name, 'avatar_url', p_person.avatar_url,
    'profile_visibility', p_person.profile_visibility,
    'relationship', coalesce((select f.status from public.follows f
      where f.follower_user_id = auth.uid() and f.followed_user_id = p_person.user_id), 'none'),
    'is_follower', exists (select 1 from public.follows f where f.follower_user_id = p_person.user_id
      and f.followed_user_id = auth.uid() and f.status = 'accepted'));
$$;
revoke all on function orca_private.person_json(public.social_profiles) from public, anon, authenticated;

create or replace function public.orca_search_people(p_query text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_query text := lower(trim(both '@' from btrim(coalesce(p_query, ''))));
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if length(v_query) < 3 or length(v_query) > 80 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(orca_private.person_json(p::public.social_profiles)) from (
    select sp.* from public.social_profiles sp where sp.user_id <> auth.uid() and (
      sp.handle = v_query or (sp.profile_visibility <> 'private' and
        (position(v_query in sp.handle) > 0 or position(v_query in lower(sp.display_name)) > 0))
    ) order by (sp.handle = v_query) desc, sp.handle limit 30
  ) p), '[]'::jsonb);
end;
$$;

create or replace function public.orca_connections()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'following', coalesce((select jsonb_agg(orca_private.person_json(p) order by p.handle)
      from public.social_profiles p join public.follows f on f.followed_user_id = p.user_id
      where f.follower_user_id = auth.uid()), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(orca_private.person_json(p) order by p.handle)
      from public.social_profiles p join public.follows f on f.follower_user_id = p.user_id
      where f.followed_user_id = auth.uid() and f.status = 'accepted'), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(orca_private.person_json(p) order by p.handle)
      from public.social_profiles p join public.follows f on f.follower_user_id = p.user_id
      where f.followed_user_id = auth.uid() and f.status = 'pending'), '[]'::jsonb)
  );
end;
$$;

create or replace function public.orca_follow(p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_visibility text; v_status text;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot follow yourself'; end if;
  -- Lock the profile so approval requirements cannot race a privacy change.
  select profile_visibility into v_visibility from public.social_profiles where user_id = p_user_id for share;
  if not found then raise exception 'Profile not found'; end if;
  if not exists(select 1 from public.social_profiles where user_id = auth.uid()) then
    raise exception 'Set up your social profile first';
  end if;
  insert into public.follows(follower_user_id, followed_user_id, status)
  values (auth.uid(), p_user_id, case when v_visibility = 'public' then 'accepted' else 'pending' end)
  on conflict(follower_user_id, followed_user_id) do nothing;
  select status into v_status from public.follows where follower_user_id = auth.uid() and followed_user_id = p_user_id;
  return v_status;
end;
$$;

create or replace function public.orca_unfollow(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  delete from public.follows where follower_user_id = auth.uid() and followed_user_id = p_user_id;
end;
$$;

create or replace function public.orca_respond_follow(p_user_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_accept then
    update public.follows set status = 'accepted', updated_at = now()
    where follower_user_id = p_user_id and followed_user_id = auth.uid() and status = 'pending';
  else
    delete from public.follows where follower_user_id = p_user_id and followed_user_id = auth.uid() and status = 'pending';
  end if;
end;
$$;

create or replace function public.orca_remove_follower(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  delete from public.follows where follower_user_id = p_user_id and followed_user_id = auth.uid();
end;
$$;

create or replace function public.orca_create_post(
  p_client_event_id text, p_text text, p_visibility text default 'friends', p_image_path text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.feed_events; v_text text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if not exists (select 1 from public.social_profiles where user_id = auth.uid()) then raise exception 'Set up your social profile first'; end if;
  if p_client_event_id is null or length(p_client_event_id) not between 1 and 240 then raise exception 'Invalid post identity'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || ':' || p_client_event_id, 0));
  if length(v_text) > 2000 or (v_text = '' and p_image_path is null) then raise exception 'Write up to 2000 characters or add a photo'; end if;
  if p_visibility is null or p_visibility not in ('private', 'friends', 'public') then raise exception 'Invalid post audience'; end if;
  if p_image_path is not null and (p_image_path !~ ('^' || auth.uid()::text || '/[^/]+\.(jpg|png|webp)$')
    or not exists (select 1 from storage.objects o where o.bucket_id = 'feed-images' and o.name = p_image_path)) then
    raise exception 'Upload your photo before posting';
  end if;
  if exists (select 1 from orca_private.deleted_feed_events where user_id = auth.uid() and client_event_id = p_client_event_id) then
    raise exception 'This post has been deleted';
  end if;
  insert into public.feed_events(user_id, event_type, client_event_id, summary_text, visibility, image_path, occurred_at)
  values (auth.uid(), 'user_post', p_client_event_id, v_text, p_visibility, p_image_path, now())
  on conflict (user_id, client_event_id) do nothing;
  select * into v_event from public.feed_events where user_id = auth.uid() and client_event_id = p_client_event_id;
  if v_event.event_type <> 'user_post' then raise exception 'Post identity already used'; end if;
  if v_event.summary_text <> v_text or v_event.visibility <> p_visibility
    or v_event.image_path is distinct from p_image_path then raise exception 'Post already published. Refresh your feed'; end if;
  return orca_private.feed_json(v_event);
end;
$$;

create or replace function public.orca_publish_pr(
  p_client_event_id text, p_workout_session_id text, p_exercise_name text,
  p_summary_text text, p_occurred_at timestamptz, p_visibility text default 'friends'
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if not exists (select 1 from public.social_profiles where user_id = auth.uid()) then raise exception 'Set up your social profile first'; end if;
  if p_client_event_id is null or length(p_client_event_id) not between 1 and 240
    or p_workout_session_id is null or length(p_workout_session_id) not between 1 and 240
    or p_exercise_name is null or length(btrim(p_exercise_name)) not between 1 and 200
    or p_summary_text is null or length(btrim(p_summary_text)) not between 1 and 2000
    or p_occurred_at is null or p_occurred_at > now() + interval '5 minutes' then raise exception 'Invalid PR summary'; end if;
  if p_visibility is null or p_visibility not in ('private', 'friends', 'public') then raise exception 'Invalid post audience'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || ':' || p_client_event_id, 0));
  if exists (select 1 from orca_private.deleted_feed_events where user_id = auth.uid() and client_event_id = p_client_event_id) then return false; end if;
  insert into public.feed_events(user_id, event_type, client_event_id, workout_session_local_id,
    exercise_name_snapshot, summary_text, visibility, occurred_at)
  values (auth.uid(), 'personal_record', p_client_event_id, p_workout_session_id,
    btrim(p_exercise_name), btrim(p_summary_text), p_visibility, p_occurred_at)
  on conflict (user_id, client_event_id) do nothing;
  return true;
end;
$$;

create or replace function public.orca_delete_post(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_image text; v_client_id text;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select client_event_id into v_client_id from public.feed_events where id = p_post_id and user_id = auth.uid();
  if v_client_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || ':' || v_client_id, 0));
  end if;
  delete from public.feed_events where id = p_post_id and user_id = auth.uid() returning image_path into v_image;
  -- A retry after an offline storage deletion still retrieves this owner's path.
  if v_image is null then
    select image_path into v_image from orca_private.deleted_feed_events
    where post_id = p_post_id and user_id = auth.uid();
  end if;
  return jsonb_build_object('image_path', v_image);
end;
$$;

-- Only the authenticated role can invoke the exposed, account-bound RPCs.
revoke all on function public.orca_feed(text, integer, timestamptz, uuid),
  public.orca_search_people(text), public.orca_connections(), public.orca_follow(uuid),
  public.orca_unfollow(uuid), public.orca_respond_follow(uuid, boolean), public.orca_remove_follower(uuid),
  public.orca_create_post(text, text, text, text), public.orca_publish_pr(text, text, text, text, timestamptz, text),
  public.orca_delete_post(uuid) from public, anon;
grant execute on function public.orca_feed(text, integer, timestamptz, uuid),
  public.orca_search_people(text), public.orca_connections(), public.orca_follow(uuid),
  public.orca_unfollow(uuid), public.orca_respond_follow(uuid, boolean), public.orca_remove_follower(uuid),
  public.orca_create_post(text, text, text, text), public.orca_publish_pr(text, text, text, text, timestamptz, text),
  public.orca_delete_post(uuid) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('feed-images', 'feed-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function orca_private.can_view_feed_image(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    (storage.foldername(p_path))[1] = (select auth.uid())::text
    or exists (select 1 from public.feed_events e where e.image_path = p_path
      and orca_private.can_view_feed(e.user_id, e.visibility))
  );
$$;
revoke all on function orca_private.can_view_feed_image(text) from public, anon;
grant execute on function orca_private.can_view_feed_image(text) to authenticated;
drop policy if exists "Feed images follow visible posts" on storage.objects;
drop policy if exists "Owners upload feed images" on storage.objects;
drop policy if exists "Owners remove feed images" on storage.objects;
create policy "Feed images follow visible posts" on storage.objects for select to authenticated
using (bucket_id = 'feed-images' and orca_private.can_view_feed_image(name));
create policy "Owners upload feed images" on storage.objects for insert to authenticated
with check (bucket_id = 'feed-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners remove feed images" on storage.objects for delete to authenticated
using (bucket_id = 'feed-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No update policy: an attached photo cannot be replaced after publication.

commit;
