# Storage

Local-first persistence boundary.

Current implementation:

- Expo SQLite database: `orca9.db`.
- Repositories for user profiles and workout logging.
- Tables for `user_profiles`, `workout_sessions`, `workout_exercises`, and `set_entries`.
- Local profile rows include auth user id, email, handle, avatar URL, and profile visibility for the social/account foundation.
- Saved aggregate exercises are expanded into one `set_entries` row per set.

Storage-size rules:

- Keep user-generated records normalized and compact.
- Store ids, timestamps, text snapshots, and numeric set values only.
- Do not store exercise image blobs in SQLite; catalog images remain bundled app assets.
- Run lightweight SQLite compaction after deletes.

Future sync should treat local SQLite as the phone source of truth and add optional cloud backup/cross-device continuity later.
