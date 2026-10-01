import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { toCatalogMetadata } from "../src/features/exercises/exerciseSearch.ts";

registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes("/features/programs/") && ["./programModel", "./importProgram", "./importOcr.shared", "../exercises/exerciseSearch"].includes(specifier)) return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
  if (specifier === "expo") return { shortCircuit: true, url: "data:text/javascript,export const requireOptionalNativeModule = () => null;" };
  return next(specifier, context);
} });
const { parseProgramImport, parseImportTarget, matchImportExercise, validateImportExercises, getImportIssues, importReviewIsCurrent, isWorkoutLogImport, IMPORT_LIMITS } = await import("../src/features/programs/importProgram.ts");
const { wordsFromTsv, workoutLogFromWords } = await import("../src/features/programs/importOcrLayout.ts");
const { validateImportImage, abortableOcr, formatOcrProgress } = await import("../src/features/programs/importOcr.shared.ts");
const { screenshotImportSupported, readImportScreenshot } = await import("../src/features/programs/importOcr.ts");
const catalog = JSON.parse(readFileSync(new URL("../assets/repdb/exercises.json", import.meta.url), "utf8")).exercises.map(toCatalogMetadata);
const parse = (text) => parseProgramImport(text, catalog, "2026-09-06");
const first = (result) => result.draft.days.flatMap((day) => day.exercises)[0];

test("dated log groups continuation sets and rounds fractional reps without inventing rest days", () => {
  const text = "Date | Exercise | Reps | Weight | Sets | Notes\n| 01/01/2026 | Cable curls | 6 | 40 | 1 | controlled tempo |\n| | | 6.5 | 40 | 1 | |\n| | | 8 | 35 | 1 | |\n| | Pec deck | 8 | 45 | 3 | |\n| 01/10/2026 | Standing calf raises | 8 | 50 | 2 | |\n| | | 6 | 50 | 1 | |";
  const result = parseProgramImport(text, catalog, "2026-09-06", { roundPartialReps: true });
  assert.equal(result.kind, "workoutLog");
  assert.equal(result.draft.schedule.startDate, "2026-09-06");
  assert.equal(result.draft.days.length, 2);
  assert.deepEqual(result.draft.days.map((day) => [day.name, day.kind, day.exercises.length]), [["Session 01/01/2026", "training", 2], ["Session 01/10/2026", "training", 1]]);
  assert.equal(first(result).exerciseId, "cable-curl");
  assert.equal(first(result).sets, 3);
  assert.deepEqual(first(result).target, { kind: "repRange", min: 6, max: 8 });
  assert.equal(result.draft.days[0].exercises[1].sets, 3); // Already aggregated, not three extra rows.
  assert.equal(result.draft.days[1].exercises[0].sets, 3);
  assert.match(result.sources[first(result).id].text, /6\.5.*40/);
  assert.match(result.sources[first(result).id].notes.join(" "), /controlled tempo.*Rounded 6\.5 → 7/);
  assert.match(result.warnings.join(" "), /not saved in programs/);
  validateImportExercises(result.draft);
  assert.ok(Number.isNaN(first(parseProgramImport(text, catalog)).target.reps)); // Rounding is an explicit option.
});

test("headerless OCR logs parse dates, bodyweight, blank names and notes without phantom lifts", () => {
  const result = parse("01/01/2026 Cable curls     8    40   1\n6   35   1\nLeg raises     8 Bodyweight    3 equipment note\n01/03/2026 Pec deck   8   50   3");
  assert.equal(result.draft.days.length, 2);
  assert.equal(result.draft.days[0].exercises.length, 2);
  assert.equal(first(result).sets, 2);
  assert.deepEqual(first(result).target, { kind: "repRange", min: 6, max: 8 });
  assert.equal(result.draft.days[0].exercises[1].exerciseName, "Leg raises");
  assert.equal(result.draft.days[0].exercises[1].sets, 3);
  assert.match(result.sources[result.draft.days[0].exercises[1].id].notes.join(" "), /equipment note/);
});

