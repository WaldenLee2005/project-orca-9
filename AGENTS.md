# Project instructions

## Context and scope

- This repository is `WaldenLee2005/project-orca-9`; the React Native + Expo app lives in `apps/mobile/`.
- For a new project chat, read `CHAT_START_PROMPT.md`, `PROJECT_BRIEF.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DECISIONS.md`, and `FEATURES.md`. Inspect the relevant implementation and feature README before editing; report discrepancies instead of assuming older plans describe current code.
- Focus on the user's requested task and necessary adjacent changes. Preserve existing user work and current app data. Earlier prelaunch reset requests are historical, not permission for another reset.
- Update affected context documents when implementation, decisions, architecture, feature scope, or status changes. Keep documentation concise and close to the affected feature.

## Finish by committing and pushing

The user gives standing authorization to commit and push completed, verified changes made for their requested project tasks. Do this before the final completion response unless the user explicitly asks to keep the work local, pause, or avoid committing/pushing. This includes documentation-only changes. This is an end-of-task workflow, not a background file watcher or permission to publish unfinished edits.

1. Inspect the working tree, current branch, and origin. The expected origin is `https://github.com/WaldenLee2005/project-orca-9.git` (the equivalent SSH URL is also acceptable). Do not change remotes or push to another repository without approval.
2. Verify in proportion to the change. For app code, run `npm --prefix apps/mobile run typecheck` and `npm --prefix apps/mobile test` (tests require Node 24+). For UI changes, check the affected phone-sized flow; check relevant platform bundles when needed. Documentation-only changes need content/path review and `git diff --check`, not an unnecessary app rebuild.
3. Review and stage the task's intended code, tests, and documentation, including necessary new source files. Do not sweep in unrelated work from other chats or people. Never commit `.env`, credentials, private data, dependency directories, caches, or generated build output. Inspect ignored paths when required source appears missing.
4. Fetch the intended remote and check for divergence. Keep the current task branch unless the user requests another workflow. Do not silently switch branches, discard changes, rewrite shared history, force-push, or bypass protected-branch rules. If conflicts, failed checks, credentials, or permissions prevent a safe push, preserve the work and report what remains local and what is needed.
5. Commit with a descriptive, app-focused message and push the task branch to origin; set its upstream if needed. Do not create/merge pull requests or merge into another branch unless separately requested. Routine commits and pushes need no additional conversational confirmation, but still respect required tool approvals.
6. Verify push success and the local/remote commit relationship. In the final response, include the branch, commit link, verification result, and any unpushed or unrelated remaining changes. Never claim a push succeeded from a local commit alone.

Read-only questions, reviews, and planning do not require empty commits or authorize unrelated changes. If no project files changed, say so rather than manufacturing a commit.

## Git wording

Keep branch names, commit messages, and any requested pull-request metadata focused on the app rather than assistant branding, subject to higher-priority tool or environment requirements. Do not override required branch prefixes.

## Commit attribution

All project commits must be attributed to the user's GitHub account, `WaldenLee2005`. Configure this repository locally with `user.name = WaldenLee2005`, `user.email = 134631614+WaldenLee2005@users.noreply.github.com`, and `user.useConfigOnly = true`. This is the account's ID-based private GitHub commit address; keep configuration scoped to this repository.

Before committing, verify both `git var GIT_AUTHOR_IDENT` and `git var GIT_COMMITTER_IDENT` use that email. Repair missing repository-local configuration before proceeding; never accept a machine-inferred `.local` identity. An explicit environment override must also match the intended account. Keep the normal safe-push rules above for future work.
