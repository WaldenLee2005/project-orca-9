# Architecture

## Stack Decision

Use React Native with Expo so the app can support both iOS and Android from one codebase.

Recommended baseline:

- React Native
- Expo
- TypeScript
- Expo Router for navigation
- Local-first storage for the MVP
- Later backend sync with Supabase, Firebase, or another managed backend

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
      progress/
      programs/
      streaks/
      integrations/
    data/
    lib/
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
```

The current in-memory implementation stores one saved exercise row with aggregate sets/reps/weight. Persistence and per-set entries are still future work.

## Storage Strategy

For MVP:

- Use local storage first.
- Prefer a structured local database when workout history becomes non-trivial.
- Keep a repository/service boundary so storage can later be swapped or synced.

Likely options:

- Expo SQLite for structured local workout data.
- AsyncStorage only for small preferences and onboarding flags.

Later:

- Add account creation and cloud sync.
- Add backup/restore.
- Add cross-device continuity.

## UI Direction

The workout logger should avoid spreadsheet-like forms.

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