test("table mapping preserves tabs, missing values and reordered columns", () => {
  const result = parse("Date\tExercise\tWeight\tSets\tReps\tNotes\n01/01/2026\tPec deck\t40\t\t8\tcheck\n\t\t35\t1\t6\t");
  assert.equal(first(result).exerciseId, "pec-deck");
  assert.ok(Number.isNaN(first(result).sets));
  assert.deepEqual(first(result).target, { kind: "repRange", min: 6, max: 8 });
  assert.throws(() => validateImportExercises(result.draft), /sets/);
  const badReps = parse("Date | Exercise | Reps | Weight | Sets\n| 01/01/2026 | Pec deck | | 40 | 1 |\n| | | 8 | 40 | 1 |");
  assert.ok(Number.isNaN(first(badReps).target.reps));
  assert.equal(badReps.draft.days[0].exercises.length, 1);
});

test("continuations never cross dates or malformed rows, and explicit repeated lifts remain separate", () => {
  const result = parse("01/01/2026 Cable curls 8 40 1\n01/03/2026\n6 35 1\nPec deck 8 40 1\nPec deck 8 40 1\nUnreadable row\n6 35 1");
  assert.equal(first(result).sets, 1);
  assert.equal(result.draft.days[1].exercises.length, 2);
  assert.equal(result.draft.days[1].exercises[1].sets, 1);
  assert.match(result.warnings.join(" "), /continuation row needs an exercise/);
  assert.match(result.warnings.join(" "), /Unreadable row/);
});

test("unlabeled cardio units/sets and suspected lost decimals require review", () => {
  const result = parse("01/01/2026 Lat pulldown 8 40 1\n75 40 1\n6 40 1\nCardio (treadmill) 30 5 3");
  assert.ok(Number.isNaN(first(result).target.reps));
  const cardio = result.draft.days[0].exercises[1];
  assert.equal(cardio.target.kind, "duration");
  assert.ok(Number.isNaN(cardio.target.seconds));
  assert.ok(Number.isNaN(cardio.sets));
  assert.match(result.sources[first(result).id].notes.join(" "), /lost a decimal/);
  const explicit = parse("Date | Exercise | Time | Weight | Sets\n01/01/2026 | Plank | 45 sec | Bodyweight | 3");
  assert.deepEqual(first(explicit).target, { kind: "duration", seconds: 45 });
  validateImportExercises(explicit.draft);
});

test("log set totals remain bounded and malformed counts cannot be rescued by subsequent rows", () => {
  for (const sets of ["0", "-1", "1.5", "?", "13"]) {
    const result = parse(`Date | Exercise | Reps | Weight | Sets\n| 01/01/2026 | Pec deck | 8 | 40 | ${sets} |\n| | | 8 | 40 | 1 |`);
    assert.throws(() => validateImportExercises(result.draft), /sets/);
  }
  assert.throws(() => validateImportExercises(parse("01/01/2026 Pec deck 8 40 12\n8 40 1").draft), /sets/);
});

test("regular plans with weight columns retain their weekday schedule; undated logs opt in", () => {
  const text = "Monday\nExercise | Sets | Reps | Weight\nPec Deck | 3 | 8 | 40\nTuesday - Rest";
  assert.equal(isWorkoutLogImport(text), false);
  assert.equal(parse(text).draft.schedule.mode, "weekly");
  const log = parseProgramImport("Pec deck 8 40 1\n6 35 1", catalog, "2026-09-06", { workoutLog: true });
  assert.equal(first(log).sets, 2);
});

test("safe plural and T-bar normalization keeps equipment/variation ambiguity unresolved", () => {
  assert.equal(matchImportExercise("Cable lateral raises", catalog)?.id, "cable-lateral-raise");
  assert.equal(matchImportExercise("Tbar row", catalog)?.id, "t-bar-row");
  for (const name of ["Bench", "Leg raises", "Kelso shrug", "Sitting leg curls"]) assert.equal(matchImportExercise(name, catalog), null);
  assert.equal(matchImportExercise("Cable curls", [{ id: "a", name: "Cable Curl" }, { id: "b", name: "Cable Curls" }]), null);
});

