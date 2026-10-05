# Roadmap

## First release target

Planning snapshot: October 4, 2026. The user requested a feature-complete first release in three months. Target **January 4, 2027**, with a **December 6, 2026 feature freeze** and December reserved for real-gym beta testing and release fixes. Dates are proposed targets, dependent on regular development, native build/device access, qualified coaching policy review and store approval.

Proposed v1 scope: fast individual-set logging, full completed-session history/details/correction, private workout notes, completion/weekly recaps, elapsed workout time, a rest timer, exercise shortcuts, programs/adherence, rest-aware streaks, charts, device-verified reminders and reviewed text/screenshot import, optional accounts, narrowly scoped local coaching, accessibility and release preparation. Keep vacation routines, full social/feed, music/supplement tracking, health/nutrition, cloud sync, hosted AI and permanent automatic program adaptation for later releases under this proposed plan.

| Dates | Focus | Exit gate |
| --- | --- | --- |
| Oct 5–11 | Scope and installed iOS/Android baseline | Agreed acceptance checks and native builds |
| Oct 8–Nov 1 | Logging speed, summaries, full history and correction | Reliable actual-set review/reuse and derived-data refresh |
| Oct 26–Nov 15 | Upgrade safety, adherence, native reminders/import | Preserved existing data and recorded device evidence |
| Nov 9–29 | Reviewed today-only coach and optional accounts | Qualified policy review, defined decision-history scope and reliable guest/account flows |
| Nov 16–Dec 6 | Accessibility, metrics and integration | Agreed v1 acceptance checks pass; feature freeze |
| Dec 7–20 | Real-gym beta, fixes and store materials | No unresolved release-blocking defects |
| Dec 21–Jan 3 | Candidate, store review and buffer | Candidate verification and required approvals |
| Jan 4 | Target first release | All release gates pass |

