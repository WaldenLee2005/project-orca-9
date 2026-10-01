# Orca adaptive coach — implementation plan

Status: proposed, September 24, 2026. Planning only; no app behavior or API provider changed.

Prototype update, September 29, 2026: a local review-only slice is implemented: individual sets/effort, optional per-exercise load settings, readiness and gap handling, today-only proposals with undo, a seven-day summary, a no-write coach sandbox, and a validated import adapter using the existing local parser. This is not completion of every milestone below. No hosted model, permanent program adaptation, or production-grade decision audit has been enabled. See `apps/mobile/README.md` for testing instructions and scope.

## 1. Product direction

Build a coach that helps users decide what to do today, adapts to their actual training, and explains suggested changes. Workout import is one capability; automatic weight increases are another, not the entire product.

Keep the core useful offline and without an account. A local, deterministic coaching engine owns progression and recovery rules. An optional model can later extract workouts from text/screenshots and interpret requests within supported actions. It cannot override coaching constraints or write directly to programs or history.

Initial scope: general strength-training support, not medical assessment, rehabilitation, nutrition, or an unrestricted chatbot. Broader populations and specialized programs need separately reviewed policies.

### User-facing actions

- **Import a workout:** text or screenshot → extracted draft → exercise matching and correction → explicit save. No video support.
- **Prepare today's workout:** brief readiness check → proposed session → accept, keep the original, or edit.
- **Review my training:** summarize recent performance and suggest specific, reviewable changes.
- Later: **Shorten today's session**, **Change available equipment**, and **Adjust my schedule** using constrained forms, not open-ended prompts.

## 2. Expected coaching behavior

| Situation | Proposed response |
| --- | --- |
| Recent, repeatable success at the prescribed target | Offer the next appropriate progression step, using available equipment increments. |
| A few weeks without recorded workouts | Freeze increases and ask whether the user actually stopped training or trained elsewhere. |
| User confirms a multi-week break | Offer a conservative return session with reviewable load/volume changes; require fresh performance evidence before progressing again. |
| Training elsewhere but no comparable set data | Record the activity context, but do not invent lift performance or unlock an increase. |
| One difficult session | Hold progression and ask about difficulty; do not automatically overhaul the program. |
| Repeated comparable sessions below target | Suggest a targeted load/volume adjustment and review recovery, rather than continuing to increase. |
| Low readiness or an unusually hard previous session | Offer a lighter or shorter session; keep permanent program changes separate. |
| Pain, injury, or illness reported | Suppress increases and normal progression advice for affected training; explain the limitation and direct the user toward appropriate professional guidance. |
| Planned rest day or deload | Respect it. No catch-up penalty, forced extra workout, or automatic load increase. |
| No reliable history or unfamiliar equipment | Ask for a starting load or a calibration session; never invent one. |
| Little time or missing equipment | Later, offer a bounded session edit with explicit approval, preserving the user's priorities. |