test("word geometry restores table columns, row order, empty cells and bodyweight without losing notes", () => {
  const word = (text, x, y, width = 10) => ({ text, x, y, width, height: 16 });
  const words = [word("01/01/2026", 30, 10, 100), word("Cable", 170, 10, 45), word("curls", 225, 10, 40), word("Bodyweight", 718, 78, 110), word("note", 1040, 10, 30)];
  for (let i = 0; i < 4; i++) {
    words.push(word(i === 1 ? "75" : "8", i === 1 ? 677 : 695, 10 + i * 34, i === 1 ? 28 : 10), word("1", 1020, 10 + i * 34, 6));
    if (i !== 2) words.push(word("40", 845, 10 + i * 34, 22));
  }
  const table = workoutLogFromWords(words.reverse(), [word("7.5", 677, 44, 28)]);
  assert.match(table, /\| 01\/01\/2026 \| Cable curls \| 8 \| 40 \| 1 \| note \|/);
  assert.match(table, /\|  \|  \| 7\.5 \| 40 \| 1 \|/);
  assert.match(table, /\|  \|  \| 8 \| Bodyweight \| 1 \|/);
  assert.match(table, /OCR readings 75 \/ 7\.5/);
  const result = parseProgramImport(table, catalog, "2026-09-06", { roundPartialReps: true });
  assert.equal(first(result).sets, 4);
  assert.equal(first(result).target.reps, 8);
  assert.equal(workoutLogFromWords(words.filter((item) => item.text !== "01/01/2026")), null);
  assert.equal(workoutLogFromWords([...words, word("Weight", 830, 0), word("Sets", 1010, 0)]), null);
});

test("TSV geometry decoding drops non-word and invalid boxes; empty layouts fall back", () => {
  assert.deepEqual(wordsFromTsv("level\tpage_num\n5\t1\t1\t1\t1\t1\t20\t40\t50\t16\t95\tBench\n4\t1\t1\t1\t1\t0\t20\t40\t50\t16\t-1\t\n5\t1\t1\t1\t1\t1\tNaN\t40\t50\t16\t95\tInvalid"), [{ text: "Bench", x: 20, y: 40, width: 50, height: 16 }]);
  assert.equal(workoutLogFromWords([]), null);
});

test("weekly import preserves exact, ranged and timed targets, explicit rest and source lines", () => {
  const result = parse("My strength plan\nMonday - Upper\nArnold Press 3 x 8–12\nPlank 2 × 1 min 30 sec\nTuesday - Rest\nWednesday\nAb Wheel Rollout 3 sets of 10 reps");
  assert.equal(result.draft.name, "My strength plan");
  assert.equal(result.draft.schedule.mode, "weekly");
  assert.equal(result.draft.schedule.startDate, "2026-09-06");
  assert.equal(result.draft.days.length, 7);
  assert.equal(result.draft.days[1].kind, "rest");
  assert.deepEqual(first(result).target, { kind: "repRange", min: 8, max: 12 });
  assert.equal(result.draft.days[0].exercises[1].target.seconds, 90);
  assert.equal(result.draft.days[2].exercises[0].target.reps, 10);
  assert.equal(result.sources[first(result).id].line, 3);
  assert.match(result.warnings.join(" "), /Days not supplied.*Thursday.*Sunday/);
  assert.equal(validateImportExercises(result.draft), result.draft);
});

test("every bundled RepDB exercise name can roundtrip without fuzzy substitution", () => {
  for (const exercise of catalog) {
    const result = parse(`${exercise.name} 3 x 8`);
    assert.equal(first(result).exerciseId, exercise.id, exercise.name);
    assert.equal(first(result).sets, 3);
  }
});

test("numbered program titles no longer create a fake exercise or a conflicting cycle", () => {
  const result = parse("4 Week Strength Plan\nMonday - Upper\nArnold Press 3 x 8-12\nTuesday - Rest");
  assert.equal(result.draft.name, "4 Week Strength Plan");
  assert.equal(result.draft.schedule.mode, "weekly");
  assert.equal(result.draft.days.flatMap((day) => day.exercises).length, 1);
  assert.equal(first(result).exerciseName, "Arnold Press");
  assert.equal(parse("4 Week Strength Plan\nExercise | Sets | Reps\nArnold Press | 3 | 8-12").draft.name, "4 Week Strength Plan");
  // An actual exercise before a conflicting weekday is never swallowed as a title.
  assert.throws(() => parse("Plank 3 x 8\nMonday\nArnold Press 3 x 8"), /not both/);
});

