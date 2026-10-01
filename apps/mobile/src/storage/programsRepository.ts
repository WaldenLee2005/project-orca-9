import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { isScheduleRevision, parseTrainingProgram, reviseSchedule, validateProgram, type ProgramDraft, type TrainingProgram, type ScheduleRevision } from "../features/programs/programModel";
import { createLocalId, getDatabase } from "./database";
import { ensureWebTrainingStorage } from "./trainingStorage";

const LIBRARY_KEY = "orca9.programLibrary.v3";
type ProgramLibrary = { version: 3; programs: TrainingProgram[]; history: ScheduleRevision[] };
let writeQueue: Promise<unknown> = Promise.resolve();

function serializeWrite<T>(action: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(action);
  writeQueue = result.catch(() => {});
  return result;
}

function parsePrograms(value: unknown): TrainingProgram[] {
  if (!Array.isArray(value)) throw new Error("Invalid program library");
  const programs = value.map(parseTrainingProgram);
  if (programs.some((program) => !program) || new Set(programs.map((program) => program!.id)).size !== programs.length) throw new Error("Invalid program library");
  return programs as TrainingProgram[];
}

// Commit templates and schedule history together; only the current format is supported.
async function readLibrary(): Promise<ProgramLibrary> {
  let stored: string | null;
  if (Platform.OS === "web") {
    await ensureWebTrainingStorage();
    stored = await AsyncStorage.getItem(LIBRARY_KEY);
  }
  else stored = (await (await getDatabase()).getFirstAsync<{ data_json: string }>("SELECT data_json FROM program_library WHERE id = 1;"))?.data_json ?? null;
  try {
    if (stored !== null) {
      const value = JSON.parse(stored);
      if (value?.version !== 3 || !Array.isArray(value.history) || !value.history.every(isScheduleRevision) ||
        value.history.some((item: ScheduleRevision, index: number) => index > 0 && item.effectiveFrom <= value.history[index - 1].effectiveFrom)) throw new Error("Invalid schedule history");
      const programs = parsePrograms(value.programs);
      const activeId = value.history.at(-1)?.programId;
      if (activeId && !programs.some((program) => program.id === activeId)) throw new Error("Missing active program");
      return { version: 3, programs, history: value.history };
    }
    return { version: 3, programs: [], history: [] };
  } catch { throw new Error("Your saved programs or schedule could not be read. Nothing has been overwritten."); }
}

async function writeLibrary(library: ProgramLibrary) {
  const value = JSON.stringify(library);
  if (Platform.OS === "web") await AsyncStorage.setItem(LIBRARY_KEY, value);
  else await (await getDatabase()).runAsync("INSERT INTO program_library (id, data_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json;", [value]);
}

export async function getProgramLibrary() {
  const library = await readLibrary();
  return { programs: library.programs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), activeProgramId: library.history.at(-1)?.programId ?? null };
}

export async function getTrainingPrograms() { return (await getProgramLibrary()).programs; }
export async function getTrainingProgram(id: string) { return (await getTrainingPrograms()).find((program) => program.id === id) ?? null; }
export async function getProgramScheduleHistory() { return (await readLibrary()).history; }

export function saveTrainingProgram(input: ProgramDraft): Promise<TrainingProgram> {
  const draft = validateProgram(input);
  return serializeWrite(async () => {
    const library = await readLibrary();
    const existing = draft.id ? library.programs.find((program) => program.id === draft.id) : null;
    if (draft.id && !existing) throw new Error("That program no longer exists. Return to Programs and create a new one.");
    const now = new Date().toISOString();
    const program: TrainingProgram = { ...draft, id: existing?.id ?? createLocalId("program"), createdAt: existing?.createdAt ?? now, updatedAt: now };
    if (library.history.at(-1)?.programId === program.id) library.history = reviseSchedule(library.history, program);
    library.programs = [program, ...library.programs.filter((entry) => entry.id !== program.id)];
    await writeLibrary(library);
    return program;
  });
}

export function setActiveTrainingProgram(id: string | null) {
  return serializeWrite(async () => {
    const library = await readLibrary();
    const program = id ? library.programs.find((item) => item.id === id) : null;
    if (id && !program) throw new Error("That program no longer exists.");
    if (program) validateProgram(program);
    library.history = reviseSchedule(library.history, program ?? null);
    await writeLibrary(library);
  });
}

export function deleteTrainingProgram(id: string) {
  return serializeWrite(async () => {
    const library = await readLibrary();
    if (library.history.at(-1)?.programId === id) library.history = reviseSchedule(library.history, null);
    library.programs = library.programs.filter((program) => program.id !== id);
    await writeLibrary(library);
  });
}
