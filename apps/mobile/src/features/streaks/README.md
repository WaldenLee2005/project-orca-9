# Streaks Feature

Owns rest-day-aware consistency rules and streak calculations.

- The ordinary streak counts completed workouts and manual/scheduled rest by local calendar date. Completed workouts take precedence over rest on the same date; active/rest counts sum to the current streak. Future dates do not earn credit.
- Program adherence is separate: a missed settled scheduled Training date restarts the active program at its first stored day today. Only a nonempty completion matching that exact program/day on its local completion date satisfies the program; manual rest or unrelated workouts may maintain the ordinary streak but do not prevent program restart. Today and scheduled rest are not misses.
- Schedule reads use reconciled execution revisions for rest protection, shared with Session, Programs and reminders. Unfinished sessions defer restart, and saved templates, actual workouts and earlier rest history stay unchanged. Restart never invents historical workout/rest credit or requires a migration.
