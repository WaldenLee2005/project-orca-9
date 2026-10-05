# Workouts Feature

Owns active workout sessions, set entries, exercise order, notes, and completed workout summaries.

- Every actual rep or timed set has a collapsed **Add note to self (optional)** editor. Multiline notes are private and limited to 1,000 characters; saving without a note requires no extra action. Copying the last set keeps its measurements but starts with no note. Coach apply/undo and changed suggestions retain typed notes.
- **View sets and notes** in the active log, or tap a recent completed session on Today, to review actual sets and add/edit/clear notes. Saved edits use explicit **Save note**, **Cancel** and **Clear note** actions. Collapsing either section keeps an unsaved draft; failed saves retain the original stored note and offer retry.
- Notes persist offline on SQLite and web storage with no account required. Native schema 9 adds nullable `set_entries.note` to existing schema-6/7/8 data without another reset. Blank text becomes null; only the selected set's note and update timestamps change. Notes are excluded from coaching inputs and social publishing.

- **Exit session** is visible at the top of the session log. An empty unfinished workout is cancelled without recording completion or rest, so a fresh workout can start. Planned targets are not saved results; cancelling their empty session leaves the program unchanged. Workouts with logged exercises return to Today with **Resume workout**, preserving their results and plan snapshot. Failed cancellation keeps the session open for retry; storage guards and serialized writes protect concurrent saves and completed/nonempty sessions.
- Today follows the active program's current local weekday/cycle day when starting a workout, with its planned exercises and targets ready to log. Rest days and future program starts use manual tracking.
- **Start without program** offers a manual workout on a scheduled training day without changing the active program. Unfinished sessions always resume with their original snapshot. **Change or deactivate program** opens Programs; deactivation returns future starts to normal tracking.
- Schedule and streak refresh together on focus, resume, date rollover and successful training writes, with stale-request protection. Planned exercises do not count as actual sets; only completed sessions earn workout streak credit and cancel the day's remaining reminders.
