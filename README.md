# project-orca-9

Cross-platform lifting tracker built with React Native and Expo.

The app is focused first on fast weight-lifting logging for people who dislike spreadsheet-style workout tracking. The core Session experience lets a user start a workout, add catalog or custom exercises as they train, adjust sets/reps/weight with thumb-friendly ruler controls, and save exercises into a chronological session log.

## Project Context

Before working on a new module, read these files:

- `AGENTS.md`
- `PROJECT_BRIEF.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `DECISIONS.md`
- `FEATURES.md`
- `CHAT_START_PROMPT.md`

For a new chat, paste the prompt from `CHAT_START_PROMPT.md` and replace its task placeholder. `AGENTS.md` defines the default workflow: verify completed changes, commit the task's code/tests/docs, push to this repository, and report the commit link. Secrets, generated files, and unrelated work stay out of commits; blocked pushes must be reported.

## App

The Expo mobile app lives in:

```text
apps/mobile
```

Useful commands:

```sh
npm --prefix apps/mobile run start
npm --prefix apps/mobile run typecheck
```

## Current Codename

The repository/project codename is `project-orca-9`. The eventual public app name can change later.

## Attribution

Exercise data by [RepDB](https://repdb.co/free-exercise-dataset).
