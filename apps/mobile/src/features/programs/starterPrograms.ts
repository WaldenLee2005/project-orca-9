import { validateProgram, type ExerciseTarget, type ProgramDraft, type ProgramSchedule } from "./programModel";

type StarterExercise = { readonly exerciseId: string; readonly sets: number; readonly target: Readonly<ExerciseTarget> };
type StarterDay = { readonly name: string; readonly kind: "training" | "rest"; readonly exercises: readonly StarterExercise[] };
export type StarterProgram = {
  readonly id: string;
  readonly name: string;
  readonly mode: ProgramSchedule["mode"];
  readonly cadence: string;
  readonly frequency: string;
  readonly description: string;
  readonly days: readonly StarterDay[];
};

const reps = (exerciseId: string, sets: number, min = 8, max = 12): StarterExercise => ({ exerciseId, sets, target: { kind: "repRange", min, max } });
const training = (name: string, exercises: StarterExercise[]): StarterDay => ({ name, kind: "training", exercises });
const rest = (): StarterDay => ({ name: "Rest", kind: "rest", exercises: [] });
const plank = (sets = 2): StarterExercise => ({ exerciseId: "plank", sets, target: { kind: "duration", seconds: 30 } });
const lowerA = (): StarterExercise[] => [
  reps("squat", 3, 6, 10), reps("romanian-deadlift", 3), reps("leg-extension", 2, 10, 15),
  reps("standing-calf-raise", 3, 10, 15), plank()
];
const lowerB = (): StarterExercise[] => [
  reps("leg-press", 3), reps("seated-leg-curl", 3, 10, 15), reps("leg-extension", 2, 10, 15),
  reps("seated-calf-raise", 3, 10, 15), reps("cable-crunch", 2, 10, 15)
];

// Curated starting templates, not a personalized prescription. Sets are working
// sets; secondary-muscle involvement is not counted as an extra full direct set.
// No weights, coaching configuration, activation, or completion data are seeded.
export const STARTER_PROGRAMS: readonly StarterProgram[] = [
  {
    id: "push-pull-legs", name: "Push / Pull / Legs", mode: "weekly",
    cadence: "6 training days · 1 rest day",
    frequency: "Each major muscle group at least twice a week.",
    description: "Shorter, focused sessions. Push, pull and legs repeat Monday–Saturday, with Sunday off.",
    days: [
      training("Push A", [reps("bench-press", 3, 6, 10), reps("incline-db-press", 2), reps("dumbbell-shoulder-press", 2), reps("lateral-raise", 2, 12, 15), reps("tricep-pushdown", 2, 10, 15)]),
      training("Pull A", [reps("lat-pulldown", 3), reps("wide-grip-seated-cable-row", 3), reps("dumbbell-reverse-fly", 2, 12, 15), reps("bicep-curl", 2, 10, 15)]),
      training("Legs A", lowerA()),
      training("Push B", [reps("db-bench-press", 3), reps("incline-bench-press", 2), reps("dumbbell-shoulder-press", 2), reps("cable-lateral-raise", 2, 12, 15), reps("tricep-pushdown", 2, 10, 15)]),
      training("Pull B", [reps("wide-grip-seated-cable-row", 3), reps("lat-pulldown", 3), reps("dumbbell-reverse-fly", 2, 12, 15), reps("cable-curl", 2, 10, 15)]),
      training("Legs B", lowerB()), rest()
    ]
  },
  {
    id: "upper-lower", name: "Upper / Lower", mode: "weekly",
    cadence: "4 training days · 3 rest days",
    frequency: "Each major muscle group at least twice a week.",
    description: "Train Monday, Tuesday, Thursday and Friday. Wednesday and the weekend are for recovery.",
    days: [
      training("Upper A", [reps("bench-press", 3, 6, 10), reps("wide-grip-seated-cable-row", 3), reps("incline-db-press", 2), reps("lat-pulldown", 2), reps("lateral-raise", 2, 12, 15), reps("bicep-curl", 2, 10, 15), reps("tricep-pushdown", 2, 10, 15)]),
      training("Lower A", lowerA()), rest(),
      training("Upper B", [reps("db-bench-press", 3), reps("lat-pulldown", 3), reps("incline-bench-press", 2), reps("wide-grip-seated-cable-row", 2), reps("dumbbell-shoulder-press", 2), reps("cable-curl", 2, 10, 15), reps("tricep-pushdown", 2, 10, 15)]),
      training("Lower B", lowerB()), rest(), rest()
    ]
  },
  {
    id: "full-body-eod", name: "Full Body Every Other Day", mode: "cycle",
    cadence: "3–4 training days per week",
    frequency: "Full body every other day, not exactly twice a week.",
    description: "A → Rest → B → Rest. This 4-day cycle rolls across weeks, with fewer sets per session and a full rest day between workouts.",
    days: [
      training("Full Body A", [reps("leg-press", 2), reps("romanian-deadlift", 2), reps("bench-press", 2, 6, 10), reps("lat-pulldown", 2), reps("lateral-raise", 1, 12, 15), reps("bicep-curl", 1, 10, 15), reps("tricep-pushdown", 1, 10, 15), reps("standing-calf-raise", 2, 10, 15), plank(1)]),
      rest(),
      training("Full Body B", [reps("squat", 2, 6, 10), reps("seated-leg-curl", 2, 10, 15), reps("db-bench-press", 2), reps("wide-grip-seated-cable-row", 2), reps("dumbbell-shoulder-press", 1), reps("cable-curl", 1, 10, 15), reps("tricep-pushdown", 1, 10, 15), reps("seated-calf-raise", 2, 10, 15), reps("cable-crunch", 1, 10, 15)]),
      rest()
    ]
  }
];

export const STARTER_GUIDANCE = "Working sets only; warm up separately. Choose a comfortable load that leaves about 2–3 reps in reserve. Rest roughly 2–3 minutes on compound lifts and 1–2 minutes on accessories. Adjust exercises and volume to your experience and recovery; don't train through pain.";

/** A fresh, unsaved copy. Catalog names stay in sync with search and the logger. */
export function createStarterProgram(
  starterId: string, startDate: string, catalog: readonly { id: string; name: string }[], createId: (prefix: string) => string
): ProgramDraft {
  const starter = STARTER_PROGRAMS.find((item) => item.id === starterId);
  if (!starter) throw new Error("That starter program is unavailable.");
  const names = new Map(catalog.map((item) => [item.id, item.name]));
  return validateProgram({
    name: starter.name, schedule: { mode: starter.mode, startDate },
    days: starter.days.map((day) => ({
      id: createId("program-day"), name: day.name, kind: day.kind,
      exercises: day.exercises.map((entry) => {
        const exerciseName = names.get(entry.exerciseId);
        if (!exerciseName) throw new Error("A starter exercise is unavailable. Please update the exercise library.");
        return { ...entry, id: createId("program-exercise"), exerciseName, target: { ...entry.target } };
      })
    }))
  });
}

export function starterSetSummary(starter: StarterProgram) {
  const counts = starter.days.filter((day) => day.kind === "training").map((day) => day.exercises.reduce((total, entry) => total + entry.sets, 0));
  const min = Math.min(...counts), max = Math.max(...counts);
  return `${min === max ? min : `${min}–${max}`} working sets / session`;
}