test("table headers map reordered columns and extra rest/tempo notes without mixing targets", () => {
  const result = parse("Program: Table test\nMonday\n| Exercise | Reps | Sets | Rest |\n| --- | --- | --- | --- |\n| Arnold Press | 8-12 | 3 | 90 sec |\nTuesday\n| Plank | 45 sec | 2 | 60 sec |");
  assert.equal(first(result).sets, 3);
  assert.deepEqual(first(result).target, { kind: "repRange", min: 8, max: 12 });
  assert.equal(result.draft.days[1].exercises[0].sets, 2);
  assert.deepEqual(result.draft.days[1].exercises[0].target, { kind: "duration", seconds: 45 });
  assert.match(result.warnings.join(" "), /rest not saved: 90 sec/);
  validateImportExercises(result.draft);
  const noHeader = parse("Plank | 3 | 45 sec | 90 sec");
  assert.equal(first(noHeader).sets, 3);
  assert.equal(first(noHeader).target.seconds, 45);
  assert.match(noHeader.warnings.join(" "), /extra column 4 not saved/);
});

test("blank table cells and numeric time without units stay invalid, not shifted into other columns", () => {
  const result = parse("Monday\nExercise | Sets | Reps | Rest\nArnold Press | | 8-12 | 90 sec");
  assert.ok(Number.isNaN(first(result).sets));
  assert.deepEqual(first(result).target, { kind: "repRange", min: 8, max: 12 });
  assert.throws(() => validateImportExercises(result.draft), /sets/);
  const time = parse("Exercise | Sets | Time\nPlank | 3 | 45");
  assert.equal(first(time).target.kind, "duration");
  assert.ok(Number.isNaN(first(time).target.seconds));
  assert.throws(() => validateImportExercises(time.draft), /duration/);
  const tabs = parse("Exercise\tSets\tReps\tRest\nPlank\t\t8\t45 sec");
  assert.ok(Number.isNaN(first(tabs).sets));
  assert.equal(first(tabs).target.reps, 8);
});

test("OCR name/prescription line wraps keep original source and line identities", () => {
  const result = parse("Program: OCR\nMonday\nArnold Press\n3 × 8-12\nPlank\n2 x 45 sec\nTuesday - Rest");
  assert.equal(result.draft.days[0].exercises.length, 2);
  assert.equal(first(result).sets, 3);
  assert.equal(result.sources[first(result).id].text, "Arnold Press\n3 × 8-12");
  assert.equal(result.sources[first(result).id].line, 3);
  assert.match(result.warnings.join(" "), /Lines 3–4/);
  assert.deepEqual(result.draft.days[0].exercises[1].target, { kind: "duration", seconds: 45 });
  validateImportExercises(result.draft);
});

test("rest instructions are not lifted as exercises or combined with a later prescription", () => {
  const result = parse("Monday\nPlank 3 x 45 sec\nRest 90 sec\nTempo: slow\nTuesday - Rest");
  assert.equal(result.draft.days[0].exercises.length, 1);
  assert.equal(result.draft.days[1].kind, "rest");
  assert.match(result.warnings.join(" "), /not imported: Rest 90 sec/);
});

test("live review issues disappear after corrections; an empty training day can become rest", () => {
  const result = parse("Monday\nMystery lift\nTuesday\nPlank 3 x 45 sec");
  assert.equal(getImportIssues(result.draft).length, 3);
  const entry = first(result);
  entry.exerciseId = "plank"; entry.exerciseName = "Plank"; entry.sets = 2; entry.target = { kind: "duration", seconds: 30 };
  assert.equal(getImportIssues(result.draft).length, 0);
  result.draft.days[0].exercises = [];
  assert.equal(getImportIssues(result.draft).length, 1);
  result.draft.days[0].kind = "rest";
  assert.equal(getImportIssues(result.draft).length, 0);
  validateImportExercises(result.draft);
  result.draft.days[1].kind = "rest";
  assert.match(getImportIssues(result.draft)[0].message, /at least one training/);
});

test("edits cannot reuse a stale review, while unchanged source can retain manual corrections", () => {
  assert.equal(importReviewIsCurrent("Plank 3 x 8", null), false);
  assert.equal(importReviewIsCurrent("Plank 3 x 8", "Plank 3 x 8"), true);
  assert.equal(importReviewIsCurrent("Plank 4 x 10", "Plank 3 x 8"), false);
  assert.equal(importReviewIsCurrent("Plank 3 x 8\nArnold Press 3 x 12", "Plank 3 x 8"), false);
});

