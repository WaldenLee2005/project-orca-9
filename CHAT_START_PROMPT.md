# Future Chat Starting Prompt

Use this prompt at the start of future project chats.

On this Mac, the repository is `/Users/walden/Documents/ChatGPT/Orca/project-orca-9`. If the chat starts in the parent `Orca` folder, enter `project-orca-9` first. Shared working rules live in `AGENTS.md`.

```text
We are building project-orca-9, a cross-platform React Native + Expo app for fast weight-lifting workout tracking.

Work in /Users/walden/Documents/ChatGPT/Orca/project-orca-9. The app is in apps/mobile; GitHub is https://github.com/WaldenLee2005/project-orca-9. Use this repository, not the parent folder's Git repository.

Before making changes, read:
- AGENTS.md
- PROJECT_BRIEF.md
- ARCHITECTURE.md
- ROADMAP.md
- DECISIONS.md
- FEATURES.md

Use those files as the shared project context. Work only on the module I name in this chat unless the requested change clearly requires a small adjacent update.

As you work, update the Markdown context files when decisions, architecture, roadmap items, feature scope, data models, or module status change. Keep updates concise and durable so future chats can understand what changed without reading the whole codebase.

Preserve existing features, user work, and app data. Historical requests to clear prelaunch data are not permission to reset it again.

After each completed change, run the relevant checks, review the diff, commit the task's code/tests/docs, and push the current task branch to this GitHub repository without waiting for a separate push request, unless I explicitly ask to keep it local. Never include .env, secrets, private data, or generated files; do not commit unrelated work, force-push, or bypass branch protections. If blocked, preserve the work and explain what remains unpushed. Report the branch, commit link, and checks in your final response.

Keep Git metadata focused on the app, without assistant branding, subject to required tool/environment naming rules.

Before committing, verify the repository-local author and committer identity using the Commit attribution instructions in AGENTS.md. Project commits belong to WaldenLee2005 and must use the account's configured GitHub private commit email, not a machine-inferred address.

For this chat, focus on: [replace with module or task].
```

## Maintenance Rules

Update the context docs when any of these change:

- Product direction or target user.
- MVP scope.
- Tech stack or architecture.
- Data model.
- Roadmap order or phase status.
- Feature status.
- Integration strategy.
- Important decisions or tradeoffs.

Prefer small doc updates near the code change. Do not rewrite all context files unless the project direction has genuinely changed.

## Commit and Push Rule

- Every completed, verified change to project code, tests, or documentation must be committed and pushed before reporting completion, unless the user opts out.
- Follow the detailed safe-push workflow in `AGENTS.md`. Failed verification or a blocked push must be reported, not silently ignored.
- This rule is project guidance for future chats, not an installed background auto-push service. Network access, authentication, and required approvals still apply.

## Git Wording Rule

Avoid assistant branding in Git-visible metadata where higher-priority tool/environment requirements permit:

- Branch names.
- Commit messages.
- Pull request titles.
- Pull request descriptions.
- Push-related messages.
