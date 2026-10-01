import { normalizeSearch } from "../exercises/exerciseSearch";
import { localDateKey, PROGRAM_LIMITS, validateExerciseTarget, validateProgram, WEEKDAYS, type ExerciseTarget, type ProgramDay, type ProgramDraft } from "./programModel";

export const IMPORT_LIMITS = { characters: 30000, lines: 400, exercises: 200, imageBytes: 15 * 1024 * 1024, imagePixels: 24000000 };
export type ImportExercise = { id: string; name: string };
export type ImportSource = { line: number; text: string; query: string; matched: boolean; notes?: string[] };
export type ParsedProgramImport = { draft: ProgramDraft; sources: Record<string, ImportSource>; warnings: string[]; kind?: "workoutLog" };
export type ImportOptions = { workoutLog?: boolean; roundPartialReps?: boolean };

// Deliberately conservative: only a unique, normalized name is accepted automatically.
// Similar names are left for the user to match in the existing exercise browser.
export function matchImportExercise(name: string, catalog: ImportExercise[]) {
  const normalize = (value: string) => normalizeSearch(value).replace(/\b(raises|curls|extensions|deadlifts|squats|shrugs)\b/g, (word) => word.slice(0, -1)).replace(/\btbar\b/g, "t bar");
  const normalized = normalize(name);
  const matches = catalog.filter((exercise) => normalize(exercise.name) === normalized);
  return matches.length === 1 ? matches[0] : null;
}

export function parseImportTarget(input: string): ExerciseTarget | null {
  const text = input.trim().toLowerCase().replace(/[–—−]/g, "-");
  let match = text.match(/^(\d+)\s*-\s*(\d+)\s*(?:reps?)?$/);
  if (match) return { kind: "repRange", min: Number(match[1]), max: Number(match[2]) };
  match = text.match(/^(\d+)\s*(?:reps?)?$/);
  if (match) return { kind: "reps", reps: Number(match[1]) };
  match = text.match(/^(\d+):(\d{2})$/);
  if (match) return { kind: "duration", seconds: Number(match[2]) < 60 ? Number(match[1]) * 60 + Number(match[2]) : NaN };
  match = text.match(/^(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?)\s*)?(?:(\d+)\s*(?:s|sec|secs|seconds?))?$/);
  if (match && (match[1] || match[2])) return { kind: "duration", seconds: Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0) };
  return null;
}