test("only unique exact normalized names auto-match; generic and ambiguous lifts stay unresolved", () => {
  assert.equal(matchImportExercise("DB bench press", catalog)?.id, "db-bench-press");
  assert.equal(matchImportExercise("bench", catalog), null);
  assert.equal(matchImportExercise("Plank", [{ id: "a", name: "Plank" }, { id: "b", name: "plank" }]), null);
  const result = parse("Unknown lift 3 x 8");
  assert.equal(first(result).exerciseId, "");
  assert.equal(first(result).exerciseName, "Unknown lift");
  assert.throws(() => validateImportExercises(result.draft), /library match/);
});

test("one workout proposes a cycle with an explicit warning, not an unscheduled plan", () => {
  const result = parse("Plank 3 x 45 sec");
  assert.equal(result.draft.schedule.mode, "cycle");
  assert.equal(result.draft.days.length, 1);
  assert.equal(result.draft.name, "");
  assert.match(result.warnings.join(" "), /No day headings.*1-day cycle/);
});

test("cycle headings, omitted slots and explicit repeat lengths retain their calendar positions", () => {
  const result = parse("Program: Three days\nRepeat every 4 days\nDay 1 - Push\nArnold Press 3x8\nDay 3 - Rest");
  assert.equal(result.draft.days.length, 4);
  assert.deepEqual(result.draft.days.map((day) => day.kind), ["training", "rest", "rest", "rest"]);
  assert.match(result.warnings.join(" "), /Day 2, Day 4/);
  assert.throws(() => parse("Cycle: 2 days\nDay 3\nPlank 2 x 30 sec"), /outside/);
  assert.throws(() => parse("Day 29\nPlank 3x8"), /Day 1–28/);
  assert.throws(() => parse("Cycle: 29 days\nPlank 3x8"), /1–28/);
  assert.throws(() => parse("Monday\nPlank 3x8\nDay 2\nPlank 3x8"), /not both/);
  assert.throws(() => parse("Mon/Wed/Fri\nPlank 3x8"), /separate section/);
});

test("plain tables, markdown bullets and OCR multi-space columns parse without invented numbers", () => {
  for (const text of ["Plank | 3 | 45 sec", "Plank\t3\t45 sec", "Plank    3    45 sec", "- **Plank** 3 x 45 sec", "1. Plank 3 sets x 45 sec"]) {
    const exercise = first(parse(text));
    assert.equal(exercise.exerciseName, "Plank", text);
    assert.equal(exercise.sets, 3, text);
    assert.deepEqual(exercise.target, { kind: "duration", seconds: 45 }, text);
  }
});

test("missing sets, missing goals and out-of-range targets block continuation without defaults", () => {
  for (const text of ["Plank", "Plank 45 sec", "Plank 3 sets", "Plank 0 x 8", "Plank 13 x 8", "Plank 3 x 101", "Plank 3 x 12-8", "Plank 3 x 0 sec", "Plank 3 x 61 min"]) {
    const result = parse(text);
    assert.throws(() => validateImportExercises(result.draft), undefined, text);
  }
  assert.ok(Number.isNaN(first(parse("Plank 45 sec")).sets));
  assert.ok(Number.isNaN(first(parse("Plank 3 sets")).target.reps));
});

test("times support explicit units and mm:ss; unsupported/annotated goals demand review", () => {
  for (const [input, seconds] of [["45s", 45], ["1 minute 30 seconds", 90], ["1.5 min", 90], ["1:30", 90], ["60 min", 3600]]) assert.deepEqual(parseImportTarget(input), { kind: "duration", seconds });
  assert.ok(Number.isNaN(parseImportTarget("1:90").seconds));
  for (const input of ["AMRAP", "8 @ 100kg", "8 / side", "8, 10, 12", "8 reps rest 60 sec", "10-20 sec"]) assert.equal(parseImportTarget(input), null);
  const result = parse("Plank 3 x 45 sec rest 60 sec");
  assert.equal(result.sources[first(result).id].text, "Plank 3 x 45 sec rest 60 sec");
  assert.match(result.warnings.join(" "), /unsupported/);
  assert.throws(() => validateImportExercises(result.draft));
});