Individualization and consistency should drive the product, rather than a universal increase schedule. This is consistent with the [ACSM 2026 resistance-training guidance](https://acsm.org/resistance-training-guidelines-update-2026/). Conservative return-to-training deserves its own mode; [NSCA/CSCCa transition guidance](https://www.nsca.com/about-us/position-statements/safe-return-to-training/) supports that distinction, but its collegiate-athlete protocols should not be copied into a general app as universal prescriptions.

Exact gap thresholds, progression increments, and return-session reductions are **versioned product policies requiring qualified fitness review**, not medical facts. A provisional 14-day gap can trigger a check-in during prototyping; it must consider the program's cadence and should not imply a particular amount of strength loss. The three-week-break case must block increases regardless of an older pending recommendation.

## 3. What exists, and what must change first

The current app already has weekly/cycle programs, scheduled rest, active-program session prefills, reps/ranges/timed targets, local workout history, streaks, charts, and a reviewed local OCR/text import flow.

Important gaps found in the current implementation:

- `ProgramExercise` has sets and a target but no prescribed load, load unit, or progression policy.
- The logger applies one reps/weight/duration value to every set in an entry. Native storage has set rows, but current exercise reads aggregate counts and maximum values. These summaries cannot represent varied set-level performance accurately.
- Ad hoc exercise selection defaults to 135 lb. That UI default is not evidence and must not become a coaching recommendation.
- Training data is local: native SQLite and web AsyncStorage. Supabase currently handles account/profile features; do not assume a remote coach can already query workout history.
- Existing schedule revisions and workout snapshots protect historical context. Coaching must preserve those boundaries.

### Data additions

| Record | Required information |
| --- | --- |
| Program prescription | Existing sets/rep/time target plus optional load, unit, load convention, and progression settings. |
| Actual set | Actual reps or duration, load/unit, working-set or warm-up status, completion status, performed time; optional effort and skip reason. |
| Equipment profile | Available load steps, per-hand versus total load, machine/variation identity, and whether a value represents resistance or assistance. |
| Readiness check | Timestamp, user-reported readiness, relevant pain/illness flags, time available, and optional explanation for missing logs. |
| Coach preferences | Coaching enabled, goal/experience, equipment, conservative/standard preference, and manual overrides. Guest-compatible on web and native. |
| Coach proposal | Scope, before/after values, reason codes, evidence references, uncertainty, policy version, and freshness metadata. |
| Decision history | Accepted/declined/edited state, applied change, baseline version, and undo information. |

Allow quick “same values for all sets” entry, while making each set editable. Effort can be a simple easy/about right/hard choice initially; detailed reps-in-reserve can be optional. Missing effort is unknown, not automatically easy.

Migrate the current SQLite v7 and web data without clearing history, programs, streaks, or authentication. Expand legacy grouped entries only into the identical sets they actually recorded; mark their origin and leave unrecorded effort unknown. Existing untagged values follow the current lb convention; display conversions must never relabel stored numbers as kg. Update serialization/validation so new fields survive save and reload.

## 4. Local coaching engine

Introduce pure, testable modules under `apps/mobile/src/features/coach/`:

- `coachModel.ts`: context, policy, evidence, and proposal contracts.
- `buildCoachContext.ts`: normalized local history, current prescription, readiness, schedule, and equipment.
- `evaluateCoach.ts`: deterministic decisions and constraint checks.
- `coachReasons.ts`: reviewed explanations rendered from reason codes.
- `coachService.ts`: preparation, review, and controlled application.

Persist preferences/proposals through a new local repository with native/web parity. Avoid coupling guest coaching to account-only profile helpers.

### Decision order

1. Validate units, timestamps, equipment identity, and data completeness.
2. Apply reported pain/illness and other safety-related restrictions.
3. Check training recency, missing evidence, and return-to-training state.
4. Check today's readiness, planned recovery, and repeated difficulty.
5. Only then consider progression.

The same immutable context and policy version should produce the same decision. Inject the clock for predictable tests. Higher-priority restrictions cannot be bypassed by a positive performance trend or a model response.

### Progression and recovery rules

- Use **comparable completed working sets**, not chart maxima, total app activity, or streak length. Distinguish actual exercise completion from simply ending a partially completed session.
- Track recency both overall and per exercise/variation. A treadmill session cannot make stale bench-press evidence current. Scheduled rest is neither a failed workout nor evidence of lifting performance.
- For rep ranges, first build toward the upper end at the current load. Consider a load increase only after repeated qualifying exposures. For exact reps, require repeatable target completion. A prototype rule of two qualifying exposures is a configurable starting heuristic, subject to review.
- Never increase load, sets, and reps together by default. Preserve target semantics and round only to available equipment increments; if no suitable step exists, hold or request review.
- Keep timed, bodyweight, assisted, and conventional weighted exercises as separate modes. First release supports load progression only where load meaning is explicit; other modes remain loggable without unsupported numeric advice.
- A confirmed break enters return-to-training mode and invalidates old increase proposals. Exit requires fresh qualifying exercise exposures and readiness, not merely elapsed days or a preserved streak.
- Treat missed sessions due to scheduling differently from completed sessions that were too difficult. No automatic doubling of workouts to catch up.
- No comparable evidence means calibration or hold, not fabricated certainty. Manual load changes are allowed, recorded as user choices, and not treated as proof of successful performance.

### Proposal lifecycle

Bind each proposal to program/prescription revision, workout-history revision, readiness timestamp, local date, equipment configuration, and policy version. Re-evaluate before applying, including after background/resume and date changes.

Application must be idempotent and serialized. Repeated taps or reviews must not compound increases. Require new qualifying training evidence after the last progression baseline before offering another increase. Use a native transaction and a recoverable, version-checked web write strategy so a crash cannot apply a change twice.

Keep three things distinct:

- **Today's session:** an adjusted prescription snapshot; does not silently rewrite the program.
- **Future program:** a separately confirmed revision, effective going forward.
- **Completed history:** actual performance, never rewritten by coaching.

A load-only program change must not unnecessarily revise the rest-day schedule. Preserve already logged sets in an active session; re-evaluate suggestions only for unlogged work. Undo restores the relevant prescription when versions still match, not historical performance or newer user edits.

## 5. Coach experience

Before a new session, show a short check-in with sensible skip options. Ask about missing logs only when relevant. Skipping a check-in must not be interpreted as confirmation that the user is fully recovered.

Show a small “Today's recommendation” card: proposed changes, the evidence behind them, and **Use this / Keep original / Edit**. For example: “No workouts logged for 21 days. Have you trained elsewhere?” After a confirmed break: “Let's review a return session before increasing your loads.” Do not claim a specific percentage of lost strength.

Starting or resuming a workout must remain possible offline. No model response should block logging. Do not overwrite an active workout with a newly generated program-day template.

After completion, ask for an optional difficulty check and offer a next-session preview. A weekly review can later identify trends, missed sessions, persistent difficulty, and potential schedule improvements. It should avoid extrapolating from sparse data or presenting a plateau diagnosis after a single session.

Default to approval for every prescription change. Consider narrowly scoped opt-in automatic progression only after validation and real-world testing. Return-from-break and safety-related cases remain review-first.

## 6. Model-independent import and AI boundary

Define a provider adapter with named operations such as `extractWorkout`, and later `reviewTraining`. Start with a fake adapter and the current local importer; choose a commercial or self-hosted model later.

`extractWorkout` returns an untrusted candidate, not a saved program. Normalize it into the existing import-review boundary: validate targets/units, match catalog exercises, flag uncertainty, and require correction before saving. Retain the current text/screenshot fallback. Imported prescriptions and sample weights are never completed workout history and never unlock progression.

For coaching, prefer structured context and permitted candidate adjustments over uploading raw notes/history. A model may suggest a permitted action or explain a permitted decision; the local policy checks remain authoritative. Build the first version's explanations locally. Any later model-authored wording needs a separate validated rendering boundary.

### Restricting abuse

Buttons improve UX but are not authorization. The backend must enforce operation-specific schemas. Treat screenshot text, pasted text, titles, notes, and model output as untrusted data. Keep prompts and model settings server-owned; give extraction no tools or direct database writes. Render approved fields, catalog names, and fixed reason codes—not raw output, hidden reasoning, provider errors, or arbitrary generated code. Invalid/off-topic requests get a fixed response. Structured output alone does not prove accuracy or eliminate injection risk. This follows the layered approach in the [OWASP prompt-injection guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).

For future paid calls, use verified authorization, atomic account quotas, in-flight reservations, concurrency limits, payload/image caps, timeouts, bounded retries, idempotency, and a global spending cutoff. IP/device signals supplement account controls; they are not identity proof. The client cannot choose tools, prompts, models, output limits, or billable operations outside the allowlist. These are resource controls separate from model behavior; see [OWASP API resource-consumption guidance](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/).

Recommended initial access policy: accounts remain optional for local training and coaching, but hosted AI calls require sign-in and a quota. Final free allowances can be chosen with the provider. No provider secret belongs in the app bundle or a public environment variable.

Before any hosted integration, add explicit upload consent, minimize transmitted data, decide retention/deletion behavior, and review provider privacy and eligibility terms. Keep raw screenshots/notes out of routine logs. This plan does not authorize transmitting existing user data.

## 7. Delivery milestones

| Milestone | Deliverable and completion criterion |
| --- | --- |
| 1. Contracts and behavior fixtures | Define contexts, policies, proposals, and fake provider. Encode comeback, rest, unknown-history, difficulty, and injection examples before integration. |
| 2. Reliable logging and prescriptions | Editable individual sets, optional effort, explicit load conventions, detailed history reads, and lossless native/web migrations. Existing charts/programs/streaks continue to work. |
| 3. First local coach | Last comparable performance prefills, missing-log check-in, hold/progress rules, and return-to-training mode. Three weeks away cannot produce a load increase. No provider required. |
| 4. Review and controlled application | Today-only versus program changes, explanations, accept/decline/edit, stale-proposal checks, idempotent apply, and undo. Starting/resuming workouts works offline. |
| 5. Import adapter and hosted-call contract | Plug fake extraction into the existing correction flow, test malicious inputs, and define authorization/limits. Actual API deployment and provider choice remain deferred. |
| 6. Broader coaching | Weekly reviews, repeated-difficulty adjustments, planned deload handling, time/equipment constraints, and gradual return progression. Add these only after foundational behavior is validated. |

Milestone 5's contracts can be developed in parallel with logging/coach work. A provider selection must not hold up the first useful coaching release.

**Recommended first shippable slice:** finish milestones 1–4 with a narrow strength-training scope: record real sets, remember the last comparable load, ask about a training gap, prevent stale increases, and offer an approved next workout. Then expand the coach's scope.

## 8. Acceptance tests and release gates

- Successful lift → proposed increase → 21-day break → old proposal rejected; rest days keeping the streak alive do not change the result.
- Recent cardio but no recent bench work → no bench increase based on cardio recency.
- Missing logs → user confirms outside training → no invented sets; preserve uncertainty if comparable lift results are unavailable.
- One easy set followed by missed targets → no progression based on maximum reps or maximum weight from different sets.
- New/custom exercise, changed machine, assistance, mixed lb/kg, missing effort, and invalid/future dates → defined conservative behavior without invented evidence.
- Declining or editing a proposal does not mutate completed history. Repeated review/taps and crash/retry do not increase loads twice.
- New logs, history edits/deletions, program edits, midnight/DST transitions, and resumed stale sessions invalidate affected proposals.
- Rest days, cycle schedules, active-program prefills, duration/range targets, charts, optional accounts, and current import corrections remain intact on web and native.
- Text and screenshot injections, unrelated requests, malformed/oversized results, unknown exercise IDs, and provider failures never produce raw unrelated output or unreviewed writes.
- Hosted contract tests cover forged authorization, direct endpoint calls, concurrent quota use, retry billing, budget exhaustion, and offline fallback before any real provider launch.
- Migration fixtures preserve current data across restart and interrupted writes. No new prelaunch reset.

Before enabling personalized adjustments, review policy thresholds and user-facing safety language with a qualified fitness professional. Begin with internal fixtures and an opt-in review-only pilot; monitor recommendation acceptance, repeated overrides, stale-result rejection, and import correction rates without collecting raw health notes. Do not market the coach as diagnosing injury or guaranteeing safe training loads.
