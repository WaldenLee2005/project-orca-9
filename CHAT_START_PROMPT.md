# Future Chat Starting Prompt

Use this prompt at the start of future Codex chats for this project.

```text
We are building project-orca-9, a cross-platform React Native + Expo app for fast weight-lifting workout tracking.

Before making changes, read:
- PROJECT_BRIEF.md
- ARCHITECTURE.md
- ROADMAP.md
- DECISIONS.md
- FEATURES.md

Use those files as the shared project context. Work only on the module I name in this chat unless the requested change clearly requires a small adjacent update.

As you work, update the Markdown context files when decisions, architecture, roadmap items, feature scope, data models, or module status change. Keep updates concise and durable so future chats can understand what changed without reading the whole codebase.

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

