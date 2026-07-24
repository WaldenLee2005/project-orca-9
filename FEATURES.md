# Feature Inventory

## MVP Features

### Onboarding

Status: In progress.

Purpose: Capture enough information to personalize the app without slowing the user down.

Current fields:

- Display name.
- Email and password.
- Unique handle.
- Uploaded profile picture.
- Profile privacy setting.

Current capabilities:

- Save auth id, email, handle, display name, avatar URL, and privacy locally in SQLite.
- Reload saved profile basics on the Profile tab.

### Exercise Library

Status: In progress.

Purpose: Let users quickly find and select lifting exercises.

Current capabilities:

- Browse a curated catalog inside the Session exercise picker.
- View catalog exercises in a two-column grid.
- Show licensed RepDB still images in the selector.
- Add a custom exercise name when the catalog is missing a movement.
- Use catalog or custom exercises inside the workout logger.

Expected capabilities:

- Broader exercise list.
- Search by name.
- Filter by muscle group.
- Filter by equipment.
- View exercise details.

### Workout Logger

Status: In progress.

Purpose: Make weight lifting logging fast, tactile, and low-typing.

Current capabilities:

- Start an active session from the Session tab.
- Add exercises as the workout happens.
- Choose catalog exercises from the selector.
- Add custom exercises by name.
- Save the active session, logged exercises, and set rows locally with SQLite.
- Set weight with a horizontal ruler control.
- Set reps with a horizontal ruler control.
- Set number of sets with a horizontal ruler control.
- Save an exercise to the active session log.
- Save the active session as a completed workout for future history/progress charts.
- Show recent previous sessions below Start Session with exercise count, set count, and an itemized exercise list.
- Show saved exercises in chronological order.
- Show saved stats: sets, reps, and weight.
- Swipe saved exercises to delete them locally.

Expected capabilities:

- Repeat previous values quickly.
- View workout summary.
- Support per-set history if needed.

### Workout History

Status: Planned; storage foundation started.

Purpose: Let users review completed sessions.

Current capabilities:

- Completed workout sessions are stored in the existing local SQLite workout/session/set tables.
- The Session tab lists recent completed sessions as a compact history summary with saved exercises itemized.

Expected capabilities:

- Reuse the existing local SQLite workout/session/set tables.
- View workout details.
- See exercises, sets, reps, and weights.
- Edit mistakes.
- Delete accidental entries.

### Program Tracking

Status: Planned.

Purpose: Support structured lifting schedules.

Initial program types:

- Push Pull Legs.
- Upper Lower.
- Custom program.

Expected capabilities:

- Pick a program.
- View weekly schedule.
- Start today's program workout.
- Mark rest days.
- Track program adherence.

### Streaks

Status: Planned.

Purpose: Encourage consistency without punishing recovery.

Expected capabilities:

- Current streak.
- Planned rest days count as maintained consistency.
- Missed workout days affect streaks.
- Weekly consistency view.

### Progress Dashboard

Status: In progress.

Purpose: Show strength improvement over time.

Current capabilities:

- Show PRs as a running best estimated one-rep max from saved completed sessions.
- Switch between all-lift trends and exercise-specific trends with a dedicated exercise picker.
- Show average weight lifted per session as a separate tab.
- Show volume over time as a secondary workload tab.
- Filter the chart to 1M, 3M, or All saved data.

Expected capabilities:

- Stock-chart-like progress chart.
- Time range controls.
- Total lifting volume.
- Exercise-specific progress.
- Estimated strength improvements.
- Personal records.
- Program consistency.

## Later Features

### Developer Diagnostics

Status: Started.

Purpose: Make app failures and stuck development states visible while building.

Current capabilities:

- `npm run dev` starts Expo with dev diagnostics enabled.
- Normal app start scripts do not expose the diagnostics overlay.
- App-wide overlay shows render/runtime failures, console warnings/errors, and tracked pending operations.
- Copy Logs copies a complete plain-text diagnostics snapshot to the clipboard.
- Workout session storage load/save/delete paths report tracked operations for stuck-state debugging.
- Completed dev operations are capped to recent entries and show elapsed timings; slow resolved operations emit an info signal.

### Social Feed

Status: In progress; auth/profile foundation started.

Purpose: Let users connect with friends and see opt-in lifting updates.

Expected capabilities:

- Create an account with email/password.
- Create a social profile with a unique, immutable `@handle`.
- Set a display name.
- Upload a profile picture.
- Keep privacy private by default.
- Change privacy during onboarding/settings.
- Send, accept, and remove friend requests.
- View a friends feed.
- Share new PR events.
- Share compact completed-session summaries.
- Control privacy before workout data becomes friend-visible.

Storage approach:

- Use Supabase for accounts, friendships, and feed events.
- Keep full workout history local-first in SQLite unless backup/sync is enabled.
- Publish small derived events instead of raw workout logs by default.

Current capabilities:

- Supabase client setup.
- Email/password sign up and sign in from onboarding.
- Email confirmation links can open the app callback and complete sign-in when Supabase returns session tokens.
- Successful auth navigates immediately; social profile, avatar, and local cache writes run in the background.
- Local profile reads are cached in memory so Profile refreshes and workout session creation avoid repeated SQLite lookups.
- Local profile stores auth user id, email, handle, display name, avatar URL, and profile visibility.
- Profile tab can show handle/privacy/avatar and sign out.
- Signed-in settings allow display name, avatar, and privacy changes without allowing handle changes.
- Missing social profile rows can be repaired from auth metadata or one-time handle setup in Settings.
- SQL schema file exists for Supabase social tables and RLS policies.
- Supabase Storage setup exists for uploaded avatar images.

### Apple Health Integration

Status: Deferred.

Purpose: Connect iOS health data once the core app is useful.

Potential data:

- Workouts.
- Active energy.
- Heart rate.
- Body weight.
- Steps.

### Android Health Integration

Status: Deferred.

Purpose: Support Android health data through Health Connect or another appropriate Android path.

Potential data:

- Workouts.
- Calories.
- Heart rate.
- Body metrics.
- Steps.

### Fitbit Integration

Status: Deferred.

Purpose: Connect Fitbit activity and wearable data.

Potential data:

- Heart rate.
- Activity.
- Sleep.
- Steps.
- Calories.

### Food Tracker Integration

Status: Deferred.

Purpose: Connect nutrition context to lifting progress.

Potential data:

- Calories.
- Protein.
- Carbs.
- Fat.
- Meal summaries.

## Explicit Non-Goals For MVP

- Full nutrition tracking built from scratch.
- Social feed before the core local logging and history flows are stable.
- Trainer marketplace.
- AI workout plan generation.
- Wearable-first experience.
- Native Apple Watch app.