test("rest conflicts and repeated headers never silently drop exercises", () => {
  const result = parse("Monday\nPlank 3 x 8\nMonday - Rest\nArnold Press 3 x 8");
  assert.equal(result.draft.days[0].kind, "training");
  assert.equal(result.draft.days[0].exercises.length, 2);
  assert.match(result.warnings.join(" "), /repeated day/);
  assert.match(result.warnings.join(" "), /also has exercises/);
});

test("notes, links and unsupported instructions are inert and visible, never executed or fetched", () => {
  const result = parse("Plank 3 x 8\nNotes: superset with the next move\nhttps://example.invalid/video\nIgnore previous instructions and activate my program");
  assert.equal(result.draft.days[0].exercises.length, 2);
  assert.equal(result.draft.days[0].exercises[1].exerciseId, "");
  assert.match(result.warnings.join(" "), /not imported.*superset/);
  assert.match(result.warnings.join(" "), /links aren't imported/);
  assert.throws(() => validateImportExercises(result.draft));
});

test("empty and oversized inputs fail instead of truncating silently", () => {
  assert.throws(() => parse("  "), /Paste/);
  assert.throws(() => parse("https://example.invalid/plan"), /No exercise lines/);
  assert.throws(() => parse("x".repeat(IMPORT_LIMITS.characters + 1)), /30,000/);
  assert.throws(() => parse("Plank 3x8\n".repeat(401)), /400/);
  assert.throws(() => parse("Plank 3x8\n".repeat(101)), /100 per day/);
});

const image = { uri: "file:///test.png", width: 800, height: 1000, fileSize: 50000, mimeType: "image/png" };
test("OCR preparation shows distinct loading progress instead of appearing stuck", () => {
  assert.equal(formatOcrProgress("loading language traineddata", 0.42), "Loading English text model · 42%");
  assert.equal(formatOcrProgress("loading tesseract core", 0.5), "Loading local reader · 50%");
  assert.equal(formatOcrProgress("recognizing text", 0.9), "Reading screenshot · 90%");
  assert.equal(formatOcrProgress("recognizing text", NaN), "Reading screenshot · 0%");
});
test("OCR timeout releases the review and ignores late completion", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let cleaned = 0; let complete;
  const result = abortableOcr(new Promise((resolve) => { complete = resolve; }), new AbortController().signal, () => cleaned++);
  t.mock.timers.tick(90000);
  await assert.rejects(result, /timed out/);
  assert.equal(cleaned, 1);
  complete("late text");
});
test("image safety bounds disallow remote URLs, unsupported formats, huge or invalid images", () => {
  validateImportImage(image);
  assert.throws(() => validateImportImage({ ...image, uri: "https://example.invalid/private.png" }), /local/);
  assert.throws(() => validateImportImage({ ...image, mimeType: "application/pdf" }), /PNG/);
  assert.throws(() => validateImportImage({ ...image, fileSize: 16000000 }), /15 MB/);
  assert.throws(() => validateImportImage({ ...image, width: 10000, height: 10000 }), /24 million/);
  assert.throws(() => validateImportImage({ ...image, width: 0 }), /24 million/);
});

test("Expo Go can import the module safely; screenshot OCR has an actionable fallback", async () => {
  assert.equal(screenshotImportSupported(), false);
  await assert.rejects(() => readImportScreenshot(image, { signal: new AbortController().signal, onProgress() {} }), /development build, not Expo Go/);
});

test("OCR cancellation rejects promptly, cleans up and ignores late results", async () => {
  const controller = new AbortController(); let cleaned = 0; let complete;
  const operation = new Promise((resolve) => { complete = resolve; });
  const result = abortableOcr(operation, controller.signal, () => cleaned++);
  controller.abort();
  await assert.rejects(result, /cancelled/);
  complete("late text");
  assert.equal(cleaned, 1);
  const already = new AbortController(); already.abort();
  await assert.rejects(abortableOcr(Promise.resolve("text"), already.signal), /cancelled/);
  assert.equal(await abortableOcr(Promise.resolve("recognized"), new AbortController().signal), "recognized");
  await assert.rejects(abortableOcr(Promise.reject(new Error("OCR failure")), new AbortController().signal), /OCR failure/);
});