The private [Notion project hub](https://app.notion.com/p/3f0b1348a34d812c832ace7baa9d4b75) and [roadmap database](https://app.notion.com/p/c8cffe9817e34c3fb723ec417fc126ab) contain 27 scheduled tasks and eight later backlog items, with timeline, board, table, later-work and requested-features views. [Hub snapshot](docs/notion/Orca%20Project%20Hub.md), [roadmap CSV](docs/notion/Orca%20Roadmap.csv) and [setup guide](docs/notion/README.md) are retained in the repository. Dependencies are completion/release gates; preparation can overlap. Status/date upkeep is manual, with no automatic GitHub sync.

Current code includes charts, individual-set logging, weekly consistency and avatar upload. The detailed phase notes below distinguish implemented work from remaining release checks; older architecture/model descriptions may lag the current schema-8 coach prototype. Refer to the feature implementation and `apps/mobile/README.md` before changing behavior.

## Requested features

The user added these nine features on October 4. Proposed placement retains the January 4 target with four smaller additions in v1. Larger work has no committed dates. Reassess capacity at the weekly review.

| Feature | Task | Proposed placement | Completion scope |
| --- | --- | --- | --- |
| Vacation mode | F01 | Later | Reviewed travel routine generated from available equipment; preserve/restore the regular plan. |
| Notes to self | F02 | Oct 19–Nov 1 | Private workout notes, offline save/reload and history review; exercise-specific notes can follow. |
| Recaps | F03 | Nov 2–15 | Completion and weekly summaries using actual sessions, working sets, volume, time, PRs and consistency. |
| Feed | L02 | Later | Opt-in friend-visible workout/PR summaries, tested audience permissions and unsharing/deletion. |
| Music listened to | F04 | Later | Song/playlist metadata in workout history; manual entry first, automatic capture after provider choice. |
| Supplements | F05 | Later | Private user-entered name, optional amount/unit/time and notes with editing and deletion. |
| Offline mode with reconnect sync | F06 | Later | Durable account-owned queue, reconnect/retry deduplication, conflicts and offline edits/deletions. |
| Workout time | F07 | Oct 19–Nov 1 | Elapsed session time, explicit pause rules and persistent duration in history/recaps. |
| Rest timer | F08 | Oct 19–Nov 1 | Adjustable between-set countdown, background/resume persistence and permitted completion cues. |

Offline local logging already exists; reconnect/cloud sync does not. Session timestamps are only a foundation for workout time, and current timed-set totals are not session duration. The native notes column and seven-day coach review are foundations rather than completed notes/recap products. Feed extends the existing L02 task. L01 now covers backup/restore separately from F06 sync. Data safety, reminder/device checks, accessibility, metrics and feature-freeze gates include the four new v1 additions.

## Phase 0: Product Context

Goal: Create the shared project context and keep future tasks aligned.

Deliverables:

- Project brief.
- Architecture notes.
- Feature list.
- Decision log.
- Modular roadmap.

Status: Shared context foundation complete; maintained as the project changes.

## Phase 1: App Scaffold

Goal: Create the React Native Expo app foundation.

Deliverables:

- Expo app in `apps/mobile`.
- TypeScript configured.
- Expo Router configured.
- Basic theme.
- Core navigation shell.
- Placeholder screens for Onboarding, Session, Exercises, Programs, Progress, and Profile.

Status: Implemented; release configuration and device verification remain in Phase 11.

## Phase 2: Exercise Library

Goal: Make it possible to browse and select lifting exercises.

Deliverables:

- Exercise seed data.
- Exercise list.
- Search/filter by muscle group and equipment.
- Exercise detail screen.
- Exercise picker for workout logging.
- Custom exercise entry for missing movements.

Status: Core library implemented; shortcuts and release usability checks remain.

Current progress:

- RepDB free-tier assets and license files are stored locally.
- Exercises and Session share search/filter/detail flows for all 400 bundled exercises with licensed images.
- Custom exercise name entry is supported from the picker.

Remaining:

- Favorites and recently used exercises.
- Phone usability and accessibility checks.

## Phase 3: Tap-First Workout Logger

Goal: Build the core experience of logging lifts without spreadsheet-style typing.

Deliverables:

- Start workout/session flow.
- Active session log.
- Add exercise flow.
- Fast thumb-friendly individual-set entry for weight, reps and duration.
- Save exercise to session.
- Chronological session list.
- Swipe-to-delete saved exercise.
- Complete workout.
- Save completed sessions for progress/history.
- Workout summary.
- Private notes, elapsed workout time and a rest timer.

Status: Core logging implemented; summary, previous-value reuse and gym usability remain.

Current progress:

- Session tab starts an active session.
- Users add catalog or custom exercises.
- Saving appends exercises to the session log with actual individual sets, weight, reps/time and optional effort/warm-up flags.
- Active session data is saved locally in SQLite.
- Save Session completes the workout in SQLite for future progress/history views.
- The Session start screen lists recent completed sessions.
- The live logger uses per-set numeric fields/steppers and copy/add-set controls; earlier ruler controls are not the current logging flow.
- Nonempty unfinished sessions pause/resume; empty-session exit creates no workout or streak credit.
- Swipe-to-delete is available for saved exercise rows.

Remaining:

- Workout summary.
- Repeat previous values quickly.
- Verify fast entry and edge cases on phones.
- Private workout notes plus persistent workout/rest timers, tracked as F02/F07/F08.

## Phase 4: Local Workout History

Goal: Persist completed workouts locally and make history review useful.

Deliverables:

- Local database or structured persistence.
- Workout history list.
- Workout detail view.
- Edit/delete workout entries.
- Basic data migration pattern.

Status: Recent-session totals and storage implemented; full history tools planned.

Current progress:

- SQLite schema and repositories exist for profiles, workout sessions, workout exercises, and set entries.
- Saved session exercises persist locally as normalized exercise and set rows.
- Completed sessions are marked with `completed_at` and can be queried for progress charts.
- Recent completed sessions appear in the Session tab as a compact history list.

Remaining:

- Full completed-session list, details and a summary shown after saving, with correct actual-set totals.
- Correct/delete completed mistakes and refresh charts, coaching evidence, streaks and reminders consistently.
- Verify additive upgrades preserve current data; do not repeat historical prelaunch resets.

## Phase 5: Programs

Goal: Support structured lifting programs.

Deliverables:

- Program templates: Push Pull Legs, Upper Lower.
- Program calendar or weekly schedule.
- Program day detail.
- Attach workouts to program days.
- Mark planned rest days.

Status: In progress; local programs and schedule integration implemented.

Current progress:

- Editable starter/imported/user programs with weekly or repeating-cycle training/rest schedules and typed targets.
- Explicit activation/switch/deactivation, a prominent current-program/day summary, and automatic Session exercise queues.
- Manual one-workout bypass and deactivation preserve unfinished sessions and previous history.
- Shared schedule revisions keep enabled reminders and rest-aware streaks aligned; lifecycle regressions cover both storage backends.

Remaining:

- Program adherence-history calendar, including unscheduled workouts and manual rest overrides.
- Physical-device reminder delivery checks remain under Phase 6.

## Phase 6: Rest-Day-Aware Streaks

Goal: Track consistency without forcing workout check-ins on planned rest days.

Deliverables:

- Streak calculation rules.
- Rest day support.
- Current streak display.
- Weekly consistency view.
- Missed workout handling.
- Adaptive workout, streak and morning rest-day reminders.

Status: In progress; rest-aware streaks and local reminders implemented.

Current progress:

- Rest-aware streaks and the current-week consistency display use actual workouts and planned/manual rest.
- Profile opt-in schedules reminders before learned session-save times, follows up on unlogged training days and respects manual/scheduled rest.
- A rolling 28-day local schedule refreshes with app activity and saved training changes; no backend or training-data reset is needed.

Remaining:

- Verify notification permission flows and delivery on rebuilt iOS/Android devices, including completion cancellation, rest/schedule edits and timezone changes.
- Broader consistency/history presentation remains separate from reminders.

## Phase 7: Progress Dashboard

Goal: Visualize lifting improvement over time.

Deliverables:

- Stock-chart-like strength trend.
- Time range controls.
- Total volume trend.
- Exercise-specific progress.
- Personal records.
- Program adherence.

Status: Charts implemented; adherence presentation and release verification remain.

Current progress:

- PR/estimated strength, rep-weighted average weight and volume read actual completed local sets without an account.
- Saved-lift selection, 1M/3M/All ranges and empty/single/multiple-point states are supported.

Remaining:

- Verify metrics and refresh after completed-history corrections, including timed and warm-up handling.
- Program adherence-history presentation is tracked under Phase 5.
- Completion and weekly recaps from actual saved sessions, tracked as F03.

## Phase 8: Health and Fitness Integrations

Goal: Connect external health data after the core app works.

Deliverables:

- Apple Health research and permission plan.
- Android Health Connect or Google Fit research and permission plan.
- Fitbit integration research.
- Sync design for external data.
- Initial read-only integration.

Status: Deferred.

## Phase 9: Social Backend And Feed

Goal: Add accounts, friends, and a compact opt-in activity feed.

Deliverables:

- Supabase project configuration.
- Auth client and local session handling.
- Public/social profile table.
- Friend request and friendship tables.
- Privacy settings for shared workout data.
- Feed event table for PRs and completed workout summaries.
- Feed tab or feed section.
- Local-to-cloud publish flow for selected PR/session summary events.

Status: In progress; auth/profile foundation started.

Current progress:

- Supabase client is configured for Expo React Native.
- Email/password sign up and sign in are wired into onboarding.
- Onboarding collects unique handle, display name, optional avatar URL, and privacy setting.
- Signed-in profile settings can edit display name/avatar/privacy while keeping handles immutable.
- Profile visibility defaults to private.
- Supabase SQL schema exists for social profiles, friendships, and feed events.
- Avatar image upload and signed-in profile/privacy editing are implemented.

Remaining:

- Confirm the hosted schema, policies and avatar bucket configuration; local SQL files do not establish deployment.
- Device-verify optional account confirmation/recovery and deletion/profile/avatar cleanup, explicitly handling device-local training data; preserve independent guest logging for v1.
- Friend request UI and repository functions.
- Feed UI.
- PR/session-summary publishing from local SQLite.

Full friends/feed publishing remains after v1. The existing auth/profile foundation is included in the first-release readiness checks.

## Phase 10: Nutrition Integrations

Goal: Connect food tracking context after workout tracking is useful.

Deliverables:

- Decide which food trackers or APIs to support.
- Define nutrition data model.
- Implement import or connection flow.
- Show nutrition context in progress dashboard.

Status: Deferred.

## Phase 11: Polish and Release Prep

Goal: Prepare for real device testing and eventual release.

Deliverables:

- Error states.
- Empty states.
- Accessibility pass.
- Real-device testing.
- App icons and splash screen.
- Privacy policy.
- Store listing drafts.

Status: Planned; dev diagnostics started.

Current progress:

- Dev-only diagnostics overlay is available through `npm run dev`.
- The overlay captures app-wide render/runtime failures, console warnings/errors, and tracked async operations.
- The overlay can copy the current diagnostics snapshot to the clipboard.

Remaining:

- Installed native builds, OCR compilation/device checks and reminder permission/delivery checks.
- Narrow local-coach policy review, opt-in pilot and a decision on shipped decision-history persistence; see `COACH_IMPLEMENTATION_PLAN.md`.
- Phone usability/accessibility, signed beta distribution, real-gym testing, icons/splash and store/support/privacy materials.
- Final candidate regression checks and required store approvals before the release target.
