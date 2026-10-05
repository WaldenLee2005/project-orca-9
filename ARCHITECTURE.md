# Architecture

## Stack Decision

Use React Native with Expo so the app can support both iOS and Android from one codebase.

Recommended baseline:

- React Native
- Expo
- TypeScript
- Expo Router for navigation
- Local-first storage for the MVP
- Supabase auth/profile foundation implemented; friends/feed and optional account-owned reconnect sync planned for v1

## Visual System

- The Native visual system lives in `src/theme/designSystem.ts`: blue actions, system typography, flat grouped surfaces, and semantic text/field colors for both light and dark appearances. `ThemeProvider` follows the device appearance and updates the status bar.
- `createThemedStyles` builds both style sheets once; components select them with `useThemeStyles`. Shared `ui.group`, `ui.control`, `ui.input`, and `ui.primary` surfaces have no decorative shadows or glow. Explicit selected and keyboard-focus states remain visible.
- Root safe areas and bounded content widths support phone and tablet/web layouts. The edge-to-edge bottom bar occupies layout space, includes the bottom safe-area inset, and hides for the keyboard; screen content needs no floating-bar spacer.
- `ScreenHeading` unifies screen hierarchy; `StreakCard` presents actual local activity for the current week, including rest days. No activity is fabricated for decoration.
- Programs shows compact saved/starter cards opening a read-only overview of every day, with Activate and Edit actions. Themed schedule, target, import and coaching editors open explicitly. Starter activation saves a fresh copy after confirmation; browsing never writes to the library.
- Palette tests enforce at least 4.5:1 contrast for normal text and selected controls in both appearances, including grouped surfaces and input fields. This visual update does not modify data schemas, auth behavior, or coaching rules.

## App Shape

The app should be organized by feature modules, not by generic technical layers alone.

Current structure:

```text
apps/mobile/
  app/
    _layout.tsx
    index.tsx
    onboarding/
    (tabs)/
      workouts.tsx
      exercises.tsx
      programs.tsx
      progress.tsx
      profile.tsx
  assets/
    repdb/
      exercises.json
      LICENSE-DATA.md
      ATTRIBUTION.md
      images/flat/
  src/
    components/
    features/
      onboarding/
      workouts/
        repdbSessionExercises.ts
      exercises/
      social/
      progress/
      programs/
      streaks/
      reminders/
      integrations/
    data/
    lib/
      supabase.ts
    storage/
    theme/
    types/
```

## Feature Modules

### Onboarding

Captures basic user preferences and goals. Keep the implementation flexible because onboarding is likely to change.

### Exercises

Owns the exercise library, muscle groups, equipment metadata, and exercise selection UI.

Current notes:

- The Exercises tab and Session picker share a virtualized, searchable browser for all 400 bundled RepDB free-tier exercises.
- Search is local, token-based, and matches names, muscles, equipment, and common abbreviations; muscle-group and equipment filters combine with the query.
- The static `repdbImages.ts` map bundles free-tier stills for offline use. The supplied license and visible RepDB attribution are retained; no paid preview animations are used.
- RepDB assets are stored locally under `apps/mobile/assets/repdb`.
- Catalog images appear in the browser, exercise details, and chart lift picker. Exercise details expose the bundled instructions and can open the selected lift in an existing or new local session.
- Users can create a custom exercise by entering a name when the catalog does not include the movement.

### Workouts

Owns active workout logging, workout session state, set entries, exercise order, notes, and completed workout history.

Current Session flow:

- The bottom tab is labeled `Session`.
- `Start Session` opens or resumes an active session log via `createWorkoutSession({ followActiveProgram: true })`. New sessions resolve the active program and current local weekday/cycle day in storage, snapshot its exercises if it is a training day, and otherwise start unplanned. Explicit day launches remain separate. Creation finishes before logging opens; read/write failures stay on the start screen with a retryable error instead of silently dropping the plan.
- `Add Exercise` appears after already logged exercises and opens the exercise picker.
- Saving an exercise appends it to the active session log in chronological order.
- Save Session marks the workout session completed after at least one exercise has been logged.
- Exit session cancels only empty unfinished sessions; sessions with logged results pause and resume from Today. A shared workout mutation queue and conditional storage deletion protect results during concurrent saves. No schema or training-history reset is involved.
- The start screen shows recent completed sessions below Start Session with exercise count, set count, and total volume.
- Recent sessions expand to actual exercises/sets with optional private note editing. `SavedSetNotes` also provides review/edit/clear in the active log; collapsed sections retain unsaved note drafts.
- Logged rows show exercise name, save time, sets, reps, and weight.
- Saved rows support swipe-to-delete.
- The current logger uses per-set numeric fields/steppers for actual weight, reps or duration, with optional effort/warm-up flags and a collapsed note-to-self editor. Add/copy/remove controls keep fast logging possible without notes.
- Native schema 9 adds nullable `set_entries.note` without resetting schema-6/7/8 data. Web stores optional `WorkoutSet.note` under the existing key/marker. Notes are trimmed, bounded to 1,000 characters and blank notes become null. Serialized single-set updates preserve measurements and work for active/completed sessions; coaching inputs exclude private note text.

