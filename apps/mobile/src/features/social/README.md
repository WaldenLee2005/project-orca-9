# Social

Optional accounts, profile privacy, following, text/photo posts, and automatic PR sharing. Implementation is present; hosted SQL/Storage acceptance and installed iOS/Android checks remain required before release.

## Accounts

- Lazy Supabase setup keeps guest workouts, history, programs, and streaks available without an account or cloud configuration.
- The SDK owns AsyncStorage sessions, access/foreground refresh, confirmation callbacks, and the one-time migration from legacy `orca9.auth.session`. Do not introduce another token cache.
- Email/password onboarding creates a unique handle, display name, optional avatar, and a profile that defaults to private. Settings keep the handle immutable in the app.
- Sign out from Profile preserves local workout/rest data. Social mutations use the current SDK account rather than the device's cached local profile, and stale feed responses are rejected after account changes.
- Profile avatars retain the existing public `avatars` bucket behavior. Feed photos use a separate private bucket.

## Feed and following

- Feed has **Following** (your posts plus accepted followed accounts) and **Your posts**, with pull-to-refresh and timestamp/ID cursor pagination.
- Post up to 2,000 characters, one photo, or both. JPEG, PNG, and WebP photos are checked for file signature and decoded size, capped at 5 MiB. Manual posts require an explicit submit and default to Followers.
- **Post publicly** switches each created text/photo post between Public and Followers. Only me remains available separately. Public posts require a public profile to reach other signed-in accounts; the feed explains this and links to profile privacy settings without changing them automatically.
- **People** searches handles, shows following/followers and pending requests, and supports follow, cancel request, approve/decline, unfollow, and remove follower. Following is directional; it does not create a mutual friendship.
- Public profiles accept new follows immediately. Private and friends profiles require the followed account to approve. Self-follow is rejected and requesters cannot approve themselves.
- Private profiles can be found by exact handle; friends/public profiles also allow broader handle/display-name search. Discovery returns basic profile cards, never email or workout details.
- Owners can delete posts without deleting local workout history. Server deletion tombstones prevent an old PR retry from recreating a deleted event.

Profile privacy and post audience are separate:

| Post audience | Owner | Accepted follower | Other signed-in account |
| --- | --- | --- | --- |
| Only me (`private`) | Yes | No | No |
| Followers (`friends`) | Yes | Yes | No |
| Public (`public`) | Yes | Yes | Only while the profile is public |

A private profile controls discovery and follow approval; approved followers can read explicitly shared follower/public posts. Changing a profile to private hides existing public posts from other accounts while retaining approved followers. Anonymous feed access is disabled.

`feedClient.ts` provides a testable HTTP boundary; `feedRepository.ts` binds it to the existing SDK session. Account-bound SQL RPCs validate writes; row policies enforce reads independently of the UI. The additive following schema leaves existing friendship/profile/feed data intact.

## Automatic PR sharing

- Sharing defaults **off**, with a Followers audience. The **Post PRs publicly** switch stays visible while sharing is off so the audience can be chosen before enabling. Selecting Public or Followers does not enable sharing; Only me stays available, including previously saved preferences. Controls wait for saved preferences to load. Enabling starts with future workouts: an already-started or historical workout is not adopted for sharing.
- PR audience preferences persist per account on this device and apply to future and unsent queued events. Published posts keep their original audience; a request already sent may finish with its original audience.
- `getSocialPersonalRecordHistory` reads complete local rep-set history. `prPublishingModel.ts` finds strict increases in actual heaviest weight per lift, including warm-ups and any valid rep count, retaining exact decimals and source reps. Timed, invalid, and future work are excluded; repeated entries produce one best record per session/lift.
- Earlier local history establishes the baseline without being published. A workout must start and finish inside the same account/consent window; guest work and a different account's paused session are not adopted.
- Only compact lift/weight/reps/previous-record summaries are uploaded. Private notes, programs, raw workout logs, and coaching data are not social payloads.
- `prPublishingService.ts` persists account-specific preferences, consent windows, pending events, and settled IDs in AsyncStorage before sending. Stable event IDs plus server uniqueness make uncertain/offline retries safe. Local state writes are serialized; cloud requests release that queue so preference reads and opt-out remain responsive. Disabling cancels queued intentions; re-enabling starts a fresh window. A request already sent may finish, and existing published posts remain until deleted.
- `SocialFeedCoordinator` retries on app start/resume, auth transitions, and successful training changes; Feed also has a manual retry. Publishing never blocks or determines whether the local workout save succeeds.

## Photos and deletion

