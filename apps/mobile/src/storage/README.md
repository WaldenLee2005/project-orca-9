# Storage

Local-first persistence boundary.

Current implementation:

- Expo SQLite database: `orca9.db` on native builds.
- Web development stores workout sessions in AsyncStorage under `orca9.workoutSessions` so the browser build can log without waiting on SQLite.
- Repositories for user profiles and workout logging.
- Tables for `user_profiles`, `workout_sessions`, `workout_exercises`, and `set_entries`.
- Local profile rows include auth user id, email, handle, avatar URL, and profile visibility for the social/account foundation.
- The current local profile is cached in memory after the first read/write; clear the cache on sign-out.
- Saved aggregate exercises are expanded into one `set_entries` row per set.
- Active workout saves batch set-entry inserts and avoid reloading the full session after each write.
- Saving a session marks `workout_sessions.completed_at`, leaving completed workout data available for history and progress charts.
- Database initialization times out and resets the shared open promise if SQLite stalls, allowing later retries instead of trapping workout actions in a pending state.

Storage-size rules:

- Keep user-generated records normalized and compact.
- Store ids, timestamps, text snapshots, and numeric set values only.
- Do not store exercise image blobs in SQLite; catalog images remain bundled app assets.
- Run lightweight SQLite compaction after deletes.

Future sync should treat local SQLite as the phone source of truth and add optional cloud backup/cross-device continuity later.