### Programs

Owns locally saved, user-created multi-day programs with weekly/cycle schedules.

- `starterPrograms.ts` defines three offline, moderate-volume templates using stable RepDB IDs. Its pure factory resolves current catalog names and generates fresh day/exercise IDs and nested targets for each copy. Starter cards open the shared read-only overview; Activate saves and activates a copy after confirmation, while Edit opens the ordinary builder and Save persists a new copy inactive. No migration, auto-seeding or load guesses are involved. FBEOD is a rolling 4-day cycle, not a weekly reset. Regression tests cover real catalog membership, direct-muscle frequency/volume, cloning, rest protection and missed-training-day streak breaks in both storage implementations.

- `programModel.ts` defines ordered, uniquely identified exercises with set counts and discriminated per-set targets: exact reps, rep ranges, or integer-second durations. Shared validation/formatting, immutable reorder helpers, and workout snapshots preserve the distinction between prescriptions and actual results. Storage readers upgrade exact-rep fields in the current scheduled format only.
- `ProgramsScreen` supports create/edit/delete confirmation and multi-add search through the existing RepDB library. `ProgramExerciseList` uses measured rows, drag handles, edge auto-scroll, and accessible move buttons; duplicate lifts remain separate entries.
- `programsRepository.ts` atomically stores the multi-day library and dated active-schedule revisions in a single SQLite `program_library` row or web `orca9.programLibrary.v3` value, with serialized writes. Invalid current data is reported, never silently overwritten. There is no legacy program parsing or fallback.
- Database v6 is a user-requested prelaunch reset: versions below 6 transactionally drop/recreate training tables, remove the obsolete `training_programs` table, and preserve `user_profiles`. The web `trainingStorage.ts` initializer removes only known training keys, then records `orca9.trainingSchemaVersion = 6`. Concurrent reads/writes await that one initializer, failed resets can retry, and future launches preserve new training data. Auth keys and `.env` are untouched. This is a destructive prelaunch cutover, not a production data migration.
- Programs contain weekly or repeating-cycle schedules (1–28 calendar days), a start date, and ordered Training/Rest slots only; new slots default to Rest. Each training slot has its own exercises and targets. One active schedule generates rest dates from revisions, bounded by activation/start dates, the next revision, and today. Edits/stops/deletes affect today onward only. Civil-date arithmetic avoids DST drift.
- Starting a program snapshots its order and goals into an empty workout. Existing sessions are protected. Planned exercises prefill the logger but are counted only after actual results are saved; deleting/editing a template cannot change an active workout snapshot.
- Programs presents the active schedule and today's training/rest slot first, with explicit activation, switch and deactivation. Session can bypass the selected plan for one manual workout without changing schedule revisions. Programs/Session subscribe to the same successful `trainingChanges` writes as reminders and guard against stale reads; focus/resume/date rollover keep today's slot current. Deactivation returns new sessions and enabled reminders to ordinary tracking while retaining past scheduled rest and unfinished workout snapshots.
- Database v7 adds nullable `set_entries.duration_seconds` transactionally for existing v6 installs, without repeating the prelaunch reset. Web stores optional `durationSeconds` alongside actual set results. Timed sets have zero reps, are excluded from all rep-based chart queries, and contribute actual timed-work totals to history. Reps/duration/weight are validated before writes; logged values apply to every set in an entry.

### Streaks

Owns streak rules, including rest-day-aware streaks. A planned rest day should count as maintaining consistency instead of requiring a fake workout check-in.

`calculateStreakSummary` also returns `currentActiveDays` and `currentRestDays` for the muted streak subtitle. It classifies each distinct date in the current streak once, prioritizing completed workouts over overlapping manual/scheduled rest. These counts sum to `currentStreak`; older broken runs and future dates are excluded.

### Reminders

