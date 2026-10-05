# Storage

Local-first persistence boundary.

Current implementation:

- Expo SQLite database: `orca9.db` on native builds.
- Web development stores workout sessions in AsyncStorage under `orca9.workoutSessions` so the browser build can log without waiting on SQLite.
- Repositories for user profiles and workout logging.
- Tables for `user_profiles`, `workout_sessions`, `workout_exercises`, and `set_entries`.
- Local profile rows include auth user id, email, handle, avatar URL, and profile visibility for the social/account foundation.
- The current local profile is cached in memory after the first read/write; clear the cache on sign-out.
- Actual individual sets are saved as one `set_entries` row each; existing grouped web entries remain readable.
- Native schema 9 adds nullable `set_entries.note` without resetting current training/profile data. Web keeps its existing key and schema marker. Optional notes are trimmed and limited to 1,000 characters; omitted/blank notes become null.
- `getWorkoutSessionExercises` supports active/completed review; serialized `updateWorkoutSetNote` edits or clears one set without changing measurements, completion timestamps, prescriptions or schedules. Missing targets and failed reads/writes surface errors; private notes are excluded from coaching history.
- Active workout saves batch set-entry inserts and avoid reloading the full session after each write.
- Saving a session marks `workout_sessions.completed_at`, leaving completed workout data available for history and progress charts.
- Database initialization times out and resets the shared open promise if SQLite stalls, allowing later retries instead of trapping workout actions in a pending state.
- `reminderRepository.ts` reads existing completed-session timestamps, manual rest dates and program schedule revisions from SQLite/web storage. Invalid or failed reads surface an error so reminders can remove stale notices without overwriting history; no schema migration or reset is added.
- Reminder preferences and the small delivery ledger use AsyncStorage keys `orca9.reminderSettings.v1` and `orca9.reminderLedger.v1`. They belong to this device's existing training history, not a separate signed-in account; no workout details or push tokens are copied into them.
- `trainingChanges.ts` notifies reminder observers after successful workout completion, manual rest and program-library writes. Observer errors never fail the underlying saved training action. See `../features/reminders/README.md` for the scheduling boundary.

Storage-size rules:

- Keep user-generated records normalized and compact.
- Store ids, timestamps, text snapshots, and numeric set values only.
- Do not store exercise image blobs in SQLite; catalog images remain bundled app assets.
- Run lightweight SQLite compaction after deletes.

Future sync should treat local SQLite as the phone source of truth and add optional cloud backup/cross-device continuity later.
