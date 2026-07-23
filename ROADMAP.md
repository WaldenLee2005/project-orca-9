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
- Placeholder screens for Onboarding, Workouts, Exercises, Programs, Progress, and Profile.

## Phase 2: Exercise Library

Goal: Make it possible to browse and select lifting exercises.

Deliverables:

- Exercise seed data.
- Exercise list.
- Search/filter by muscle group and equipment.
- Exercise detail screen.
- Exercise picker for workout logging.

## Phase 3: Tap-First Workout Logger

Goal: Build the core experience of logging lifts without spreadsheet-style typing.

Deliverables:

- Start workout flow.
- Select exercise flow.
- Weight horizontal scale/slider control.
- Reps control.
- Sets control.
- Save set.
- Complete workout.
- Workout summary.

## Phase 4: Local Workout History

Goal: Persist completed workouts locally and make history review useful.

Deliverables:

- Local database or structured persistence.
- Workout history list.
- Workout detail view.
- Edit/delete workout entries.
- Basic data migration pattern.

## Phase 5: Programs

Goal: Support structured lifting programs.

Deliverables:

- Program templates: Push Pull Legs, Upper Lower.
- Program calendar or weekly schedule.
- Program day detail.
- Attach workouts to program days.
- Mark planned rest days.

## Phase 6: Rest-Day-Aware Streaks

Goal: Track consistency without forcing workout check-ins on planned rest days.

Deliverables:

- Streak calculation rules.
- Rest day support.
- Current streak display.
- Weekly consistency view.
- Missed workout handling.

## Phase 7: Progress Dashboard

Goal: Visualize lifting improvement over time.

Deliverables:

- Stock-chart-like strength trend.
- Time range controls.
- Total volume trend.
- Exercise-specific progress.
- Personal records.
- Program adherence.

## Phase 8: Health and Fitness Integrations

Goal: Connect external health data after the core app works.

Deliverables:

- Apple Health research and permission plan.
- Android Health Connect or Google Fit research and permission plan.
- Fitbit integration research.
- Sync design for external data.
- Initial read-only integration.

## Phase 9: Nutrition Integrations

Goal: Connect food tracking context after workout tracking is useful.

Deliverables:

- Decide which food trackers or APIs to support.
- Define nutrition data model.
- Implement import or connection flow.
- Show nutrition context in progress dashboard.

## Phase 10: Polish and Release Prep

Goal: Prepare for real device testing and eventual release.

Deliverables:

- Error states.
- Empty states.
- Accessibility pass.
- Real-device testing.
- App icons and splash screen.
- Privacy policy.
- Store listing drafts.