- `reminderPlan.ts` derives at most 56 notices over 28 local dates from completed-session timestamps, manual rest and dated schedule revisions. It uses a circular average of the latest completion per date over 28 days; training reminders precede that time by 15 minutes and follow it by 2 hours, bounded to the same day. Completed dates are skipped; rest dates get only their morning reminder. Future messages never assume future workouts or streak counts.
- `reminderService.ts` owns serialized preferences and scheduling; `reminderScheduler.ts` reconciles only Orca-owned notification IDs with a small persisted ledger to prevent repeated date/kind delivery. `reminderRepository.ts` reads current SQLite/web training records without a migration. `trainingChanges.ts` publishes successful workout/rest/program writes without making persistence depend on observers.
- The root `ReminderCoordinator` replenishes the plan on launch/resume, date/timezone changes while foregrounded, and training changes. Profile offers opt-in, permission recovery and adjustable fallback/rest times (6:00 PM/8:00 AM defaults). Preferences and history are device-local, shared with the existing guest/account logging model.
- Native `expo-notifications` schedules delivery with the OS and opens Session on taps. Web is unsupported. Open the app at least every 28 days to extend the horizon; no server, push-token registration or background JavaScript is required for already scheduled notices. Native rebuild/device verification is required, and Android delivery may be inexact because Orca requests no exact-alarm permission. See `apps/mobile/src/features/reminders/README.md`.

### Progress

Owns charts and strength trends, including stock-chart-like visualizations of total lifting progress.

- Restored the dashboard from `progress-dashboard-charts` without replacing the current auth, workout history, database, or streak implementation.
- PRs (estimated one-rep max), rep-weighted average weight, and volume read completed local sessions on web and native SQLite.
- Supports all lifts or an individual saved lift, 1M/3M/All ranges, focus refresh, and stale-request protection. No account is required.

### Integrations

Owns external integrations. This should be deferred until the core local lifting tracker works.

Possible future integrations:

- Apple Health / HealthKit
- Google Fit or Health Connect
- Fitbit
- Food trackers
- Nutrition APIs

### Social

Owns friends, sharing controls, and the activity feed. This requires a managed backend because friend data and feed events must be shared across devices and accounts.

Planned backend shape:

- Supabase Auth for user accounts.
- Supabase Postgres for public profiles, friendships, and compact feed events.
- Row Level Security so users can only see allowed friend data.
- Local SQLite remains the phone source of truth for full workout details.
- Only opt-in workout summaries and PR/feed events should be published by default.

Current auth/profile shape:

- Accounts are optional for the core app. Importing routes never initializes Supabase; missing configuration leaves workouts, history, and rest-day streaks usable.
- One lazily created Supabase SDK client owns AsyncStorage session persistence, token refresh, confirmation callbacks, and authenticated storage uploads. Legacy custom sessions migrate once into its project-scoped storage key.
- Email/password auth.
- Unique lowercase `@handle` values, 3-24 characters using letters, numbers, and underscores; handle changes are not exposed after creation.
- Display name and uploaded profile picture.
- Profile visibility defaults to `private`; users can switch to `friends` or `public` during onboarding/settings.
- Sign-up sends handle/display name/privacy as Supabase Auth metadata so confirmed-email accounts can repair missing social profile rows after first sign-in.
- Email confirmation redirects to the Expo Router `/auth/callback` route via the app scheme and stores the returned Supabase session.
- Mobile uses `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; never ship a service-role key.

## Initial Data Model

Draft entities:

```text
UserProfile
  id
  displayName
  goal
  experienceLevel
  availableEquipment
  preferredSchedule

Exercise
  id
  name
  primaryMuscles
  secondaryMuscles
  equipment
  instructions
  image?
  isCustom?

WorkoutSession
  id
  startedAt
  completedAt
  programDayId?
  programPlan? (immutable program/targets snapshot)
  exercises
  notes

WorkoutExercise
  id
  exerciseId
  customExerciseName?
  exerciseNameSnapshot
  programEntryId?
  order
  sets
  savedAt

SetEntry
  id
  weight
  reps
  setNumber
  completedAt
  note? (private, optional multiline text)

TrainingProgram
  id
  name
  exercises (ordered ProgramExercise array)
  createdAt
  updatedAt

ProgramExercise
  id (unique per occurrence, even for repeated lifts)
  exerciseId
  exerciseName
  sets
  repGoal

ProgramDay (planned)
  id
  name
  targetMuscles
  exerciseIds
  isRestDay

SocialProfile
  userId
  handle
  displayName
  avatarUrl?
  visibility

Friendship
  id
  requesterUserId
  addresseeUserId
  status
  createdAt

FeedEvent
  id
  userId
  eventType
  workoutSessionId?
  exerciseNameSnapshot?
  summaryText
  occurredAt
