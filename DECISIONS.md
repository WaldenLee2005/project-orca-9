# Decision Log

## 2026-07-23: Use React Native with Expo

Decision: Build the app with React Native and Expo.

Reason:

- Supports both iOS and Android from one codebase.
- Good development speed for a solo or small-team app.
- Works well for tap-driven custom UI.
- Can add native health integrations later when needed.

Tradeoffs:

- HealthKit, Android Health Connect, Fitbit, and other integrations may require native modules or config plugins.
- Some deep platform-specific features may need custom native code later.

## 2026-07-23: Focus MVP on Weight Lifting

Decision: The MVP is specifically for weight lifting, not all fitness modes.

Reason:

- The clearest user pain is logging lifts without typing into spreadsheets.
- Weight, reps, and sets create a focused first interaction model.
- Program tracking and progress dashboards are natural extensions.

## 2026-07-23: Keep Onboarding Flexible

Decision: Use the planned onboarding structure as a placeholder, but expect it to change.

Reason:

- The core workout logging flow matters more than perfect onboarding at the start.
- Product requirements may evolve after testing the logging experience.

## 2026-07-23: Rest Days Should Count Toward Consistency

Decision: Streak logic must support planned rest days.

Reason:

- Users should not need to falsely check off a workout to preserve a streak.
- Fitness consistency includes recovery.
- Program-aware streaks are more honest and motivating.

## 2026-07-23: Defer Health and Food Integrations

Decision: Integrations are important but should come after the core app works locally.

Reason:

- Apple Health, Fitbit, Health Connect, and food tracker integrations add permission, privacy, and API complexity.
- The app must first prove its core lifting tracker is useful.

