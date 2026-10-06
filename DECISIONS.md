# Decision Log

## 2026-10-05: Retire A Completed Program Day Until Tomorrow

Decision: A nonempty workout completed on the current local date satisfies the program/day IDs in its saved plan snapshot. Show **Completed today**, remove that day's planned exercise preview and repeat launch actions, and offer **Start an extra workout** as manual tracking. Recheck stored completion when creating a session; unfinished workouts still resume intact. The active program and calendar-based schedule remain unchanged.

Paused, empty, cancelled, manual and other program/day workouts do not satisfy the day. Saving a partial planned workout still completes its day under the existing Save Session rule. A new local date makes the scheduled day eligible normally; no automatic cycle advance, migration or history reset is needed.

Reason: After saving today's program workout, Session should stop presenting the same plan as unfinished work while still allowing an additional workout.

## 2026-10-05: Start Weight Entry At The Last Saved Working Set

Decision: Use the exact weight of the newest saved exercise entry's final eligible working rep set as the default, including saved actual work in unfinished sessions. Keep completed-workout recent averages as an explicit shortcut. Resolve repeat entries by save time and persisted exercise order; do not expire the last saved weight after 90 days or cap its feed at 120 recent sessions.

Last saved work replaces untouched program starting loads. Manual interaction—including opening exact entry, confirming the same number, clearing or copying—takes precedence over late reads. Warm-ups/timed work and incompatible load context remain excluded. Coaching still reads completed work only; storage and historical results are unchanged.

Reason: The requested starting point is the last value used for that exercise. Reusing it avoids long swipes from zero. Exact decimal/zero values remain intact until the user chooses a new tick.

## 2026-10-05: Keep Continuous Weight Drags Active Across Controlled Updates

Decision: Reconcile externally controlled weight changes in a synchronous layout effect. Keep live tick commits and release snapping, while placing recent-weight/copy controls below set rows and disabling browser scroll anchoring on the web logger so footer changes cannot shift a scale during a gesture.

Reason: A previous tick's delayed passive effect could compare against a newer emitted tick and falsely cancel the drag. Existing tests flushed effects immediately and missed that ordering. Native regressions now interleave delayed effects with successive moves; phone checks hold a finger down through movement, pauses and reversals. Storage, recent averages and exact-entry behavior are unchanged.

## 2026-10-05: Retain Touch Selections And Start Weight Entry Near Recent Actual Work

Decision: Capture horizontal ruler gestures before scrolling, retain the initial displacement that React Native resets on grant, and preserve selected ticks through interruption. Add ±5/±10 lb controls while keeping 0.5 lb snapping.

Prefill only untouched blank weights using the rep-weighted working-set average from the last three eligible completed workouts for the exercise within 90 local days. Exclude warm-ups, timed/invalid/future results and incompatible known load settings. Prescribed/manual values and explicit clearing take precedence; asynchronous reads never replace them. The average is shown and editable with coaching off or on. Custom exercise names identify repeat lifts because their per-entry IDs vary; catalog IDs remain exact. Without history, enter a first weight and optionally copy it to empty sets. No invented starting load, history changes or schema upgrade.

Reason: Reported touch swipes returned to 0/Select weight, and starting every lift at zero made heavy-weight entry cumbersome. Recent actual work gives a useful starting point while preserving exact historical data and manual control.

## 2026-10-05: Simplify Session Coaching And Make Weight Entry Tactile

Decision: Replace exercise-specific load-coaching setup with a saved program on/off default and a persisted session override. Preserve existing load/equipment metadata and training records. Off hides the session's coaching controls; on still requires review before applying changes. Without explicit load context, the prototype may suggest fewer sets while retaining individual manual weights; it never guesses loads or equipment steps.

Use a horizontal ruler inside each weight box, snapping to 0.5 lb with increasingly large marks at 1, 5 and 10 lb, a fixed marker and native tick haptics. Keep exact decimal entry and accessible adjustment, and preserve off-grid existing weights until the user changes them. Effort uses one compact optional segmented row. Native schema 10 adds only a nullable session coaching flag; existing notes, results, profiles and schedules survive.

Reason: The requested gym flow should need fewer setup controls and less typing. Device haptic feel still needs physical-device acceptance; existing coaching review/release gates remain.

## 2026-10-04: Make Notes To Self Optional For Each Actual Set

Decision: Add a collapsed note editor to every rep or timed set, with up to 1,000 characters of private multiline text. Review/add/edit/clear saved notes in the active log and recent-session details. Blank notes become null; copying measurements does not copy a note. Coaching apply/undo preserves draft notes, while coaching history excludes their text.

Reason: The user wants a note for each recorded set without slowing or blocking normal logging. Native schema 9 adds a nullable column and preserves existing training/profile data; web retains its current storage key and training marker. Notes remain device-local with existing guest/account behavior and are not social content. Session-level notes and native device acceptance remain separate roadmap work.

