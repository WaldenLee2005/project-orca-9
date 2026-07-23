import { PageScaffold } from "../../src/components/PageScaffold";

export default function ExercisesScreen() {
  return (
    <PageScaffold
      eyebrow="Library"
      title="Exercises"
      description="Find the lift fast."
      actions={["Search", "Filter"]}
      highlights={["Chest", "Back", "Legs", "Arms"]}
    />
  );
}
