# Orca Project Hub

Orca is a mobile lifting tracker built to make workout logging quick at the gym. This hub organizes the work toward a feature-complete first release targeted for **January 4, 2027**. Features should be complete by **December 6, 2026**, leaving December for real gym testing, fixes and release preparation.

The dates are proposed planning targets starting October 5. They assume regular weekly development and access to iOS/Android builds and devices. Store approval and coaching policy review are external release gates. Reassess the target each week as those gates and actual workload become clearer.

## First release scope

- Fast individual-set logging, custom exercises, timed work, pause/resume and offline persistence.
- Completed-workout summaries, full history, details and correction/deletion tools.
- Private workout notes, completion/weekly recaps, elapsed workout time and an adjustable rest timer.
- Searchable exercise library, favorites/recent exercises and reuse of previous actual values.
- Editable starter and custom programs, weekly/cycle schedules, planned rest and adherence history.
- Rest-aware streaks, weekly consistency, progress charts and optional local reminders.
- Reviewed text/screenshot program import with correction before saving.
- Optional accounts, profile photo/privacy settings and a usable guest experience.
- Opt-in local coaching limited to reviewed suggestions for today's workout, with explanations and undo. Qualified policy review and a decision on durable decision history precede release.
- Accessible phone flows, reliable upgrades, beta builds, store assets and support/privacy materials.

Vacation routines, full social feeds, music/supplement tracking, health/nutrition integrations, cloud sync, hosted AI and permanent automatic program adaptation belong to later releases under this proposed plan.

## Requested features

Added October 4, 2026. Proposed placement keeps the January 4 target: notes, recaps, workout time and a rest timer join v1; the larger additions remain in the undated backlog. These are planning targets and can be reprioritized.

| Feature | Release plan | Scope |
| --- | --- | --- |
| Vacation mode | Later | Generate an editable travel routine from available equipment, preserving the regular plan. |
| Notes to self | v1, October 19–November 1 | Private workout notes that persist offline and appear in history. |
| Recaps | v1, November 2–15 | Completion and weekly summaries of actual workouts, progress and time. |
| Feed | Later | Opt-in workout and PR sharing with friends and privacy controls. |
| Music listened to | Later | Record song/playlist metadata with workouts; choose an integration before automatic capture. |
| Supplements | Later | Private user-entered supplement records with amounts, times and notes. |
| Offline mode with reconnect sync | Later | Sync queued account-owned changes after reconnect, handling retries and conflicts. |
| Workout time | v1, October 19–November 1 | Elapsed session time with explicit pause rules, saved into history and recaps. |
| Rest timer | v1, October 19–November 1 | Adjustable countdown between sets, including background/resume behavior. |

Offline logging already works locally. Reconnect sync is new cloud work. Workout elapsed time, timed exercise sets and rest countdowns are separate measurements. The roadmap has 35 tasks: 27 scheduled release items and eight later items. Feed updates the existing social task rather than creating a duplicate.

## Current project state

Status reflects the repository audit on October 4, 2026. Implemented means code exists; it does not establish release or physical-device readiness.

| Area | Current state | Work before release |
| --- | --- | --- |
| Exercise library | 400 licensed bundled exercises, search/filters, details and custom names implemented | Favorites/recent shortcuts and phone usability checks |
| Workout logging | Individual actual sets, weight/reps/time, optional effort/warm-ups and pause/resume implemented | Verify gym logging speed, previous-value reuse and completion summary |
| Workout history | Recent completed-session totals available | Full list, details, correction and deletion |
| Programs | Starter/custom plans, typed targets, weekly/cycle schedules and activation implemented | Historical adherence and integration checks |
| Streaks and progress | Rest-aware streaks, current-week consistency and actual-set charts implemented | Verify metrics after history corrections and device refreshes |
| Reminders | Local scheduling and opt-in settings implemented | Physical-device permissions, delivery and cancellation checks |
| Program import | Reviewed local text/OCR prototype implemented | Native compilation/device OCR and error/correction checks |
| Local coach | Review-only prototype with today-only suggestions and undo | Qualified review, scoped decision persistence and opt-in pilot |
| Accounts | Optional auth, profile/privacy settings and avatar upload coded | Confirm hosted configuration and native account/recovery flows |
| Release setup | Development foundation available | Signed distribution, beta, accessibility, store and support materials |

## Release timeline

The roadmap database holds the detailed tasks, dates, completion gates and acceptance checks. Existing functionality appears above; database rows track the remaining work.

| Dates | Focus | Completion gate |
| --- | --- | --- |
| October 5–11 | Confirm scope and establish native builds | Agreed acceptance checks and first installed iOS/Android builds |
| October 8–November 1 | Fast logging and useful history | Review/correct completed workouts and reuse actual values reliably |
| October 26–November 15 | Data safety, adherence, reminders and import | Preserved data plus device evidence for native features |
| November 9–29 | Narrow coach and optional accounts | Reviewed coach behavior and reliable guest/account flows |
| November 16–December 6 | Accessibility and feature integration | All agreed features pass acceptance checks; freeze December 6 |
| December 7–20 | Real gym beta and release fixes | Testers complete repeated workouts; release-blocking issues resolved |
| December 21–January 3 | Release candidate, store review and buffer | Verified candidate and required approvals |
| January 4 | Target first release | Launch only when release gates pass |

Tasks can overlap. “Depends on” records what must be satisfied before a task is considered complete or its result is released; it is not an automatic rule that work must wait to start.

## Weekly project review

1. Review completed work against each task's acceptance checks.
2. Choose the next three tasks and update their status and dates.
3. Record blockers, including device access, coaching review and store approval.
4. Add new beta findings to the roadmap with a reproduction and severity.
5. Update the repository's roadmap and affected feature notes when scope or implementation changes. Notion dates and statuses are maintained manually; there is no automatic GitHub sync.

## Release checks

- [ ] All agreed v1 features pass their acceptance checks.
- [ ] Existing training data survives upgrades and ordinary retries/restarts.
- [ ] Offline, guest and account flows pass on supported devices.
- [ ] Native OCR and notification checks have recorded device evidence.
- [ ] Shipped coaching policies and explanations have qualified review.
- [ ] Beta reveals no unresolved data loss, crash or blocked-logging defects.
- [ ] Accessibility, privacy/support materials and store assets match the app.
- [ ] Candidate checks pass and required store approvals are confirmed.

## Project references

- [Repository](https://github.com/WaldenLee2005/project-orca-9)
- [Product brief](https://github.com/WaldenLee2005/project-orca-9/blob/main/PROJECT_BRIEF.md)
- [Canonical roadmap](https://github.com/WaldenLee2005/project-orca-9/blob/main/ROADMAP.md)
- [Feature inventory](https://github.com/WaldenLee2005/project-orca-9/blob/main/FEATURES.md)
- [Architecture](https://github.com/WaldenLee2005/project-orca-9/blob/main/ARCHITECTURE.md)
- [Decision log](https://github.com/WaldenLee2005/project-orca-9/blob/main/DECISIONS.md)
- [Coach scope and release gates](https://github.com/WaldenLee2005/project-orca-9/blob/main/COACH_IMPLEMENTATION_PLAN.md)
- [App and device testing guide](https://github.com/WaldenLee2005/project-orca-9/blob/main/apps/mobile/README.md)
