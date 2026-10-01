import { IMPORT_LIMITS, parseProgramImport, type ImportExercise, type ImportOptions, type ParsedProgramImport } from "./importProgram";
import { localDateKey, validateExerciseTarget, validateProgram, type ProgramDay } from "./programModel";

export type WorkoutImportRequest = { text: string; catalog: ImportExercise[]; startDate?: string; options?: ImportOptions; signal?: AbortSignal };
// Future adapters return untrusted data. They cannot request tools, execute code, or save anything.
export type WorkoutExtractor = { extract: (input: { operation: "workout.import"; text: string; signal?: AbortSignal }) => Promise<unknown> };

export async function prepareWorkoutImport(input: WorkoutImportRequest, extractor?: WorkoutExtractor): Promise<ParsedProgramImport> {
  if (!input.text.trim() || input.text.length > IMPORT_LIMITS.characters || input.text.split(/\r?\n/).length > IMPORT_LIMITS.lines) throw new Error("Use workout text within the 30,000 character / 400 line limit.");
  input.signal?.throwIfAborted();
  if (!extractor) return parseProgramImport(input.text, input.catalog, input.startDate, input.options);
  try {
    const candidate = await extractor.extract({ operation: "workout.import", text: input.text, signal: input.signal });
    input.signal?.throwIfAborted();
    return validateExtractedWorkout(candidate, input.catalog, input.startDate ?? localDateKey());
  } catch {
    // Never surface raw provider output/errors as an unrelated-answer or secret channel.
    throw new Error("Could not extract a valid workout. Try local text import or revise the source.");
  }
}

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) throw new Error("Invalid workout format.");
  return value as Record<string, unknown>;
}

/** Fixed schema and catalog-derived names; no model-authored titles, notes, or explanations. */
export function validateExtractedWorkout(candidate: unknown, catalog: ImportExercise[], startDate: string): ParsedProgramImport {
  const root = record(candidate, ["version", "mode", "days"]);
  if (root.version !== 1 || (root.mode !== "weekly" && root.mode !== "cycle") || !Array.isArray(root.days) || root.days.length > 28) throw new Error("Invalid workout format.");
  const sources: ParsedProgramImport["sources"] = {};
  let count = 0;
  const days: ProgramDay[] = root.days.map((value, dayIndex) => {
    const day = record(value, ["kind", "exercises"]);
    if ((day.kind !== "rest" && day.kind !== "training") || !Array.isArray(day.exercises) || day.exercises.length > 100 || (day.kind === "rest" && day.exercises.length)) throw new Error("Invalid workout day.");
    return { id: `extracted-day-${dayIndex}`, name: "", kind: day.kind, exercises: day.exercises.map((value, index) => {
      if (++count > IMPORT_LIMITS.exercises) throw new Error("Too many exercises.");
      const item = record(value, ["exerciseId", "sets", "target"]);
      const exercise = catalog.find((exercise) => exercise.id === item.exerciseId);
      if (!exercise || !Number.isInteger(item.sets) || (item.sets as number) < 1 || (item.sets as number) > 12) throw new Error("Unknown exercise or invalid sets.");
      const target = record(item.target, ["kind", "reps", "min", "max", "seconds"]);
      const allowed = target.kind === "reps" ? ["kind", "reps"] : target.kind === "repRange" ? ["kind", "min", "max"] : ["kind", "seconds"];
      record(target, allowed);
      const validTarget = validateExerciseTarget(target as Parameters<typeof validateExerciseTarget>[0]);
      const id = `extracted-${dayIndex}-${index}`;
      sources[id] = { line: count, text: "Extracted candidate — compare with your original source", query: exercise.name, matched: false };
      return { id, exerciseId: exercise.id, exerciseName: exercise.name, sets: item.sets as number, target: validTarget };
    }) };
  });
  return { draft: validateProgram({ name: "Imported program", schedule: { mode: root.mode, startDate }, days }), sources,
    warnings: ["Model extraction is unverified. Check every exercise, target and rest day against your source. Nothing is saved or activated."] };
}
