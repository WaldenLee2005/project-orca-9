import type { ImageSourcePropType } from "react-native";
import dataset from "../../../assets/repdb/exercises.json";
import { repDbImages } from "../exercises/repdbImages";
import { toCatalogMetadata } from "../exercises/exerciseSearch";

export type SessionExercise = {
  id: string;
  name: string;
  category: string;
  focus: string;
  equipment: string;
  image: ImageSourcePropType;
};

// Preserve RepDB IDs so existing workout history and lift trends keep matching.
export const sessionExercises = dataset.exercises.map((exercise) => ({
  ...toCatalogMetadata(exercise),
  image: repDbImages[exercise.id]
})).sort((first, second) => first.name.localeCompare(second.name));

export type CatalogExercise = (typeof sessionExercises)[number];
