# Fitness App Mobile

Expo Router foundation for the lifting tracker MVP.

## Manual Test

1. Install dependencies:

   ```sh
   npm install
   ```

2. Start Expo:

   ```sh
   npm run start
   ```

3. In the Expo terminal, press:

   - `i` to open the iOS simulator.
   - `a` to open the Android emulator.
   - `w` to open the web preview.

4. Verify the app opens to the Session tab and that each bottom tab switches pages:

   - Session
   - Exercises
   - Programs
   - Progress
   - Profile

5. Open Exercises, search `DB bench`, apply the Chest filter, and open Dumbbell Bench Press. Confirm its image/instructions and use `Use in Session` to open the logger.

6. Save an exercise, open Add Exercise, and search by name, muscle (`quads`), or equipment. An impossible query should show an empty state with Reset search. Verify custom exercises still work.

7. Save a session, reload, and check history and the rest-day-aware streak. In Progress, switch PRs / Avg Weight / Volume, choose a saved lift, and change the range. One session produces one point; two or more produce a line.

8. Confirm Profile still offers optional sign-in and that local workouts/search/charts work without an account.

   Start an empty session and choose **Exit session**. Verify Today offers a fresh start, with no new history or streak credit. Log an exercise, exit again, and verify **Resume workout** preserves the results and program snapshot, including after reload. Try exiting a planned session before any exercises are logged; the saved program must stay unchanged.

9. In Programs, create a named program, add several lifts, change their sets/rep goals, drag a handle to reorder, and try the up/down buttons. Save and reload; the order and targets should remain. Edit and verify invalid/empty targets cannot overwrite the saved version.

10. Start a saved program when no workout is active. Verify the ordered queue, prefilled logger, and actual-result saving. Reload mid-workout to check remaining exercises. Starting another program must leave the active workout untouched.

11. Create a weekly plan with two different training days and rest days. Only Training and Rest should be available, with new days defaulting to Rest. Give each training day different lifts/targets. Save/reload, open the overview, choose **Activate program**, confirm, and verify Session shows today's correct day. Use the ordinary **Start Session** button: today's exercises should already be in the planned queue, with no completed sets. Tap one, record actual results, reload, and check remaining exercises. Repeat with a 4-day cycle. Rest days should protect the streak without manual marking and allow an unplanned workout if desired. Turning a program off or switching programs must preserve an unfinished workout, while future sessions follow the new setting. Shortening days with training/exercises must warn first. Saving alone must not turn the program on.

The streak count includes a muted `(x active / x rest)` subtitle for the current streak only. Multiple workouts on one day count once; completed workouts override same-day rest. Active plus rest counts must equal the streak, including when today is still open.

The prelaunch schema-6 cutover intentionally clears old local programs, workouts, and streaks on the first updated launch. It preserves profile/authentication data and runs only once. Web uses a version marker; native resets training tables transactionally. There is no in-app undo for the old training data. Do not reuse this destructive reset pattern for production upgrades.

12. In a training day, choose **Reps** for a single goal, or **Rep range** for minimum/maximum reps such as 8–12. Use +/− on the single goal and both range bounds; selecting the same type again must not reset its values, and equal range bounds must not switch the selected type. Add a **Timed** plank and use +/− for both minutes and seconds. Inputs remain directly editable; time decrement stops at zero, seconds at 59, and minutes at 60. Save/reload and reorder; targets must remain attached to their exercises. Reversed ranges, blank goals, out-of-bounds reps, seconds above 59, and total durations outside 1–3600 seconds must not save. Start the day, log actual reps and 45 seconds for the plank, then reload mid-session and complete. History should show actual timed work; charts must not treat seconds as reps. Free sessions also offer Reps/Timed logging with the same time steppers. Rest-day protection and optional accounts remain unchanged. No countdown timer is included.

SQLite schema 7 is an additive upgrade from 6: it preserves current programs, workouts, and rest days while adding duration storage. The web training marker remains 6, so this update does not clear current data again.

## Try importing a plan

Open **Programs → Import program**. Paste text, or choose a clear English screenshot (PNG/JPG/WebP). Example syntax:

```text
Program: My plan
Monday - Upper
Arnold Press 3 x 8-12
Plank 2 x 45 sec
Tuesday - Rest
```

Review the extracted source, resolve unmatched lifts, correct sets/reps/time, and acknowledge warnings. Continue to the program builder to set the name, schedule, start date and rest days, then confirm and save. Single workouts propose a 1-day cycle; days omitted from a schedule are proposed as Rest, never silently activated. Saved imports stay OFF and do not affect workout history or streaks. No sample plans are created automatically.

Screenshot OCR runs locally in the browser; first use downloads reading tools from jsDelivr. Text works in Expo Go. Native screenshot OCR needs a rebuilt app containing `modules/orca-ocr` (`npx expo run:ios` with full Xcode, or `npx expo run:android` with the Android SDK). Native compilation/device OCR remains to be tested. See [program import details](src/features/programs/README.md) for limits, supported formats and architecture. There is no LLM, video import or server-side image processing in this prototype.

