create table if not exists public.social_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  display_name text not null,
  avatar_url text,
  profile_visibility text not null default 'private'
    check (profile_visibility in ('private', 'friends', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profiles_handle_format
    check (handle ~ '^[a-z0-9_]{3,24}$')
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  addressee_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self_friend
    check (requester_user_id <> addressee_user_id),
  constraint friendships_unique_pair
    unique (requester_user_id, addressee_user_id)
);

create table if not exists public.feed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null
    check (event_type in ('personal_record', 'completed_session', 'weekly_consistency')),
  workout_session_local_id text,
  exercise_name_snapshot text,
  summary_text text not null,
  visibility text not null default 'friends'
    check (visibility in ('private', 'friends', 'public')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.social_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.feed_events enable row level security;

create policy "Authenticated users can view non-private social profiles."
on public.social_profiles for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    profile_visibility in ('friends', 'public')
    or user_id = (select auth.uid())
  )
);

create policy "Users can insert their own social profile."
on public.social_profiles for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update their own social profile."
on public.social_profiles for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can view friendship rows that involve them."
on public.friendships for select
to authenticated
using (
  requester_user_id = (select auth.uid())
  or addressee_user_id = (select auth.uid())
);

create policy "Users can send their own friend requests."
on public.friendships for insert
to authenticated
with check (requester_user_id = (select auth.uid()));

create policy "Users can update friendship rows that involve them."
on public.friendships for update
to authenticated
using (
  requester_user_id = (select auth.uid())
  or addressee_user_id = (select auth.uid())
)
with check (
  requester_user_id = (select auth.uid())
  or addressee_user_id = (select auth.uid())
);

create policy "Users can delete friendship rows that involve them."
on public.friendships for delete
to authenticated
using (
  requester_user_id = (select auth.uid())
  or addressee_user_id = (select auth.uid())
);

create policy "Users can view their own feed events."
on public.feed_events for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create their own feed events."
on public.feed_events for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can delete their own feed events."
on public.feed_events for delete
to authenticated
using (user_id = (select auth.uid()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Avatar images are publicly readable."
on storage.objects for select
to anon, authenticated
using (bucket_id = 'avatars');

create policy "Users can upload their own avatar."
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update their own avatar."
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