- The `feed-images` bucket is private, with owner-scoped immutable uploads. A signed-in viewer may mint a photo URL only when they can read its post; unpublished/orphan photos remain owner-only.
- Signed photo URLs last 60 seconds. Removal or privacy/follow changes stop new authorized reads immediately; an already-issued URL can remain usable until expiration. Refresh the feed to renew expired URLs. Already-downloaded content cannot be recalled.
- Delete the post row first, then its stored photo. Failed storage cleanup is reported separately; the shared post stays deleted. **Retry photo cleanup** uses the server tombstone to recover the deleted post's photo path for its owner. The in-screen retry notice is not persisted across app restart. An uncertain/abandoned upload, or pending cleanup after losing that notice, can leave an owner-only orphan requiring storage maintenance.

## Backend setup

Run in the existing Supabase project's SQL editor, in this order:

1. `supabase/social-schema.sql` for the existing auth/profile foundation.
2. `supabase/avatar-storage.sql` for avatar policies.
3. `supabase/feed-following.sql` for additive following/feed RPCs, read policies, deletion tombstones, and the private photo bucket. This file is rerunnable and preserves existing data.

Apply the new following migration after the original schema on existing installations; do not reset training data or re-create the Supabase project. Add `projectorca9://auth/callback` to Auth redirect URLs for installed/dev-client email confirmation. Keep the mobile app on its publishable key; never ship a `service_role` key.

Local SQL files and policy tests do not prove hosted deployment. The hosted project was unreachable during this implementation's check, and the new migration has not been deployed. Real Supabase Storage endpoints and installed-device behavior still need the acceptance checks below.

## Verification and release checks

October 6 implementation and audience-control checks: TypeScript and all 383 app tests passed; iOS, Android and web exports built successfully. Phone-sized browser checks with synthetic accounts/transport covered posts, photos, follow controls, token-refresh draft retention and offline automatic PR retry; light/dark layouts, including the signed-out feed, were reviewed at 390/320 px. Audience checks covered Public/Followers text/photo payloads, preselection while PR sharing is off, reload/Only me preservation, future PR publication, unreadable preferences, and opt-out during delayed mount/mode refreshes. These checks preserve isolated workout history and do not establish hosted or physical-device readiness.

- From the repository root, run `npm --prefix apps/mobile run typecheck` and `npm --prefix apps/mobile test` with Node 24+. Auth tests use the actual SDK with simulated HTTP responses; feed/publisher tests exercise their injected transport/storage boundaries.
- `supabase/tests/feed-following.test.mjs` passed against local PostgreSQL through PGlite, with minimal Supabase auth/storage schemas. It checks migration reruns/data preservation, actual authenticated/anonymous roles and claims, approval ownership, audiences, photo policies, retry tombstones, and account deletion. Install `@electric-sql/pglite` into a temporary directory without adding it to app dependencies, then run from the repository root with Node 24+:

  ```sh
  ORCA_PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite/dist/index.js node --test supabase/tests/feed-following.test.mjs
  ```

  This local harness does not test hosted Supabase deployment, HTTP Storage endpoints, or simultaneous multi-connection races. Advisory-lock ordering was reviewed in the SQL; verify concurrent deletion/publication on the hosted project.
- Without cloud configuration, start Expo with `EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL= EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm start` from `apps/mobile`. Log a workout/rest day, reload, and confirm history/streaks and the guest Feed state remain usable.
- Hosted three-account check: A private account publishes follower, private, and public posts/photos. B cannot read before approval; after A approves, B reads only follower/public posts. C cannot read those posts/photos, self-approve B's request, change follow endpoints, or delete A's post. Remove B and verify future reads/URL issuance stop. Set A public and verify only public posts reach C. Repeat with direct authenticated REST/Storage calls, not only the UI.
- Hosted reliability check: submit the same post/PR ID twice, race deletion with PR retry, confirm deleted events stay deleted, verify storage cleanup failure/retry behavior, then delete a test auth account and confirm cascades succeed.
- Installed iOS/Android check: approve/cancel/remove follows; pick/cancel/deny photo permission; post/delete text and photos; test light/dark layouts, keyboard and pull-to-refresh. Disconnect before a PR save, restart/reconnect, and verify one post. Change accounts during upload/retry and confirm no cross-account content appears. Enabling during an active workout, signout, and disable/re-enable must not publish old sessions.
- Audience check: select Public with PR sharing off, reload, and confirm it remains off; enable and verify a future record uses Public. Hold a feed refresh, turn sharing off, release the response and change audience: sharing must stay off. Confirm existing Only me preferences and published post audiences stay intact, and Public does not silently change profile privacy.
- Auth device check: sign in, restart, leave backgrounded through token expiry, update Profile, then sign out and confirm local history remains intact.

Completed-session/weekly-summary publishing, reactions/comments, push notifications, training sync, and cross-device PR preferences remain outside this implementation.
