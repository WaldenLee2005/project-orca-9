# Progress Feature

Owns lifting trends, dashboard metrics, personal records, and time range views.

Current implementation:

- The Progress tab defaults to PRs as a running best estimated one-rep max from completed sessions.
- Average Weight is available as a separate per-session intensity tab.
- Volume is available as a secondary workload tab.
- All Lifts mode uses each session's best estimated one-rep max set for the PR trend.
- Lift-specific mode filters by catalog exercise id or normalized custom exercise name.
- Exercise selection opens a picker styled like the Session exercise picker, using saved lifts.
- Data comes from the workout repository instead of a separate analytics store.
