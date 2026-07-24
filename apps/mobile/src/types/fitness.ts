export type FitnessGoal = "build_muscle" | "get_stronger" | "lose_fat" | "maintain" | "general_fitness";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type ProfileVisibility = "private" | "friends" | "public";

export type UserProfile = {
  id: string;
  authUserId?: string;
  email?: string;
  handle?: string;
  displayName: string;
  avatarUrl?: string;
  profileVisibility: ProfileVisibility;
  goal: FitnessGoal;
  experienceLevel: ExperienceLevel;
  availableEquipment: string[];
  preferredSchedule: string[];
};

export type Exercise = {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  instructions: string[];
};

export type SetEntry = {
  id: string;
  weight: number;
  reps: number;
  setNumber: number;
  completedAt: string;
};

export type WorkoutExercise = {
  id: string;
  exerciseId: string;
  order: number;
  sets: SetEntry[];
};

export type WorkoutSession = {
  id: string;
  startedAt: string;
  completedAt?: string;
  programDayId?: string;
  exercises: WorkoutExercise[];
  notes?: string;
};

export type ProgramDay = {
  id: string;
  name: string;
  targetMuscles: string[];
  exerciseIds: string[];
  isRestDay: boolean;
};

export type Program = {
  id: string;
  name: string;
  scheduleType: "push_pull_legs" | "upper_lower" | "custom";
  days: ProgramDay[];
};
