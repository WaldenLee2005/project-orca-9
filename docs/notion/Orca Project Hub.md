# Orca Project Hub

Orca is a mobile lifting tracker built to make workout logging quick at the gym. The first release targets **January 4, 2027**, including all nine requested features. **Core-flow beta starts November 2, 2026** while development continues. The nine additions target implementation completion by **November 29**, acceptance and feature freeze by **December 6**, and full-feature beta runs **December 7–20**.

The dates are planning targets starting October 5. They assume development capacity and access to iOS/Android builds and devices. Store approval and coaching policy review are external release gates. Reassess workload weekly, especially the late-November overlap of vacation, feed, sync and coaching.

## Roadmap chart

[Open the interactive roadmap](Orca%20Roadmap.html). Hover or focus a node for dates, completion checks and dependencies; open its Notion task for the full record. The main path shows release milestones, with concurrent feature branches joining the freeze. Beta continues while features are added.

<details>
<summary>Release details, feature dates and current state</summary>

## First release scope

- Fast individual-set logging, custom exercises, timed work, pause/resume and offline persistence.
- Completed-workout summaries, full history, details and correction/deletion tools.
- Private workout notes, completion/weekly recaps, elapsed workout time and an adjustable rest timer.
- Vacation routines generated from available equipment, preserving and restoring the regular plan.
- Opt-in friends feed, workout music metadata and private supplement logging.
- Offline logging with account-owned reconnect sync, durable retries and visible conflicts.
- Searchable exercise library, favorites/recent exercises and reuse of previous actual values.
- Editable starter and custom programs, weekly/cycle schedules, planned rest and adherence history.
- Rest-aware streaks, weekly consistency, progress charts and optional local reminders.
- Reviewed text/screenshot program import with correction before saving.
- Optional accounts, profile photo/privacy settings and a usable guest experience.
- Opt-in local coaching limited to reviewed suggestions for today's workout, with explanations and undo. Qualified policy review and a decision on durable decision history precede release.
- Accessible phone flows, reliable upgrades, beta builds, store assets and support/privacy materials.

External health/nutrition integrations, automatic music-provider capture, hosted AI and permanent automatic program adaptation remain later work.

## Requested features

The user confirmed all nine for launch, with beta beginning before all features are finished. Dates below are in **2026**. “Ready for beta” means implemented and checked for inclusion in a beta build; final acceptance includes December integration and device checks.

| Feature | Start | Ready for beta | Scope |
| --- | --- | --- | --- |
| Vacation mode | November 16 | November 29 | Generate an editable travel routine from available equipment, preserving the regular plan. |
| Notes to self | October 19 | November 1 | Private workout notes that persist offline and appear in history. |
| Recaps | November 2 | November 15 | Completion and weekly summaries of actual workouts, progress and time. |
| Feed | November 16 | November 29 | Opt-in workout and PR sharing with friends and privacy controls. |
| Music listened to | November 2 | November 8 | Manually record song/playlist names or links with workouts and retain them in history. |
| Supplements | November 9 | November 15 | Private user-entered supplement records with amounts, times and notes. |
| Offline mode with reconnect sync | November 9 | November 29 | Sync queued account-owned changes after reconnect, handling retries and conflicts. |
| Workout time | October 19 | November 1 | Elapsed session time with explicit pause rules, saved into history and recaps. |
| Rest timer | October 19 | November 1 | Adjustable countdown between sets, including background/resume behavior. |

Offline logging already works locally. Reconnect sync is new cloud work. Workout elapsed time, timed exercise sets and rest countdowns are separate measurements. The roadmap has 35 tasks: 32 scheduled release items and three later items. Feed updates the existing social task rather than creating a duplicate.

Account readiness moves to October 12–25. Define sync ownership, queues, conflicts and the new feature data contracts in early foundation work before sync starts November 9. Early beta includes only ready, checked flows; newly completed features join subsequent builds, and coaching requires its qualified review. All nine join full-feature beta December 7–20.

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
| October 12–25 | Accounts and hosted foundation | Guest/account flows and ownership/security contracts ready for feed and sync |
| October 26–November 1 | Package the first private beta | Installable core build and feedback channel ready |
| October 26–November 15 | Data safety, adherence, reminders and import | Preserved data plus device evidence for native features |
| November 2–December 20 | Rolling real gym beta and fixes | Test the core first; add each ready feature to subsequent builds |
| November 2–29 | Remaining requested features and reviewed coach | Nine requested additions implemented and available for beta by November 29 |
| November 16–December 6 | Accessibility, metrics and feature integration | All v1 acceptance checks pass; freeze December 6 |
| December 7–20 | Full-feature beta and release regression | All nine additions tested together; release-blocking issues resolved |
| December 21–January 3 | Release candidate, store review and buffer | Verified candidate and required approvals |
| January 4 | Target first release | Launch only when release gates pass |

Tasks can overlap. “Depends on” records what must be satisfied before a task is considered complete or its result is released; it is not an automatic rule that work must wait to start.

</details>

## Weekly project review

1. Review completed work against each task's acceptance checks.
2. Choose the next three tasks and update their status and dates.
3. Record blockers, including device access, coaching review and store approval.
4. Add new beta findings to the roadmap with a reproduction and severity.
5. Update the repository's roadmap and affected feature notes when scope or implementation changes. Notion dates and statuses are maintained manually; there is no automatic GitHub sync.

## Release checks

- [ ] All nine requested additions and the other v1 features pass their acceptance checks.
- [ ] Existing training data survives upgrades and ordinary retries/restarts.
- [ ] Offline/reconnect sync, guest/account switching and deletion pass on supported devices.
- [ ] Feed audience permissions, retry-safe publishing and unsharing/deletion preserve privacy.
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
