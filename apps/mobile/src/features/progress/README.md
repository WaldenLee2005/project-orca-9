# Progress Feature

The dashboard is restored from `progress-dashboard-charts` and reads completed local sessions without requiring an account.

- PRs: running heaviest actual weight from completed rep sets, regardless of rep count and including warm-ups. Exact saved weight and actual reps identify the source set; no estimate or multiplier is used. Timed sets and unfinished workouts remain excluded. Without completed rep sets, the chart prompts the user to log weights.
- `getProgressPersonalRecordSeries` reads the heaviest eligible set per completed session on web/SQLite without a history cap. `getRunningPrSeries` calculates running records before the chart's date filter; current and previous records retain full-history results and their source sets even outside 1M/3M. The previous estimated-strength API remains available but is not used by PRs.
- Avg Weight: total volume divided by completed reps (rep-weighted).
- Volume: sum of weight × reps across sets.
- All Lifts shows the highest actual weight across exercises with its source exercise visible. Choosing a saved catalog/custom lift isolates its history; 1M, 3M, and All ranges control visible dates.
- Focus/refresh reloads ignore superseded requests. Empty, single-point, and multi-point chart states are supported.

Owns lifting trends, dashboard metrics, personal records, and time range views.
