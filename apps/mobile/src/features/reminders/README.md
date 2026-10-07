# Workout reminders

Opt-in local workout, streak, and rest-day notifications for iOS and Android. **Profile → Workout reminders** is available to guests and signed-in users. Preferences and learning use this device's existing workout history; they are not separate per-account histories or cloud-synced settings.

## Timing and consistency

- `reminderPlan.ts` is a pure planner. It learns the local clock time at which sessions were **saved as completed**, not their start time. It takes the latest valid completion on each date from today and the previous 27 local dates, at most 28 samples. Invalid/future completions are excluded. A circular average keeps sessions around midnight near midnight instead of noon.
- Without recent history, the starting workout time is **6:00 PM**. An ambiguous circular average also uses this fallback. Profile lets the user adjust it in 30-minute steps.
- Training days get a reminder **15 minutes before** the learned time and a streak follow-up **2 hours after** it. Both remain on their own date: early reminders clamp to 00:00 and late follow-ups to 23:59. Dates are constructed independently in local time, and offsets use elapsed minutes to handle DST transitions.
- A completed session removes the remaining notices for its local completion date. Manual rest or scheduled rest replaces training/streak notices with one rest notice at **8:00 AM**, adjustable in Profile. Rest dates come from dated program revisions through the reminder horizon, including schedule starts, changes and stops. Past triggers are omitted rather than sent late.
- Refresh reconciles missed program Training dates through the same execution revisions used by Session, Programs and streaks. A restart anchors the first stored day today, preserving earlier rest history and the saved template; unfinished sessions defer it. Today's/future notices follow that new anchor when Orca refreshes. Program adherence remains separate from notification suppression and the ordinary workout/rest streak.
- Today's follow-up may quote the actual contiguous workout/rest streak through yesterday. Future follow-ups use general consistency copy: planned future workouts never count as completed, and no future streak count is invented. Notifications never create workouts, rest records or streak credit.

## Scheduling and persistence

- `reminderService.ts` serializes preference changes and refreshes. `ReminderCoordinator.tsx` refreshes on app launch, resume, training changes, and local-date/timezone-offset changes while foregrounded. Profile focus also refreshes. Notification taps open Session.
- `storage/reminderRepository.ts` reads existing completion timestamps, manual rest dates and schedule revisions from native SQLite or web AsyncStorage. Read failures cancel stale pending reminders and show a retryable error without overwriting training data.
- The operating system receives a rolling **28-calendar-day** plan, at most **56** pending reminders. Open Orca at least every 28 days to replenish it. Already scheduled local notifications do not need background JavaScript, push tokens or a server; learning and schedule changes take effect when Orca refreshes. After travel, reopening Orca updates pending notifications to the new local timezone.
- `reminderScheduler.ts` reconciles only `orca-reminder:` identifiers. It preserves unrelated notifications, cancels obsolete notices and keeps unchanged notices. The small persisted ledger prevents a time adjustment from delivering the same date/kind twice after its earlier trigger elapsed; successful scheduling is recorded incrementally for retries.
- AsyncStorage holds only `orca9.reminderSettings.v1` (enabled, fallback minute, rest minute) and `orca9.reminderLedger.v1` (notification identifiers and trigger timestamps). Settings default off. No database migration or training-data reset is introduced.
- Workout completion, manual rest and program-library writes emit `trainingChanges` only after persistence succeeds. Observer failures cannot fail a saved workout. Foreground presentation checks today's current history again; disabling reminders or losing notification permission cancels Orca's pending notices.

## Platform setup and limits

`notificationClient.ts` uses `expo-notifications` and its app config plugin. Rebuild an existing native app to include the new module/configuration, then enable reminders in Profile and grant system permission. The adapter handles Android channels and iOS provisional authorization, and reports missing native support without crashing. Web has an unsupported adapter and does not request notification permission. See the [Expo SDK 57 notifications documentation](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) for native configuration and permissions.

Orca does not request Android exact-alarm permission. On Android 12+, the installed `expo-notifications` 57.0.21 scheduler falls back to `setAndAllowWhileIdle` when exact alarms are unavailable, so the OS can delay delivery. This is verified in the installed [ExpoSchedulingDelegate.kt](../../../node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/service/delegates/ExpoSchedulingDelegate.kt), `setupAlarm`. Notification permission, Focus modes, channel settings and OS power policies still govern delivery; requested times are not a delivery guarantee.

## Verification

Automated tests cover adaptive timing, midnight/DST transitions, completion/rest suppression, schedule revisions, truthful streak copy, reconciliation/retry behavior, preference/permission handling and existing history reads on web and SQLite. Run the app typecheck and test suite from the repository's verification instructions.

Implementation verification: app typecheck and all 197 tests passed; web, iOS and Android JavaScript exports succeeded; Expo native-module verification found no duplicates. The Profile web fallback was inspected at 375 × 812 with readable content and working scrolling. These checks do not establish physical-device delivery or native permission UI behavior.

Native delivery and permission smoke tests remain pending; this development machine has no usable Xcode simulator. On rebuilt iOS and Android apps verify: first opt-in and denial/re-enable, foreground/background delivery, session completion before the follow-up, manual/scheduled rest, changing/stopping a program, disabling reminders, notification-to-Session navigation, timezone changes and reopening to replenish the horizon. Confirm Android delivery under ordinary battery settings without granting exact-alarm access.