```

The current logger saves actual individual sets, including weight, reps or duration, optional effort/warm-up flags and private notes, as normalized `SetEntry` rows. Readers retain support for existing grouped web entries without inventing notes or effort.
Active session saves batch those set rows in a single SQLite insert and return the newly saved exercise from the write input, avoiding a full session re-read on every saved exercise. Save Session writes `completed_at` on the session row so future history and progress queries can use completed workouts as their source of truth.
Starting a session uses cached local profile state when available and does not block on profile lookup because `WorkoutSession.profile_id` is optional.

## Storage Strategy

For MVP:

- Use local storage first.
- Use Expo SQLite as the structured local database for user profiles, workout sessions, workout exercises, and set entries on native builds.
- Use AsyncStorage-backed workout persistence for the web development build because Expo SQLite can stall during browser initialization.
- Keep user-generated workout data normalized and text/numeric only; do not store exercise image blobs in the user database.
- Keep a repository/service boundary so storage can later be swapped or synced.
- Run small SQLite compaction after deletes to limit local database growth over time.
- Keep high-frequency workout writes batched and avoid unnecessary post-write reads in the active logging path.
- Treat `workout_sessions.completed_at` as the boundary between an active session and completed workout history.
- Treat local profile caching as a convenience layer for auth/social UX, not a required gate before login navigation or session creation.
- Reset the shared SQLite open promise if database initialization times out, so primary flows can fail visibly and retry instead of waiting forever.

Likely options:

- AsyncStorage only for small preferences and onboarding flags.

Planned for the January 4, 2027 release:

- Finish hosted/account readiness, friends/feed publishing and optional account-owned reconnect sync. Define ownership, queue/retry/conflict rules and the new metadata contracts before implementation; these capabilities are not yet verified or shipped.
- Preserve guest offline logging and local persistence. Sharing compact feed events requires explicit opt-in; private notes and raw logs are not social content.

Later:

- Optional export/backup/restore beyond reconnect sync.
- Further cross-device continuity.

## Backend Strategy

Use Supabase when implementing social features. Do not add a custom server until the app needs secret business logic, paid subscriptions, third-party API aggregation, or background jobs that cannot run safely on the client or in Supabase policies/functions.

Social feed storage should stay compact:

- Publish derived events instead of uploading every raw workout set.
- Store PRs and session summaries as small rows.
- Keep detailed workout history in local SQLite unless the user opts into backup/sync.
- Add privacy settings before publishing any friend-visible workout data.

Supabase setup currently lives in `supabase/social-schema.sql` and `supabase/avatar-storage.sql`; both must be run in the project SQL editor before cloud social profile writes and avatar uploads will work.

## UI Direction

The workout logger should avoid spreadsheet-like forms.

## Dev Diagnostics

Dev-only diagnostics are enabled by `npm run dev`, which sets `EXPO_PUBLIC_ORCA_DEV_MODE=1` before starting Expo. Normal `start`, `ios`, `android`, and `web` scripts do not expose the diagnostics UI.

The app root mounts `DevDiagnosticsRoot` only when that flag is present. It provides an app-wide overlay for render/runtime failures, console warnings/errors, and tracked async operations that may be stuck. The overlay can copy a complete plain-text diagnostics snapshot for easier debugging. Feature code can use `trackDevOperation` for storage, auth, sync, or other slow startup paths that need visible debugging in development.

Preferred interaction patterns:

- Start an active session before logging.
- Tap Add Exercise to choose a movement.
- Show exercise images in the selector, not on the logging screen.
- Allow custom exercise names for missing catalog movements.
- Use horizontal ruler controls with a fixed marker for weight, reps, and sets.
- Use large touch targets.
- Log saved exercises in chronological order.
- Use swipe-to-delete for saved exercise rows.
- Minimal typing during workouts.

The progress dashboard can borrow the feel of a stock chart:

- Trend line over time.
- Time ranges such as 1W, 1M, 3M, 6M, 1Y, All.
- Metrics such as total volume, estimated one-rep max, personal records, and completion rate.

## Cross-Platform Notes

### Program import boundary

`ProgramImportScreen` keeps source text/images and corrections in memory. `importProgram.ts` is a pure bounded parser with unique normalized RepDB matches; ambiguous names and missing/unsupported targets require user correction. Platform-specific OCR adapters use Tesseract.js workers on web and the local `modules/orca-ocr` Expo bridge (Apple Vision / bundled Latin ML Kit) on native. Browser OCR assets come from versioned jsDelivr URLs; source images are not uploaded. Native module lookup is optional so Expo Go continues to support text imports without crashing.

The only persistence handoff is a reviewed `ProgramDraft` into the existing builder and program repository. Fresh IDs, normal validation, and explicit schedule/rest confirmation precede saving. Import code does not call workout, streak, activation, Supabase or sync repositories. No schema change or reset is needed.

Build shared core UI and business logic wherever possible.

Use platform-specific modules only when needed for:

- HealthKit on iOS.
- Health Connect or Google Fit on Android.
- Fitbit OAuth/API integration.
- App store specific permissions.
