export type CatalogMetadata = {
  id: string;
  name: string;
  category: string;
  focus: string;
  equipment: string;
  description: string;
  instructions: string[];
  searchText: string;
};

type RepDbExercise = {
  id: string;
  name_en: string;
  category: string;
  body_part: string;
  equipment?: string | null;
  primary_muscles: string[];
  secondary_muscles?: string[];
  description_en: string;
  instructions_en: string[];
};

const bodyParts: Record<string, string> = {
  core: "Core", full_body: "Full Body", back: "Back", chest: "Chest",
  shoulders: "Shoulders", upper_arms: "Arms", lower_arms: "Forearms",
  upper_legs: "Legs", lower_legs: "Calves"
};
const muscleAliases: Record<string, string> = {
  quadriceps: "quads", gluteus_maximus: "glutes", gluteus_medius: "glutes",
  latissimus_dorsi: "lats", pectoralis_major: "chest pecs",
  rectus_abdominis: "abs", transverse_abdominis: "abs",
  gastrocnemius: "calves", soleus: "calves", trapezius: "traps",
  anterior_deltoid: "front delts", lateral_deltoid: "side delts", posterior_deltoid: "rear delts"
};

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\bdb\b/g, "dumbbell").replace(/\bbb\b/g, "barbell")
    .replace(/\brdl\b/g, "romanian deadlift")
    .replace(/\bpullups?\b/g, "pull up").replace(/\bpushups?\b/g, "push up")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function toCatalogMetadata(exercise: RepDbExercise): CatalogMetadata {
  const category = exercise.category === "stretching" ? "Stretches" : bodyParts[exercise.body_part] ?? label(exercise.body_part);
  const equipment = exercise.equipment ? label(exercise.equipment) : "Bodyweight";
  const muscles = [...exercise.primary_muscles, ...(exercise.secondary_muscles ?? [])];
  const focus = exercise.primary_muscles.map(label).join(", ");
  return {
    id: exercise.id, name: exercise.name_en, category, equipment, focus,
    description: exercise.description_en, instructions: exercise.instructions_en,
    searchText: normalizeSearch([
      exercise.id, exercise.name_en, category, equipment, exercise.category,
      ...muscles, ...muscles.map((muscle) => muscleAliases[muscle] ?? "")
    ].join(" "))
  };
}

export function filterExercises<T extends Pick<CatalogMetadata, "category" | "equipment" | "searchText">>(
  exercises: readonly T[], query: string, category: string | null = null, equipment: string | null = null
): T[] {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  return exercises.filter((exercise) =>
    (!category || exercise.category === category) &&
    (!equipment || exercise.equipment === equipment) &&
    tokens.every((token) => exercise.searchText.includes(token))
  );
}
