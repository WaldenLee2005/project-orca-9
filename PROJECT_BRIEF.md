# project-orca-9 Project Brief

## Product Vision

Build a cross-platform mobile lifting app for people who want to track weight training without the friction of typing into spreadsheets.

The first version focuses on fast, tap-driven session logging: start a session, add exercises as the workout happens, set weight/reps/sets with thumb-friendly ruler controls, save each exercise into a chronological session log, and keep moving.

Long term, the app should help users manage lifting programs, understand strength progress, maintain realistic streaks that respect rest days, and optionally connect with health and nutrition data sources.

## Target User

The initial user is a weight lifter who:

- Tracks lifts but dislikes spreadsheet-style logging.
- Wants a faster mobile-first logging flow at the gym.
- Follows programs such as Push Pull Legs or Upper Lower.
- Cares about progressive overload and strength improvement.
- Wants streaks that count planned rest days correctly.
- May eventually want integrations with Apple Health, Fitbit, and food trackers.

## Core Problem

Most workout trackers are either too manual, too spreadsheet-like, or too noisy. The app should make the main gym flow feel quick:

1. Start a session.
2. Add an exercise from the catalog or enter a custom exercise name.
3. Adjust sets, reps, and weight with ruler-style controls.
4. Save the exercise into the session log.
5. Repeat in chronological order until the workout is done.

## MVP Scope

The MVP should focus on weight lifting only.

Included:

- React Native with Expo for iOS and Android.
- Basic onboarding.
- Exercise library backed by licensed local still images.
- Tap-first active session logging.
- Custom exercise entry when the catalog is missing a movement.
- Ruler-style controls for weight, reps, and sets.
- Chronological in-session exercise log.
- Swipe-to-delete saved exercise rows.
- Workout history.
- Basic lifting progress dashboard.
- Program tracking foundation.

Deferred:

- Apple Health integration.
- Fitbit integration.
- Food tracker integration.
- Social features.
- AI-generated workout plans.
- Trainer/client management.

## Onboarding

Keep onboarding flexible for now. The current assumed flow:

- Name or nickname.
- Goal: build muscle, get stronger, lose fat, maintain, improve general fitness.
- Experience level.
- Available equipment.
- Preferred lifting schedule.
- Optional body metrics.

This may change later as the product becomes clearer.

## Product Principles

- Logging should be faster than typing into a spreadsheet.
- Gym use matters: controls should be thumb-friendly, glanceable, and usable while tired.
- Rest days should not punish streaks.
- Progress should be motivating without becoming noisy.
- Start local and simple; add integrations after the core logging loop works.
- Favor modular features so separate work sessions can build pieces independently.

## Future Chat Context

At the start of future work sessions, read:

- `PROJECT_BRIEF.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `DECISIONS.md`
- `FEATURES.md`
- `CHAT_START_PROMPT.md`

Then specify the module for that chat, for example:

> Read the project context files first. In this task, work only on the workout logger module.
