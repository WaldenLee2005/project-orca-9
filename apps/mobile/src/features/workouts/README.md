# Workouts Feature

Owns active workout sessions, set entries, exercise order, notes, and completed workout summaries.

- Today follows the active program's current local weekday/cycle day when starting a workout, with its planned exercises and targets ready to log. Rest days and future program starts use manual tracking.
- **Start without program** offers a manual workout on a scheduled training day without changing the active program. Unfinished sessions always resume with their original snapshot. **Change or deactivate program** opens Programs; deactivation returns future starts to normal tracking.
- Schedule and streak refresh together on focus, resume, date rollover and successful training writes, with stale-request protection. Planned exercises do not count as actual sets; only completed sessions earn workout streak credit and cancel the day's remaining reminders.