## Try the local coach prototype

In **Session → Training review → Review → Try coach demo (no saved data)**, try Meeting targets, Three weeks off, Repeatedly hard, and No history. Check Feeling good / Low energy / Pain or illness. The demo uses the real policy engine and can open the real set logger against isolated example data; it never saves programs, workouts, or streaks.

For your own training:

1. In the program editor, turn **Load coaching** on or off once for all program sessions. New programs default off. The Session Log switch overrides it for the whole current workout and survives pause/resume/reload; this does not change the saved program. No per-exercise coaching setup remains.
2. With coaching on, open a planned exercise and check in. Review the explanation before choosing **Use for today**. **Undo suggestion** restores pre-coach values and retains notes. Existing explicit load/equipment settings still support numeric proposals after equipment confirmation. Without them, reviewed shorter-session proposals preserve entered measurements and never guess weights; timed movements stay manual.
3. Record actual weight/reps or time separately for each set. Optional effort is Easy / About right / Hard; warm-up sets are excluded from coaching evidence. Remove sets you did not complete. Saving the exercise alone does not create progression evidence until the session is completed.
4. Complete two recent comparable workouts that meet every target with effort recorded to try progression. Duplicate entries in one session/day do not count twice. After a gap of at least 14 calendar days, an increase is blocked and the coach asks about missing logs. A confirmed break offers one fewer set without increasing baseline load; it does not estimate strength loss.

Prototype thresholds are deliberately explicit heuristics, not validated individualized prescriptions. The optional return-session adjustment is not medical clearance. Policies need qualified fitness review before general release; see the [implementation plan](../../COACH_IMPLEMENTATION_PLAN.md) and its primary references. Rest days protect streaks but do not count as lifting evidence. Cardio cannot refresh another exercise's recency. Missing effort is unknown, never automatically easy.

Native schema 8 adds optional effort, warm-up flags, and prescription snapshots without resetting schema-6/7 data. Web retains the existing training marker and reads older grouped sets without inventing feedback. Charts now use actual individual sets instead of combining maximum reps and weight. Coaching reads up to 120 recent completed sessions. Check-ins are temporary on-device state; there is no cloud health-data upload.

Schema 10 adds a nullable persisted session coaching flag without repeating any reset. Older programs/snapshots preserve their prior load-coaching opt-in and saved metadata; explicit off overrides it. Toggle failures leave the previous saved state intact, with a retryable error.

## Try faster weight and effort entry

Inside a set's weight box, swipe the scale under the fixed marker. It snaps to half-pounds, with distinct marks at 0.5, 1, 5 and 10 lb. Tap the displayed value for exact decimal entry; without eligible history, an untouched blank value stays unchosen, and an existing off-grid weight is preserved until edited. Keyboard arrows and accessible increase/decrease provide alternatives. Select **Skip / Easy / Right / Hard** in the single effort row; Right means the existing About right feedback. Check add/copy/remove, warm-ups, timed sets and optional notes before saving.

The scale starts at the exercise's **Last saved** working-set weight, using the final eligible set of its newest saved exercise entry. This includes actual work saved in an unfinished session, and keeps exact decimals/zero even after a long gap. It works with coaching off. Last saved work replaces untouched program starting weights; manual choices, explicit clearing and copied rows win. Opening exact entry protects that row before typing, including a same-number confirmation. No saved result changes.

The **Recent average** of the last three eligible completed workouts within 90 local days remains available through **Use recent … lb for all sets**. Catalog IDs and trimmed custom names identify repeat lifts; known equipment/conventions must match (unlabelled history matches unlabelled context only). Warm-ups/timed work do not set the default. With no saved working weight, use the program's load or type the first weight and choose **Use … lb for empty sets**; ±5/±10 lb buttons handle larger adjustments.

The **Last saved** and **Recent average** captions and reuse shortcuts sit below the set rows. The browser keeps its scroll position when those shortcuts change, so every scale stays in place while dragging.

Regression checks: keep one finger down through several slow/fast horizontal moves, pause, reverse direction and continue. The scale must keep following until release, with no set-row movement when shortcuts appear. Also make a single short horizontal move and release immediately; the selected half-pound must stay selected. Repeat long/short swipes and vertical scrolling through the box, including native parent scroll interruptions. Reload completed work, reopen the same lift with coaching off and verify the scale starts exactly at its last saved working weight (e.g. 135.25 lb). Save the same lift again in an unfinished session and reopen it; that newer weight must win while the optional average still uses completed workouts. Type or clear a weight before a delayed history read finishes: it must remain unchanged. Add/remove/copy sets and coach apply/undo must preserve measurements and notes; history read failures leave manual entry available.

