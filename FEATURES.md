# Feature Inventory

## Requested roadmap additions

Requested October 4, 2026 and confirmed for the January 4, 2027 launch. These are planned capabilities unless implementation is called out below. Specific start/completion dates and dependencies live in `ROADMAP.md` and the Notion roadmap. Core-flow beta starts November 2; all nine target implementation completion November 29 and join full-feature beta December 7–20 after the December 6 freeze.

| Feature | Planned behavior | Completion checks |
| --- | --- | --- |
| Vacation mode | Generate a temporary routine from the equipment available while traveling. Review and edit before using it, then return to the regular program. | Match available equipment, keep targets editable, preserve the original program and history, and restore the normal schedule without rewriting past rest days. |
| Notes to self | Optional private notes on each recorded set implemented; add/edit/clear them in the logger, active log and recent-session details. Session-level notes remain planned. | Retain notes offline after reload on native/web, preserve existing training data, keep notes out of coaching inputs and social sharing, and verify native phone flows before release. |
| Recaps | Show a completion recap and weekly training summary from actual saved work. | Correct exercise/set/volume/time totals, PRs and consistency; respect timed work, rest days and history corrections without inventing results. |
| Feed | Following/Your posts, text and one optional photo, approved private follows, and opt-in automatic PR posts implemented. | Hosted migration/security checks and native photo/account flows remain; preserve owner-only audiences, deletion/retry safety and private notes. Session-summary sharing remains planned. |
| Music listened to | Manually record song/playlist names or links associated with a workout. | Retain metadata in workout history with offline save/reload and editing/deletion. Automatic capture requires a later provider choice and consent/permissions. |
| Supplements | Keep a private log of supplements the user records. | User-entered product, amount/unit and time with edit/delete, offline persistence and recap inclusion only when chosen. |
| Offline mode with reconnect sync | Continue logging offline and sync account-owned data after connectivity returns. | Durable pending changes, idempotent retries, account isolation, visible sync/conflict state, and edits/deletions surviving reconnect without duplication or data loss. Guest logging stays local. |
| Workout time | Show elapsed workout time and save duration with completed sessions. | Explicit pause/resume rules, correct background/restart handling, and duration in history/recaps. Elapsed workout time stays separate from timed exercise sets. |
| Rest timer | Run an adjustable countdown between sets. | Start/pause/skip/reset, correct background/resume behavior, and completion alerts that respect permissions and do not interfere with workout reminders. |

Existing foundations: local offline workout storage, session start/completion timestamps, a database-level session notes field, a seven-day coach summary and Supabase auth/profile code. Per-set notes and the following/text/photo/automatic-PR feed are implemented. The session-level notes editor, weekly recap product, workout/rest timers, music/supplement tracking, vacation generator and training-data sync remain planned. Feed hosted/native acceptance is still required.

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
- Exit an empty session without recording a workout; exit a session with saved exercises to pause and resume from Today. Existing results and program snapshots stay preserved.
- Add exercises as the workout happens.
- Choose catalog exercises from the selector.
- Add custom exercises by name.
- Save the active session, logged exercises, and set rows locally with SQLite.
- Record weight with a swipeable in-box ruler, fixed marker, 0.5 lb snapping and distinct 0.5/1/5/10 lb ticks. Native haptic feedback accompanies changes; exact decimal entry and accessible step controls remain available. Reps/duration keep numeric steppers.
- Horizontal touch gestures support continuous movement and direction changes until release, retaining short swipes and chosen values through scrolling handoffs. Weight shortcuts appear below sets without moving the active scale. ±5/±10 lb buttons support larger changes.
- Start an exercise's scale at its last saved working-set weight, including saved work in an unfinished session. Keep exact decimals/zero; exclude warm-ups/timed work and incompatible load context. Untouched program defaults yield to last saved work, while manual interaction, copying and explicit clearing stay intact. Named custom lifts match across workouts. Without history, use the program load or type the first weight and copy it into empty sets.
- Keep the recent rep-weighted average (latest three eligible completed workouts within 90 local days) as an optional reuse shortcut.
- Add/copy/remove individual sets.
- Optionally record effort in one compact Skip / Easy / Right / Hard row and retain warm-up status for each set.
- Toggle load coaching once for the whole session, with a saved program default and a persistent session override. Per-exercise setup controls are removed; existing explicit load metadata stays preserved. Reviewed set-count reductions for programs without load metadata leave actual weights untouched; numeric load proposals still require trustworthy weight/equipment context.
- Optionally add a private, multiline note to self for every rep or timed set (up to 1,000 characters). Copying a set clears the new note; coaching apply/undo preserves draft notes.
- Review, add, edit or clear saved set notes from the active log and expandable recent sessions, with offline native/web persistence and no account requirement.
- Save an exercise to the active session log.
- Save the active session as a completed workout for future history/progress charts.
- Show recent previous sessions below Start Session with exercise count, set count, and total volume.
- Show saved exercises in chronological order.
- Show saved stats: sets, reps, and weight.
- Swipe saved exercises to delete them locally.

Expected capabilities:

- Reuse previous reps/durations alongside last saved weight prefill.
- View workout summary.
- Review and correct actual sets in completed workout history.

### Workout History

Status: Planned; storage foundation started.

Purpose: Let users review completed sessions.

Current capabilities:

