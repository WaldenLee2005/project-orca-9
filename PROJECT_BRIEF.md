# Fitness App Project Brief

## Product Vision

Build a cross-platform mobile fitness app for people who want to track weight lifting without the friction of typing into spreadsheets.

The first version focuses on fast, tap-driven workout logging: choose an exercise, set weight with a horizontal scale or slider-style control, set reps and sets with similar controls, and finish a workout with useful progress saved automatically.

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

1. Tap exercise.
2. Adjust weight.
3. Adjust reps.
4. Adjust sets.
5. Save and move on.

## MVP Scope

The MVP should focus on weight lifting only.

Included:

- React Native with Expo for iOS and Android.
- Basic onboarding.
- Exercise library.
- Tap-first workout logging.
- Slider or horizontal scale controls for weight, reps, and sets.
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
- Favor modular features so separate Codex tasks can build pieces independently.

## Future Chat Context

At the start of future tasks, ask Codex to read:

- `PROJECT_BRIEF.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `DECISIONS.md`
- `FEATURES.md`
- `CHAT_START_PROMPT.md`

Then specify the module for that chat, for example:

> Read the project context files first. In this task, work only on the workout logger module.