## 2026-10-01: Use Opt-In Adaptive Local Workout Reminders

Decision: Schedule notifications on the device from actual session-completion times and existing rest schedules. Profile controls opt-in plus the starting workout/rest times, defaulting to 6:00 PM/8:00 AM. Learning uses one latest completion per local date over 28 days and a circular time average. Training reminders occur 15 minutes before and 2 hours after that average, clamped to the same date; completed days are suppressed and rest days receive only a morning notice.

Reason: Workout logging already works offline without an account. Reusing its local history preserves that model and avoids a push backend, tokens, fabricated activity or account-dependent reminders. Only today's message can quote the known streak; future messages remain general.

Tradeoffs: The app schedules a rolling 28-day horizon (at most 56 notices), replenished on launch/resume, foreground date/timezone changes and training writes. Users must reopen it at least every 28 days. Already scheduled delivery does not depend on background JavaScript. An existing native app needs rebuilding and system notification permission; web is unsupported. Android exact-alarm permission is intentionally omitted, so the OS may delay delivery. Native permission/delivery tests remain pending. See `apps/mobile/src/features/reminders/README.md` for platform evidence and verification.

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

## 2026-07-24: Gate App Diagnostics Behind npm run dev

Decision: Development diagnostics are only enabled by `npm run dev`, which sets `EXPO_PUBLIC_ORCA_DEV_MODE=1` for the Expo process.

Reason:

- Failures and stuck async work should be visible while building without leaking a debug surface into ordinary app starts.
- The diagnostics layer should be app-wide so errors can be inspected from any screen.
- Feature modules can opt into richer stuck-state reporting by wrapping important async work with `trackDevOperation`.

## 2026-07-24: Keep Active Session Writes Small And Observable

Decision: Saving an exercise should batch set-entry inserts and return the saved row from known values instead of re-reading the whole active session.

Reason:

- Gym logging should feel immediate even when dev diagnostics are enabled.
- One native SQLite call for set rows is cheaper than one call per set.
- Dev diagnostics now retain only recent completed operations and report slow operation timings so the overlay does not become a source of storage latency.

## 2026-07-24: Do Not Block Primary Flows On Local Profile Cache Reads

Decision: Login/session flows should use in-memory profile/auth state first and move local cache reads or repairs off the primary interaction path.

Reason:

- Supabase auth may finish quickly while post-auth avatar, social profile, or SQLite cache work is still slow.
- Starting a workout session should not wait on a local profile lookup; `profile_id` is optional for local sessions.
- The local profile repository keeps a small in-memory cache so repeated profile/session reads avoid unnecessary SQLite calls.

## 2026-07-24: Completed Sessions Power Workout History And Progress

Decision: Save Session should mark a workout session completed in SQLite by setting `workout_sessions.completed_at`; progress charts and history should read from completed session, exercise, and set rows instead of a separate tracking store.

Reason:

- The logger already writes normalized exercise and set data during the workout.
- A completion timestamp cleanly separates active sessions from workout history.
- Reusing the local-first workout tables keeps the future progress dashboard simple and avoids duplicate data.

## 2026-07-24: SQLite Initialization Should Fail Visibly And Retry

Decision: The shared SQLite open/migration promise should time out and reset if initialization stalls, and workout completion should prevent duplicate in-flight saves.

Reason:

- A stuck database open can otherwise leave active-session load, session creation, and session completion pending indefinitely.
- Resetting the shared promise lets the next user action retry database initialization.
- Disabling Save Session while it is in flight prevents duplicate completion operations and noisy diagnostics.

## 2026-07-24: Use AsyncStorage For Web Workout Persistence

Decision: The web development build should persist workout sessions with AsyncStorage while native builds continue using Expo SQLite.

Reason:

- Expo SQLite can stall during browser initialization in the current dev build.
- The workout loop still needs to be testable on web without pending storage operations.
- Native remains the production persistence target for normalized workout/session/set tables.

## 2026-10-04: Include All Requested Features And Start Beta Early

Decision: Plan the January 4, 2027 first release with vacation routines from available equipment, private notes, recaps, a friends feed, music metadata, supplements, offline reconnect sync, workout time and a rest timer. Core-flow beta starts November 2 while feature work continues; the nine additions target implementation completion November 29, acceptance/freeze December 6 and full-feature beta December 7–20. These are planning targets, with device, coaching-review and store gates still required.

Reason: The user wants all nine at launch and permits beta before the complete feature set is ready. Move account/hosted readiness earlier for sync/feed and add features to beta only as their checks pass. Music starts with manual song/playlist metadata; vacation uses reviewed catalog-based temporary routines. External integrations and hosted AI remain later work. Use a branching interactive chart in the Notion hub, with hover details and links to the underlying task pages.