- Completed workout sessions are stored in the existing local SQLite workout/session/set tables.
- The Session tab lists recent completed sessions as a compact history summary.
- Tap a recent session to review its exercises and actual sets, and add/edit/clear private set notes. Full-history browsing and measurement corrections remain planned.

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
- Saved and starter cards open a read-only overview with Activate and Edit actions, then exercises/targets for every day. Editing is explicit. Starters can save and activate a fresh copy directly after confirmation; browsing never saves a program.
- Start a program workout with its saved exercise order and targets. Existing active workouts cannot be replaced.
- Planned targets do not count as completed sets. The logger captures actual results, preserving chart and streak behavior.
- Timed work logs actual duration separately from reps and appears in workout history. It counts toward completed workouts/streaks but is excluded from rep-based strength, weight, and volume charts. Logging is manual; a countdown timer is not included.
- Weekly weekday plans or repeating 1–28-day cycles with a start date and independent exercises, targets, and order for each training day.
- Choose Training or Rest per day; new days default to Rest. A prominent active-program panel shows today's training/recovery and confirmed deactivation. Activate or switch saved programs with confirmation; the selected program appears first, ahead of starter templates. Session automatically loads today's training exercises; users tap each one to log actual weight, reps/time, and sets. Start without program offers a manual workout while retaining the selection; deactivation returns subsequent starts to normal tracking. Planned rest protects streaks from activation onward, including days away from the app. Missed training days still break streaks unless manually marked as rest. Existing workouts survive switches/deactivation.
- Programs and Session refresh after successful training changes, resume and date rollover with stale-read protection. Schedule revisions also update enabled workout/rest reminders and preserve earlier streak history; cross-storage lifecycle tests cover activation, switch, edit, deactivation, completion and failed-write safety.
- A saved, nonempty program workout marks its matching program/day **Completed today** by local completion date. Session removes its planned preview and Start workout; Programs removes repeat day starts. **Start an extra workout** is manual and retains the active program. Storage rechecks completion before creation, while unfinished sessions resume intact. Manual/paused/empty workouts and other program/day completions do not satisfy the day; saving a partial planned workout does. Completion does not advance the cycle; the current execution schedule determines tomorrow.
- Missing a settled scheduled Training date restarts the active program at its first stored day today, including a first day marked Rest. Today stays open and scheduled rests do not count as misses. Completion must match the exact program/day on its local date; manual rest or unrelated workouts do not complete a program day even if they maintain the ordinary streak. An unfinished workout defers restart and preserves its snapshot.
- Restart creates a new dated cycle execution revision shared by Session, Programs, streaks and reminders. Saved weekly/cycle templates, earlier rest history and actual workouts remain unchanged; inactive programs and future starts are unaffected. Serialized training writes guard concurrent starts/reconciliation, with no schema migration or training-data reset.
- Session shows today's planned workout/recovery. Schedule edits, switches, stops, and deletions preserve earlier rest-day history and workout snapshots created on the current schema. Prelaunch training setups were intentionally reset; old formats are not migrated.
- Built-in, opt-in starter programs: Push/Pull/Legs (Mon–Sat, Sunday rest), Upper/Lower (Mon/Tue/Thu/Fri, three rest days), and Full Body Every Other Day (A/rest/B/rest, a rolling 4-day cycle). PPL and Upper/Lower cover major groups at least twice weekly; FBEOD covers them 3–4 times weekly with lower per-session volume. All use real RepDB exercises, rep ranges, moderate working sets, and timed planks. Preview every day, then activate or edit a copy. No weights, completed workouts, or active schedules are seeded; editor copies save inactive, and direct activation is confirmed. Automatic rest never fills missed training days. A full adherence-history calendar is not yet implemented.

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
- Personal records from the heaviest actual weight in any completed rep set, including multi-rep and warm-up sets; no estimate or multiplier is applied. Timed work remains outside these rep-based charts. Without saved rep sets, PRs prompts the user to log weights.
- Running records use full history before the visible date range, so older PRs remain current. Current/previous records show saved decimal weights, and the current record shows its source set's actual weight/reps. All Lifts takes the highest weight across exercises, while selecting a lift isolates its records.
- Rep-weighted average weight.
- Local saved-session data; no account required.

Expected capabilities:

- Program consistency.

## Additional Features and Integrations

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

Status: Following, text/photo posts and opt-in automatic PR publishing implemented October 6. Hosted schema deployment/security and physical-device acceptance remain before beta.

Purpose: Let users follow other lifters and share small updates.

Expected capabilities:

- Create an account with email/password.
- Create a social profile with a unique, immutable `@handle`.
- Set a display name.
- Upload a profile picture.
- Keep privacy private by default.
- Change privacy during onboarding/settings.
- Follow public profiles immediately; request/approve private and follower-only accounts, cancel requests, unfollow and remove followers.
- View Following and Your posts with paging, refresh, retry and empty states.
- Post up to 2,000 characters and one optional photo; select Followers, Public or Only me, and delete posts.
- Enable automatic future-workout PR posts with an account-owned audience and retry queue; full actual history determines new records.
- Share compact completed-session summaries.
- Control privacy before workout data becomes friend-visible.

Storage approach:

- Use Supabase for accounts, follows and feed events; preserve legacy friendship rows.
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
- Feed images use a separate private 5 MB bucket; signed links expire after 60 seconds and new reads follow the post/profile/follower permissions.
- Feed has Public/Followers switches for created text/photo posts and automatic PRs, with Followers defaults and a separate Only me option. PR audience can be saved while sharing is off and applies to future/unsent posts; published audiences stay unchanged. Public reach also requires a public profile, with a settings link in the feed.
- Account switching clears displayed social data; turning automatic sharing off cancels pending posts. Event IDs and deletion tombstones prevent retry duplicates/resurrection. Guest logging and private notes remain local.
- The additive `supabase/feed-following.sql` migration preserves existing data. See the social README for setup, policy checks and remaining hosted/device acceptance.

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