function cleanLine(text: string) {
  return text.trim().replace(/\u00a0/g, " ").replace(/[✕✖]/g, "×").replace(/^#{1,6}\s+/, "").replace(/^[•*\-]\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/\*\*/g, "").trim();
}

const prescriptionPattern = /^(.+?)\s+(\d+)\s*(?:[x×]\s*|sets?(?:\s+of|\s*[x×])?\s+)(.+)$/i;
const standalonePrescription = /^\d+\s*(?:[x×]|sets?\b)/i;
const restDayPattern = /^(?:rest(?: day)?|recovery(?: day)?|off)\.?$/i;
const notePattern = /^(?:notes?\s*:|rest between|rest\s*:?\s*\d|warm[- ]?up\s*:|tempo\s*:|rpe\s*:?\s*\d)/i;

function tableCells(text: string) {
  // Keep empty internal cells so a missing Sets cell cannot shift the Reps/Rest columns.
  return text.includes("|") ? text.replace(/^\s*\||\|\s*$/g, "").split("|").map((cell) => cell.trim()) : text.includes("\t") ? text.split(/\t/).map((cell) => cell.trim()) : text.split(/ {2,}/).map((cell) => cell.trim());
}
type TableColumns = { exercise: number; sets: number; target: number; labels: string[] };
function tableColumns(cells: string[]): TableColumns | null {
  const labels = cells.map((cell) => cell.trim().toLowerCase());
  const exercise = labels.findIndex((label) => /^(?:exercise|exercises|movement|name)$/.test(label));
  const sets = labels.findIndex((label) => /^(?:sets?|set count)$/.test(label));
  const target = labels.findIndex((label) => /^(?:reps?(?:\s*\/\s*time)?|rep range|time|duration|target)$/.test(label));
  return exercise >= 0 && sets >= 0 && target >= 0 ? { exercise, sets, target, labels } : null;
}

function dayHeader(text: string) {
  const week = text.match(/^(monday|mon|tuesday|tues?|wednesday|wed|thursday|thurs?|thu|friday|fri|saturday|sat|sunday|sun)\b\s*(?:[:|–—-]\s*)?(.*)$/i);
  if (week) return { mode: "weekly" as const, index: WEEKDAYS.findIndex((day) => day.toLowerCase().startsWith(week[1].toLowerCase().slice(0, 3))), name: week[2].trim() };
  const cycle = text.match(/^day\s*(\d+)\b\s*(?:[:|–—-]\s*)?(.*)$/i);
  return cycle ? { mode: "cycle" as const, index: Number(cycle[1]) - 1, name: cycle[2].trim() } : null;
}

export function parseProgramImport(text: string, catalog: ImportExercise[], startDate = localDateKey(), options: ImportOptions = {}): ParsedProgramImport {
  if (!text.trim()) throw new Error("Paste a workout or read a screenshot first.");
  if (text.length > IMPORT_LIMITS.characters || text.split(/\r?\n/).length > IMPORT_LIMITS.lines) throw new Error("Import up to 30,000 characters / 400 lines at a time.");
  if (options.workoutLog || isWorkoutLogImport(text)) return parseWorkoutLog(text, catalog, startDate, options);
  const lines = text.split(/\r?\n/).map((raw, index) => ({ text: cleanLine(raw), raw: raw.trim(), line: index + 1 })).filter((line) => line.text);
  const warnings: string[] = [];
  const sources: Record<string, ImportSource> = {};
  const days = new Map<number, ProgramDay>();
  let mode: "weekly" | "cycle" | undefined;
  let current: ProgramDay | undefined;
  let name = "";
  let count = 0;
  let cycleLength = 0;
  let columns: TableColumns | null = null;
  const makeDay = (index: number): ProgramDay => ({ id: `import-day-${index}`, name: "", kind: "rest", exercises: [] });

  for (let position = 0; position < lines.length; position++) {
    const line = lines[position];
    let value = line.text;
    let sourceText = line.raw;
    if (/^https?:\/\//i.test(value)) { warnings.push(`Line ${line.line}: links aren't imported. Paste the workout text instead.`); continue; }
    const cycle = value.match(/^(?:repeat every|cycle:)\s*(\d+)\s*days?\.?$/i);
    if (cycle) { cycleLength = Number(cycle[1]); if (cycleLength < 1 || cycleLength > PROGRAM_LIMITS.days) throw new Error("Use a cycle of 1–28 days."); continue; }
    const header = dayHeader(value);
    if (header) {
      if (header.index < 0 || header.index >= PROGRAM_LIMITS.days) throw new Error(`Line ${line.line}: use Day 1–28.`);
      if (mode && mode !== header.mode) throw new Error(`Line ${line.line}: use either weekdays or numbered days throughout this import, not both.`);
      if (header.mode === "weekly" && /\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i.test(header.name)) throw new Error(`Line ${line.line}: put each weekday and its exercises in a separate section.`);
      mode = header.mode;
      const existing = days.get(header.index);
      current = existing ?? makeDay(header.index);
      if (existing) warnings.push(`Line ${line.line}: repeated day heading; exercises are combined. Check for duplicates.`);
      const isRest = restDayPattern.test(header.name);
      if (isRest && current.exercises.length) warnings.push(`Line ${line.line}: this day also has exercises; kept as Training for review.`);
      current.kind = isRest && !current.exercises.length ? "rest" : "training";
      current.name = isRest ? "" : header.name.slice(0, PROGRAM_LIMITS.name);
      days.set(header.index, current);
      continue;
    }
    if (/^(?:program|plan|workout plan)\s*:/i.test(value)) { name = value.replace(/^[^:]+:\s*/, ""); continue; }
    const nextIsSection = dayHeader(lines[position + 1]?.text ?? "") || tableColumns(tableCells(lines[position + 1]?.text ?? ""));
    if (position === 0 && nextIsSection && !prescriptionPattern.test(value) && !matchImportExercise(value, catalog)) { name = value; continue; }
    const heading = tableColumns(tableCells(value));
    if (heading) { columns = heading; continue; }
    if (/^[-| :]+$/.test(value)) continue;
    if (notePattern.test(value) || /^exercise\s+sets\b/i.test(value)) {
      warnings.push(`Line ${line.line} not imported: ${line.raw}`); continue;
    }
    if (restDayPattern.test(value)) {
      if (!current) { warnings.push(`Line ${line.line}: add a weekday or Day number before this rest day.`); continue; }
      if (current.exercises.length) warnings.push(`Line ${line.line}: rest conflicts with exercises; kept as Training for review.`);
      else current.kind = "rest";
      continue;
    }
    // OCR often puts a lift name and its prescription on adjacent lines. Join only
    // a standalone prescription, retaining both source lines for manual comparison.
    if (!prescriptionPattern.test(value) && tableCells(value).length === 1 && !standalonePrescription.test(value) && standalonePrescription.test(lines[position + 1]?.text ?? "")) {
      const next = lines[++position];
      value = `${value} ${next.text}`; sourceText = `${line.raw}\n${next.raw}`;
      warnings.push(`Lines ${line.line}–${next.line}: joined a wrapped exercise and its prescription. Check their pairing.`);
    }
    const cells = tableCells(value);
    const table = columns && cells.length > Math.max(columns.exercise, columns.sets, columns.target) ? columns : cells.length >= 3 && /^\d+$/.test(cells[1]) ? { exercise: 0, sets: 1, target: 2, labels: [] } : null;
    const prescription = value.match(prescriptionPattern);
    const onlyTarget = prescription ? null : value.match(/^(.+?)\s+(\d+(?:\s*[-–]\s*\d+)?\s*(?:reps?|sec(?:onds?)?|s|min(?:utes?)?))$/i);
    const onlySets = prescription ? null : value.match(/^(.+?)\s+(\d+)\s+sets?$/i);
    const query = (table ? cells[table.exercise] : prescription?.[1] ?? onlyTarget?.[1] ?? onlySets?.[1] ?? value).replace(/[\s:|–—-]+$/, "");
    if (table) cells.forEach((cell, index) => {
      if (cell && ![table.exercise, table.sets, table.target].includes(index)) warnings.push(`Line ${line.line} · ${table.labels[index] || `extra column ${index + 1}`} not saved: ${cell}`);
    });
    if (!current) {
      if (mode) throw new Error(`Line ${line.line}: add a day heading before these exercises.`);
      mode = "cycle"; current = makeDay(0); current.kind = "training"; days.set(0, current);
      warnings.push("No day headings found: proposed a 1-day cycle. Set the actual repeat cycle and rest days in the program builder.");
    }
    if (current.kind === "rest") { warnings.push(`Line ${line.line}: exercises found on a rest day; changed it to Training for review.`); current.kind = "training"; }
    if (++count > IMPORT_LIMITS.exercises || current.exercises.length >= PROGRAM_LIMITS.exercises) throw new Error("Import up to 200 exercises total, with at most 100 per day.");
    const match = matchImportExercise(query, catalog);
    const rawSets = table ? cells[table.sets] : prescription?.[2] ?? onlySets?.[2] ?? "";
    const sets = /^\d+$/.test(rawSets) ? Number(rawSets) : NaN;
    let target = parseImportTarget(table ? cells[table.target] : prescription?.[3] ?? onlyTarget?.[2] ?? "");
    // A numeric Time column without units is ambiguous; never turn it into reps.
    if (table && /^(?:time|duration)$/.test(table.labels[table.target] ?? "") && target?.kind !== "duration") target = { kind: "duration", seconds: NaN };
    const id = `import-exercise-${line.line}`;
    sources[id] = { line: line.line, text: sourceText, query, matched: Boolean(match) };
    current.exercises.push({ id, exerciseId: match?.id ?? "", exerciseName: match?.name ?? query, sets, target: target ?? { kind: "reps", reps: NaN } });
    if (!target) warnings.push(`Line ${line.line}: target missing or unsupported. Enter a rep or time target; any notes, weights, tempo, supersets or per-side instructions need manual review.`);
  }
  if (!count) throw new Error("No exercise lines found. Include exercises with targets, such as Plank 3 x 45 sec.");
  if (mode === "weekly" && cycleLength) throw new Error("A weekly plan cannot also repeat on a numbered-day cycle. Edit the source to choose one.");
  const dayCount = mode === "weekly" ? 7 : Math.max(cycleLength, ...[...days.keys()].map((index) => index + 1));
  if (cycleLength && dayCount > cycleLength) throw new Error("A day number is outside the specified repeat cycle. Check the source text.");
  const missing: string[] = [];
  const orderedDays = Array.from({ length: dayCount }, (_, index) => {
    if (!days.has(index)) missing.push(mode === "weekly" ? WEEKDAYS[index] : `Day ${index + 1}`);
    return days.get(index) ?? makeDay(index);
  });
  if (missing.length) warnings.push(`Days not supplied are proposed as Rest: ${missing.join(", ")}. Confirm or change them in the builder.`);
  if (name.length > PROGRAM_LIMITS.name) warnings.push("Program name shortened to 80 characters.");
  return { draft: { name: name.slice(0, PROGRAM_LIMITS.name), schedule: { mode: mode ?? "cycle", startDate }, days: orderedDays }, sources, warnings };
}

const logDate = /^\d{1,4}[/-]\d{1,2}[/-]\d{2,4}$/;
type LogColumns = TableColumns & { date: number; weight: number };
function logColumns(cells: string[]): LogColumns | null {
  const columns = tableColumns(cells);
  if (!columns) return null;
  const weight = columns.labels.findIndex((label) => /^(?:weight(?:\s*\((?:kg|lbs?)\))?|load)$/.test(label));
  return weight < 0 ? null : { ...columns, weight, date: columns.labels.findIndex((label) => /^(?:date|session)$/.test(label)) };
}

export function isWorkoutLogImport(text: string) {
  return text.split(/\r?\n/).some((line) => (logColumns(tableCells(line))?.date ?? -1) >= 0 || logDate.test(line.trim()) || /^\s*\d{1,4}[/-]\d{1,2}[/-]\d{2,4}\s+.+?\s+\d+(?:\.\d+)?\s+(?:\d+(?:\.\d+)?|bodyweight|bw)\s+\d+\b/i.test(line));
}

function parseWorkoutLog(text: string, catalog: ImportExercise[], startDate: string, options: ImportOptions): ParsedProgramImport {
  const warnings = [
    "Workout log → program draft. Check the column mapping: Reps / Weight / Sets (or edit the table headers). Blank exercise cells continue the preceding exercise only within the same session.",
    "Logged dates label separate sessions, not a repeat schedule. No rest days or calendar gaps are inferred. Choose the actual cycle and rest days in the builder; no workout history or streaks are imported.",
    "Set counts are summed; differing logged reps propose a min–max goal, not a training recommendation. Weights and notes are shown with each source but are not saved in programs.",
  ];
  const result: ParsedProgramImport = { kind: "workoutLog", draft: { name: "", schedule: { mode: "cycle", startDate }, days: [] }, sources: {}, warnings };
  let columns: LogColumns | null = null;
  let current: ProgramDay | undefined;
  let currentDate = "";
  let last: { entry: ProgramDay["exercises"][number]; targets: (ExerciseTarget | null)[] } | undefined;
  let count = 0;
  const newDay = (date: string) => {
    if (result.draft.days.length >= PROGRAM_LIMITS.days) throw new Error("Import up to 28 sessions at a time.");
    current = { id: `import-day-${result.draft.days.length}`, name: date ? `Session ${date}` : "", kind: "training", exercises: [] };
    result.draft.days.push(current); currentDate = date; last = undefined;
  };
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = index + 1, value = raw.trim();
    if (!value || /^[-| :]+$/.test(value)) continue;
    const cells = tableCells(raw);
    const heading = logColumns(cells);
    if (heading) { columns = heading; last = undefined; continue; }
    if (/^(?:program|plan)\s*:/i.test(value)) { result.draft.name = value.replace(/^[^:]+:\s*/, "").slice(0, PROGRAM_LIMITS.name); continue; }
    if (/^notes?\s*:/i.test(value)) { warnings.push(value); continue; }
    if (logDate.test(value)) { if (!current || value !== currentDate) newDay(value); else last = undefined; continue; }
    let date = "", query = "", reps = "", weight = "", sets = "", notes = "";
    if (columns && (raw.includes("|") || raw.includes("\t") || / {2,}/.test(raw))) {
      date = columns.date >= 0 ? cells[columns.date] ?? "" : "";
      query = cells[columns.exercise] ?? ""; reps = cells[columns.target] ?? ""; weight = cells[columns.weight] ?? ""; sets = cells[columns.sets] ?? "";
      notes = cells.flatMap((cell, i) => cell && ![columns!.date, columns!.exercise, columns!.target, columns!.weight, columns!.sets].includes(i) ? [`${columns!.labels[i] || "extra column"}: ${cell}`] : []).join(" · ");
    } else {
      // Headerless OCR/pastes have the explicitly selected Reps / Weight / Sets layout.
      const match = value.match(/^(?:(\d{1,4}[/-]\d{1,2}[/-]\d{2,4})\s+)?(?:(.*?)\s+)?(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?|bodyweight|bw)\s+(\d+)(?:\s+(.*))?$/i);
      if (!match) { warnings.push(`Line ${line} not imported: ${value}. Use Date | Exercise | Reps | Weight | Sets | Notes headers for missing or nonnumeric cells.`); last = undefined; continue; }
      [, date = "", query = "", reps, weight, sets, notes = ""] = match;
    }
    if (date && !logDate.test(date)) { warnings.push(`Line ${line}: unreadable date (${date}); started a separate session for review.`); newDay(date.slice(0, 60)); }
    else if (!current || (date && date !== currentDate)) newDay(date);
    if (!query && !reps && !weight && !sets) { if (notes) warnings.push(`Line ${line}: ${notes}`); if (date) last = undefined; continue; }
    if (query) {
      if (++count > IMPORT_LIMITS.exercises || current!.exercises.length >= PROGRAM_LIMITS.exercises) throw new Error("Import up to 200 exercises total, with at most 100 per day.");
      const match = matchImportExercise(query, catalog);
      const entry = { id: `import-exercise-${line}`, exerciseId: match?.id ?? "", exerciseName: match?.name ?? query, sets: 0, target: { kind: "reps" as const, reps: NaN } };
      current!.exercises.push(entry); last = { entry, targets: [] };
      result.sources[entry.id] = { line, text: "", query, matched: Boolean(match), notes: [] };
    }
    if (!last) { warnings.push(`Line ${line} not imported: ${value}. A continuation row needs an exercise name in this session.`); continue; }
    const source = result.sources[last.entry.id];
    source.text = [source.text, `Line ${line}: ${value}`].filter(Boolean).join("\n");
    if (notes) source.notes!.push(notes);
    const numericSets = /^\d+$/.test(sets) ? Number(sets) : NaN;
    last.entry.sets += numericSets >= 1 && numericSets <= PROGRAM_LIMITS.sets ? numericSets : NaN;
    let target = parseImportTarget(reps);
    if (/^\d+\.\d+$/.test(reps) && options.roundPartialReps) {
      target = { kind: "reps", reps: Math.round(Number(reps)) };
      source.notes!.push(`Rounded ${reps} → ${target.reps} reps (nearest whole rep).`);
    }
    // Cardio numbers often mean time/speed/incline, even in a strength log.
    // Never interpret an unlabeled cardio row as reps or three timed sets.
    if ((/\b(?:cardio|treadmill|running|walking|cycling|elliptical|stairmaster|bike)\b/i.test(source.query) || /^(?:time|duration)$/.test(columns?.labels[columns.target] ?? "")) && target?.kind !== "duration") {
      target = { kind: "duration", seconds: NaN }; last.entry.sets = NaN;
      source.notes!.push("Confirm the duration, units and set count. Cardio columns may mean time, speed or incline; no values were assumed.");
    }
    last.targets.push(target);
    const valid = last.targets.every((goal) => { if (!goal) return false; try { validateExerciseTarget(goal); return true; } catch { return false; } });
    if (!valid) last.entry.target = target?.kind === "duration" ? { kind: "duration", seconds: NaN } : { kind: "reps", reps: NaN };
    else if (last.targets.every((goal) => goal!.kind !== "duration")) {
      const bounds = last.targets.flatMap((goal) => goal!.kind === "reps" ? [goal!.reps] : goal!.kind === "repRange" ? [goal!.min, goal!.max] : []);
      const min = Math.min(...bounds), max = Math.max(...bounds);
      // A lost decimal (e.g. 7.5 → 75) must not quietly produce a huge goal range.
      if (max >= 30 && max > min * 3) { last.entry.target = { kind: "reps", reps: NaN }; source.notes!.push(`Check inconsistent reps (${bounds.join(", ")}); OCR may have lost a decimal.`); }
      else last.entry.target = min === max ? { kind: "reps", reps: min } : { kind: "repRange", min, max };
    } else if (last.targets.every((goal) => goal!.kind === "duration" && goal!.seconds === (last!.targets[0] as { seconds: number }).seconds)) last.entry.target = last.targets[0]!;
    else { last.entry.target = { kind: "duration", seconds: NaN }; source.notes!.push("Different timed targets per set need a single goal selected for this program."); }
  }
  if (!count) throw new Error("No exercise rows found. Use Exercise | Reps | Weight | Sets, with an optional Date and Notes column.");
  Object.values(result.sources).forEach((source) => { source.notes = [...new Set(source.notes)]; });
  return result;
}

export function importReviewIsCurrent(text: string, reviewedText: string | null) { return reviewedText !== null && text === reviewedText; }

export function getImportIssues(draft: ProgramDraft) {
  const issues: { dayId: string; exerciseId?: string; message: string }[] = [];
  draft.days.forEach((day, index) => {
    const label = getImportDayLabel(draft, index);
    if (day.kind === "training" && !day.exercises.length) issues.push({ dayId: day.id, message: `${label}: no exercises. Mark it Rest here or add exercises in the source.` });
    day.exercises.forEach((entry) => {
      if (!entry.exerciseId) issues.push({ dayId: day.id, exerciseId: entry.id, message: `${entry.exerciseName}: choose a library match.` });
      if (!Number.isInteger(entry.sets) || entry.sets < 1 || entry.sets > PROGRAM_LIMITS.sets) issues.push({ dayId: day.id, exerciseId: entry.id, message: `${entry.exerciseName}: choose 1–12 sets.` });
      try { validateExerciseTarget(entry.target); }
      catch { issues.push({ dayId: day.id, exerciseId: entry.id, message: `${entry.exerciseName}: check the rep or time target.` }); }
    });
  });
  if (!draft.days.some((day) => day.kind === "training")) issues.push({ dayId: "", message: "Keep at least one training day with exercises." });
  return issues;
}

function getImportDayLabel(draft: ProgramDraft, index: number) { return draft.schedule.mode === "weekly" ? WEEKDAYS[index] : `Day ${index + 1}`; }

export function validateImportExercises(draft: ProgramDraft) {
  // The next screen owns the program name/schedule. All extracted exercises must be resolved first.
  for (const day of draft.days) for (const exercise of day.exercises) {
    if (!exercise.exerciseId) throw new Error(`Choose a library match for ${exercise.exerciseName}, or remove that line.`);
  }
  validateProgram({ ...draft, name: draft.name || "Import review" });
  return draft;
}