Phone checks: swipe left/right slowly and quickly, stop between ticks, scroll vertically across the scale, test 0 and 10,000 lb boundaries, type an exact decimal, copy a set, and save/reload. Verify both appearances and narrow/large-text layouts. On rebuilt iOS/Android devices, confirm tick haptics where system/device settings permit them and verify screen-reader actions. Browser checks verify snapping/layout/persistence; physical haptic feel remains a device acceptance check. The new `expo-haptics` native dependency requires rebuilding an existing development build.

The import screen now goes through a provider-independent adapter, still using local text/OCR by default. A fake-provider test suite exercises a strict catalog-ID/target schema and fixed errors. Model-written notes, scripts, extra operations, and arbitrary titles are rejected. No hosted endpoint or API key has been added; authentication, billing quotas, timeout enforcement and provider consent remain release gates before connecting a paid model. Production coaching, permanent program adaptation, full decision-history persistence, equipment substitutions and automatic schedule changes remain future work.

## Try optional set notes

Record a catalog or custom exercise with some sets left without notes. On any set, choose **Add note to self (optional)**, enter multiline text, edit or clear it, and save the exercise. Copying the last set must leave the new set's note empty. Confirm manual reps, timed work, effort and warm-ups still work, and coaching apply/undo retains typed notes.

In the active log, choose **View sets and notes** to add/edit/clear one note. **Cancel** leaves the saved note unchanged; collapsing the section keeps typed drafts. Exit/resume and reload to verify saved notes. Complete the workout, tap it under **Recent sessions**, and review/edit/clear its set notes. Collapse/reopen the session while drafting or saving: text and saved changes must survive. Reload again and confirm unchanged weight/reps/time, totals and charts. Blank notes are optional; long notes stop at 1,000 characters. Check phone layout, keyboard, large text and light/dark appearances on native devices before release.

SQLite schema 9 adds only a nullable set-note column to current schema-6/7/8 training data. Web keeps its existing storage keys/marker. Profile, programs, workouts and rest days survive; private notes are not passed to coaching or social sharing. Automated migration and note CRUD/retry/privacy checks run with isolated test storage.

## Visual checks

The app uses the Native design: system typography, blue actions, flat grouped surfaces, and device-following light/dark appearances. The bottom navigation is edge-to-edge and does not overlap scrolling content. Check all five tabs at phone size in both appearances, including exercise search focus/empty states, individual-set controls, program editor/reordering, import review, the rest-day button, charts, and optional sign-in. Programs contains user-saved plans and opt-in starter templates. This visual update makes no schema or storage changes.

## Starter programs

Open **Programs → Starter programs** and tap a plan. Its read-only overview shows **Activate program** and **Edit program**, followed by every day's exercises, targets and rest days. **Activate program** and confirmation save your own copy starting today and enable its schedule without entering the builder. **Edit program** opens an unsaved editable copy; **Save program** keeps a new copy inactive and returns to its overview. Nothing is saved by browsing. Canceling an edited preset copy requires confirmation; existing programs and workouts stay intact. Saved program cards open the same overview, and their single-day starts, deactivation and deletion remain available.

- Push/Pull/Legs: Monday–Saturday training, Sunday rest; 10–13 working sets per session.
- Upper/Lower: Monday/Tuesday/Thursday/Friday training, Wednesday/Saturday/Sunday rest; 13–16 working sets per session.
- Full Body Every Other Day: A/rest/B/rest, repeating from the chosen start date across calendar weeks; 14 working sets per session. This means 3–4 training days weekly, not exactly twice weekly.

The weekly splits directly cover each major muscle group at least twice. Templates are general starting points, not individualized coaching: weights are unset, working sets exclude warmups, and users can adjust or replace every exercise. [ACSM's resistance-training guidance](https://acsm.org/resistance-training-guidelines-update-2026/) informs the frequency/volume approach; these specific routines are our curated templates, not ACSM-authored programs.

Verify on web and device: save a copy (still OFF), activate it, and start a training day (ordered targets, no completed sets). Scheduled rest needs no logging and is recovered even after time away. A missed training day breaks the streak after local midnight; a later rest day starts a new run rather than bridging that gap. Explicit manual rest marking remains a user override, not an automatic conversion of missed days. Reload to verify persistence. All three presets are tested against both web storage and SQLite; no schema reset is introduced.

## Automated checks

Use Node 24+ for the native TypeScript and in-memory SQLite test harness:

```sh
npm test
npm run typecheck
```

Tests cover Supabase session refresh and guest mode, catalog/search/assets, real SQLite and web progress queries, rest-day streaks, multi-day program CRUD/validation/reordering, the one-time prelaunch reset and profile/auth isolation, weekly/cycle date math (including DST and leap days), activation/history boundaries, day-specific snapshots and actual-vs-planned results, atomic failed writes, corruption handling, flat surfaces, safe-area navigation, and color contrast in both appearances. Test storage and credentials are isolated from the app.

## Attribution

Exercise data by [RepDB](https://repdb.co/free-exercise-dataset).
