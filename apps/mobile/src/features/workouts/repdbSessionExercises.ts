import { ImageSourcePropType } from "react-native";

export type SessionExercise = {
  id: string;
  name: string;
  category: string;
  focus: string;
  equipment: string;
  image: ImageSourcePropType;
};

export const sessionExercises: SessionExercise[] = [
  {
    id: "banded-shoulder-stretch",
    name: "Banded Shoulder Stretch",
    category: "Stretches",
    focus: "Shoulders, chest",
    equipment: "Resistance band",
    image: require("../../../assets/repdb/images/flat/banded-shoulder-stretch-main.webp")
  },
  {
    id: "bench-hamstring-stretch",
    name: "Bench Hamstring Stretch",
    category: "Stretches",
    focus: "Hamstrings, hips",
    equipment: "Flat bench",
    image: require("../../../assets/repdb/images/flat/bench-hamstring-stretch-main.webp")
  },
  {
    id: "bench-press",
    name: "Barbell Bench Press",
    category: "Chest",
    focus: "Chest, triceps, front delts",
    equipment: "Barbell",
    image: require("../../../assets/repdb/images/flat/bench-press-start.webp")
  },
  {
    id: "db-bench-press",
    name: "Dumbbell Bench Press",
    category: "Chest",
    focus: "Chest, shoulders",
    equipment: "Dumbbells",
    image: require("../../../assets/repdb/images/flat/db-bench-press-start.webp")
  },
  {
    id: "incline-bench-press",
    name: "Incline Bench Press",
    category: "Chest",
    focus: "Upper chest, shoulders",
    equipment: "Barbell",
    image: require("../../../assets/repdb/images/flat/incline-bench-press-start.webp")
  },
  {
    id: "lat-pulldown",
    name: "Lat Pulldown",
    category: "Back",
    focus: "Lats, biceps",
    equipment: "Cable",
    image: require("../../../assets/repdb/images/flat/lat-pulldown-start.webp")
  },
  {
    id: "wide-grip-seated-cable-row",
    name: "Wide-Grip Seated Cable Row",
    category: "Back",
    focus: "Mid back, lats",
    equipment: "Cable",
    image: require("../../../assets/repdb/images/flat/wide-grip-seated-cable-row-start.webp")
  },
  {
    id: "barbell-row",
    name: "Bent-Over Barbell Row",
    category: "Back",
    focus: "Lats, upper back",
    equipment: "Barbell",
    image: require("../../../assets/repdb/images/flat/barbell-row-start.webp")
  },
  {
    id: "front-squat",
    name: "Front Squat",
    category: "Legs",
    focus: "Quads, glutes, core",
    equipment: "Barbell",
    image: require("../../../assets/repdb/images/flat/front-squat-start.webp")
  },
  {
    id: "dumbbell-romanian-deadlift",
    name: "Dumbbell Romanian Deadlift",
    category: "Legs",
    focus: "Hamstrings, glutes",
    equipment: "Dumbbells",
    image: require("../../../assets/repdb/images/flat/dumbbell-romanian-deadlift-start.webp")
  },
  {
    id: "goblet-squat",
    name: "Goblet Squat",
    category: "Legs",
    focus: "Quads, glutes",
    equipment: "Kettlebell",
    image: require("../../../assets/repdb/images/flat/goblet-squat-start.webp")
  },
  {
    id: "dumbbell-shoulder-press",
    name: "Dumbbell Shoulder Press",
    category: "Shoulders",
    focus: "Delts, triceps",
    equipment: "Dumbbells",
    image: require("../../../assets/repdb/images/flat/dumbbell-shoulder-press-start.webp")
  },
  {
    id: "arnold-press",
    name: "Arnold Press",
    category: "Shoulders",
    focus: "Delts, upper chest",
    equipment: "Dumbbells",
    image: require("../../../assets/repdb/images/flat/arnold-press-start.webp")
  },
  {
    id: "plank",
    name: "Plank",
    category: "Core",
    focus: "Abs, bracing",
    equipment: "Bodyweight",
    image: require("../../../assets/repdb/images/flat/plank-main.webp")
  },
  {
    id: "bench-leg-pull-in",
    name: "Bench Leg Pull-In",
    category: "Core",
    focus: "Lower abs, hip flexors",
    equipment: "Flat bench",
    image: require("../../../assets/repdb/images/flat/bench-leg-pull-in-start.webp")
  }
];
