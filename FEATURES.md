# Feature Inventory

## MVP Features

### Visual design

Status: Native-style overhaul implemented.

- System typography, blue actions, flat grouped surfaces, and automatic light/dark appearances; no glow or neumorphic shadows.
- Shared styling across Session, exercise search/details, Progress, Programs, Profile, and account forms.
- Edge-to-edge bottom navigation, native safe areas, visible search focus, compact exercise rows, and high-contrast text.
- Workout-first Today page, optional on-device training review, and grouped profile/storage details.
- Weekly consistency display uses real saved workouts and rest days; existing persistence, guest access, and session refresh remain unchanged.

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

- Search all 400 bundled free-tier RepDB exercises in the Exercises tab and Session picker.
- Match names, muscles, equipment, and abbreviations such as DB, BB, and RDL.
- Combine muscle-group and equipment filters; clear searches and recover from empty results.
- View catalog exercises in a two-column grid.
- Show licensed RepDB still images in the selector.
- Add a custom exercise name when the catalog is missing a movement.
- Use catalog or custom exercises inside the workout logger.
- Read exercise instructions and send a library selection directly to the Session logger without replacing an active workout.

Expected capabilities:

- Favorites and recently used exercises.

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
- Show recent previous sessions below Start Session with exercise count, set count, and total volume.
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
- The Session tab lists recent completed sessions as a compact history summary.

Expected capabilities:

- Reuse the existing local SQLite workout/session/set tables.
- View workout details.
- See exercises, sets, reps, and weights.
- Edit mistakes.
- Delete accidental entries.

### Program Tracking

Status: Editable starter programs, user-created multi-day programs, weekly/cycle scheduling, typed targets, and text/screenshot import prototype implemented.

- Import pasted plans or locally OCR-read screenshots, review source lines, manually match uncertain exercise names, and correct sets/exact reps/ranges/time. Confirm the proposed schedule/rest days in the existing builder before saving. Imports never activate a program or generate workout/streak history. Browser OCR is verified; native OCR requires a rebuilt app and device verification. No video import or LLM yet.

- Create and name a program; add multiple exercises from the 400-exercise RepDB library.
- Configure 1–12 sets with exact reps, a rep range (1–100), or a timed target (1 second–60 minutes per set). Repeated lifts have independent targets.
- Drag handles to reorder, including edge auto-scroll; move-up/down buttons provide an accessible alternative.
- Save and edit programs locally without an account. Canceling edited drafts and deleting saved programs require confirmation.
- Start a program workout with its saved exercise order and targets. Existing active workouts cannot be replaced.
- Planned targets do not count as completed sets. The logger captures actual results, preserving chart and streak behavior.
- Timed work logs actual duration separately from reps and appears in workout history. It counts toward completed workouts/streaks but is excluded from rep-based strength, weight, and volume charts. Logging is manual; a countdown timer is not included.
- Weekly weekday plans or repeating 1–28-day cycles with a start date and independent exercises, targets, and order for each training day.
- Choose Training or Rest per day; new days default to Rest. Turn one program on/off with confirmation. Start Session automatically loads today's training exercises from the program; users tap each one to log actual weight, reps/time, and sets. Planned rest protects streaks automatically from activation onward, including days away from the app. Missed training days still break streaks unless manually marked as rest. Existing workouts survive switches and turning a program off.
- Session shows today's planned workout/recovery. Schedule edits, switches, stops, and deletions preserve earlier rest-day history and workout snapshots created on the current schema. Prelaunch training setups were intentionally reset; old formats are not migrated.
- Built-in, opt-in starter programs: Push/Pull/Legs (Mon–Sat, Sunday rest), Upper/Lower (Mon/Tue/Thu/Fri, three rest days), and Full Body Every Other Day (A/rest/B/rest, a rolling 4-day cycle). PPL and Upper/Lower cover major groups at least twice weekly; FBEOD covers them 3–4 times weekly with lower per-session volume. All use real RepDB exercises, rep ranges, moderate working sets, and timed planks. Preview every day before creating an editable copy. No weights, completed workouts, or active schedules are seeded; copies save OFF until explicitly activated. Automatic rest never fills missed training days. A full adherence-history calendar is not yet implemented.

### Streaks

Status: Started.

Purpose: Encourage consistency without punishing recovery.

Current capabilities:

- Current streak.
- Muted active/rest day counts for the current streak, counting a date with both a workout and rest once as active.
- Planned rest days count as maintained consistency.
- Missed workout days affect streaks.

Expected capabilities:

- Weekly consistency view.

### Workout reminders

Status: Implemented; native delivery and permission smoke tests pending.

- Opt in from Profile on iOS/Android; works with guest or signed-in use and learns from the device's existing completed sessions.
- A local circular average of the latest saved session per day over 28 days sets a reminder 15 minutes before and a follow-up 2 hours after; saving a session cancels its date's remaining notices. Offsets stay on the same date.
- Manual and scheduled rest days receive a morning reminder only. Profile adjusts the 8:00 AM rest time and 6:00 PM starting workout time used without recent history. Today may mention the known streak; future messages never invent one.
- Up to 28 days of local notifications refresh on launch/resume, date/timezone changes while foregrounded, and relevant training changes. Open Orca at least every 28 days to replenish them. No push backend, account requirement, or training-data migration.
- Rebuilt native app and notification permission required; web is unsupported. Android exact-alarm permission is not requested, so delivery can be delayed by the OS. Implementation and device checklist: `apps/mobile/src/features/reminders/README.md`.

### Progress Dashboard

Status: Started; original chart dashboard restored.

Purpose: Show strength improvement over time.

Current capabilities:

- Stock-chart-like progress chart.
- Time range controls.
- Total lifting volume.
- Exercise-specific progress.
- Estimated strength improvements.
- Personal records.
- Rep-weighted average weight.
- Local saved-session data; no account required.

Expected capabilities:

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

- Optional account setup; core workouts, history, and streaks work without an account or Supabase configuration.
- Supabase SDK session persistence and automatic token refresh, with migration of previously saved sessions.
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
