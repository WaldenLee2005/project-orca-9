# Decision Log

## 2026-07-23: Use React Native with Expo

Decision: Build the app with React Native and Expo.

Reason:

- Supports both iOS and Android from one codebase.
- Good development speed for a solo or small-team app.
- Works well for tap-driven custom UI.
- Can add native health integrations later when needed.

Tradeoffs:

- HealthKit, Android Health Connect, Fitbit, and other integrations may require native modules or config plugins.
- Some deep platform-specific features may need custom native code later.

## 2026-07-23: Focus MVP on Weight Lifting

Decision: The MVP is specifically for weight lifting, not all fitness modes.

Reason:

- The clearest user pain is logging lifts without typing into spreadsheets.
- Weight, reps, and sets create a focused first interaction model.
- Program tracking and progress dashboards are natural extensions.

## 2026-07-23: Keep Onboarding Flexible

Decision: Use the planned onboarding structure as a placeholder, but expect it to change.

Reason:

- The core workout logging flow matters more than perfect onboarding at the start.
- Product requirements may evolve after testing the logging experience.

## 2026-07-23: Rest Days Should Count Toward Consistency

Decision: Streak logic must support planned rest days.

Reason:

- Users should not need to falsely check off a workout to preserve a streak.
- Fitness consistency includes recovery.
- Program-aware streaks are more honest and motivating.

## 2026-07-23: Defer Health and Food Integrations

Decision: Integrations are important but should come after the core app works locally.

Reason:

- Apple Health, Fitbit, Health Connect, and food tracker integrations add permission, privacy, and API complexity.
- The app must first prove its core lifting tracker is useful.

## 2026-07-23: Use RepDB Free-Tier Stills For MVP Exercise Images

Decision: Use the RepDB free-tier exercise dataset and flat WebP stills locally for the MVP exercise selector.

Reason:

- The assets are licensed for commercial in-app use with attribution.
- Local files keep the app independent of remote image loading.
- The free set is enough to validate the exercise picker and logging flow.

Tradeoffs:

- The free images are flat stills, not the paid classic/3D animated style.
- The paid bundle may be purchased later for more polished assets and animations.
- RepDB attribution must remain visible in the project/app credits.

## 2026-07-23: Session Tab Owns Active Workout Logging

Decision: The primary workout tab is labeled Session and starts an active session log before exercise selection.

Reason:

- This matches how a user works out: start session, add exercises as they happen, save each entry in order.
- The chronological list makes the current workout visible without waiting for a final summary.

## 2026-07-23: Use Custom Ruler Controls For Sets, Reps, And Weight

Decision: Use custom horizontal ruler controls with a fixed marker instead of text inputs or spreadsheet-like fields.

Reason:

- The interaction is thumb-friendly and fast during a workout.
- Weight can support 0.5 lb increments while still feeling tactile.
- The same control pattern works for sets, reps, and weight.

## 2026-07-23: Allow Custom Exercises During Session Logging

Decision: Users can add a custom exercise name from the exercise picker when a movement is not in the catalog.

Reason:

- The catalog will never cover every gym variation at first.
- A custom name lets users continue logging without breaking session flow.

## 2026-07-23: Git Action Wording Must Not Mention codex

Decision: Branch names, commit messages, pull request titles, pull request descriptions, and push-related messages should not mention codex anywhere.

Reason:

- Repository history and GitHub-visible workflow text should stay product-focused.
- Automation/tooling details should not leak into git metadata.

## 2026-07-23: Store MVP User Data Local-First In SQLite

Decision: Store user profiles, workout sessions, workout exercises, and set entries on the user's phone with Expo SQLite before adding cloud sync.

Reason:

- Workout logging must work quickly and offline in the gym.
- Local-first storage is free and avoids forcing accounts during MVP testing.
- SQLite is structured enough for workout history and progress queries.
- A repository boundary keeps future Supabase sync possible without rewriting UI flows.

Storage-size guardrails:

- Store exercise image assets as bundled catalog files, not user database blobs.
- Store only compact text, ids, timestamps, and numeric set values in SQLite.
- Run lightweight SQLite compaction after deletes.

Tradeoffs:

- Users do not yet get cross-device continuity or cloud backup.
- Later sync must handle local IDs, conflict rules, and account ownership.

## 2026-07-23: Use Supabase For Future Social Features

Decision: Use Supabase as the planned managed backend for accounts, friends, feed events, and optional cross-device sync.

Reason:

- Social features require shared cloud state; phone-only SQLite cannot power friend lists or feeds across users.
- Supabase provides auth, Postgres, Row Level Security, realtime options, and edge functions without running a custom server.
- The app can keep fast local workout logging while publishing only selected social summaries.

Scope:

- Store public/social profiles, friend requests, friendships, privacy settings, PR events, and completed-session summary events in Supabase.
- Keep full workout history local-first unless the user opts into backup/sync.
- Prefer compact derived feed rows over uploading all raw set data for social display.
- Use email/password auth first.
- Require unique `@handles`; handles are locked after account creation for stable friend/feed identity.
- Allow display names and uploaded profile pictures.
- Default profiles to private, with settings to move to friends-only or public.

Tradeoffs:

- Social accounts introduce privacy, moderation, and data-deletion responsibilities.
- Supabase schema and RLS policies must be designed before enabling friend-visible data.
- A custom server may still be needed later for subscriptions, sensitive API integrations, or complex background processing.
