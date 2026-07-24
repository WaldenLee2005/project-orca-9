# Roadmap

## Phase 0: Product Context

Goal: Create the shared project context and keep future tasks aligned.

Deliverables:

- Project brief.
- Architecture notes.
- Feature list.
- Decision log.
- Modular roadmap.

Status: In progress.

## Phase 1: App Scaffold

Goal: Create the React Native Expo app foundation.

Deliverables:

- Expo app in `apps/mobile`.
- TypeScript configured.
- Expo Router configured.
- Basic theme.
- Core navigation shell.
- Placeholder screens for Onboarding, Session, Exercises, Programs, Progress, and Profile.

Status: Mostly complete.

## Phase 2: Exercise Library

Goal: Make it possible to browse and select lifting exercises.

Deliverables:

- Exercise seed data.
- Exercise list.
- Search/filter by muscle group and equipment.
- Exercise detail screen.
- Exercise picker for workout logging.
- Custom exercise entry for missing movements.

Status: In progress.

Current progress:

- RepDB free-tier assets and license files are stored locally.
- Session picker uses a curated two-column exercise grid with images.
- Custom exercise name entry is supported from the picker.

## Phase 3: Tap-First Workout Logger

Goal: Build the core experience of logging lifts without spreadsheet-style typing.

Deliverables:

- Start workout/session flow.
- Active session log.
- Add exercise flow.
- Weight horizontal ruler control.
- Reps ruler control.
- Sets ruler control.
- Save exercise to session.
- Chronological session list.
- Swipe-to-delete saved exercise.
- Complete workout.
- Save completed sessions for progress/history.
- Workout summary.

Status: In progress.

Current progress:

- Session tab starts an active session.
- Users add catalog or custom exercises.
- Saving appends exercises to the session log with sets/reps/weight.
- Active session data is saved locally in SQLite.
- Save Session completes the workout in SQLite for future progress/history views.
- The Session start screen lists recent completed sessions.
- Ruler controls exist for sets, reps, and weight.
- Weight supports 0.5 lb increments.
- Swipe-to-delete is available for saved exercise rows.

Remaining:

- Workout summary.
- Repeat previous values quickly.
- Per-set logging if needed.

## Phase 4: Local Workout History

Goal: Persist completed workouts locally and make history review useful.

Deliverables:

- Local database or structured persistence.
- Workout history list.
- Workout detail view.
- Edit/delete workout entries.
- Basic data migration pattern.

Status: Planned; storage foundation started.

Current progress:

- SQLite schema and repositories exist for profiles, workout sessions, workout exercises, and set entries.
- Saved session exercises persist locally as normalized exercise and set rows.
- Completed sessions are marked with `completed_at` and can be queried for progress charts.
- Recent completed sessions appear in the Session tab as a compact history list.

## Phase 5: Programs

Goal: Support structured lifting programs.

Deliverables:

- Program templates: Push Pull Legs, Upper Lower.
- Program calendar or weekly schedule.
- Program day detail.
- Attach workouts to program days.
- Mark planned rest days.

Status: Planned.

## Phase 6: Rest-Day-Aware Streaks

Goal: Track consistency without forcing workout check-ins on planned rest days.

Deliverables:

- Streak calculation rules.
- Rest day support.
- Current streak display.
- Weekly consistency view.
- Missed workout handling.

Status: Planned.

## Phase 7: Progress Dashboard

Goal: Visualize lifting improvement over time.

Deliverables:

- Stock-chart-like strength trend.
- Time range controls.
- Total volume trend.
- Exercise-specific progress.
- Personal records.
- Program adherence.

Status: Planned.

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

Remaining:

- Run/apply Supabase schema in the hosted project.
- Friend request UI and repository functions.
- Feed UI.
- PR/session-summary publishing from local SQLite.
- Avatar image upload flow.

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
