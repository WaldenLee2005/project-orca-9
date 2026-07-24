# Architecture

## Stack Decision

Use React Native with Expo so the app can support both iOS and Android from one codebase.

Recommended baseline:

- React Native
- Expo
- TypeScript
- Expo Router for navigation
- Local-first storage for the MVP
- Later managed backend with Supabase for auth, friends, feed events, and optional sync

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

- The Session picker uses a curated subset of RepDB free-tier exercise stills.
- RepDB assets are stored locally under `apps/mobile/assets/repdb`.
- Catalog images are shown in the exercise selector only.
- Users can create a custom exercise by entering a name when the catalog does not include the movement.

### Workouts

Owns active workout logging, workout session state, set entries, exercise order, notes, and completed workout history.

Current Session flow:

- The bottom tab is labeled `Session`.
- `Start Session` opens an active session log.
- `Add Exercise` appears after already logged exercises and opens the exercise picker.
- Saving an exercise appends it to the active session log in chronological order.
- Logged rows show exercise name, save time, sets, reps, and weight.
- Saved rows support swipe-to-delete.
- Sets, reps, and weight use custom ruler controls with a fixed vertical marker.
- Weight supports 0.5 lb increments, with smaller half-pound ticks, medium 1 lb ticks, and large 5 lb ticks.

### Programs

Owns structured training plans such as Push Pull Legs, Upper Lower, and custom schedules.

### Streaks

Owns streak rules, including rest-day-aware streaks. A planned rest day should count as maintaining consistency instead of requiring a fake workout check-in.

### Progress

Owns charts and strength trends, including stock-chart-like visualizations of total lifting progress.

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
  exercises
  notes

WorkoutExercise
  id
  exerciseId
  customExerciseName?
  exerciseNameSnapshot
  order
  sets
  savedAt

SetEntry
  id
  weight
  reps
  setNumber
  completedAt

Program
  id
  name
  scheduleType
  days

ProgramDay
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

The current logger UI captures one saved exercise row with aggregate sets/reps/weight. SQLite persistence expands that aggregate into one `SetEntry` row per set so later per-set editing and progress charts have a durable foundation.

## Storage Strategy

For MVP:

- Use local storage first.
- Use Expo SQLite as the structured local database for user profiles, workout sessions, workout exercises, and set entries.
- Keep user-generated workout data normalized and text/numeric only; do not store exercise image blobs in the user database.
- Keep a repository/service boundary so storage can later be swapped or synced.
- Run small SQLite compaction after deletes to limit local database growth over time.

Likely options:

- AsyncStorage only for small preferences and onboarding flags.

Later:

- Add Supabase for account creation, friend graph, feed events, and optional cloud sync.
- Add backup/restore.
- Add cross-device continuity.

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

Build shared core UI and business logic wherever possible.

Use platform-specific modules only when needed for:

- HealthKit on iOS.
- Health Connect or Google Fit on Android.
- Fitbit OAuth/API integration.
- App store specific permissions.
