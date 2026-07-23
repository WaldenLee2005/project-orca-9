import { PageScaffold } from "../../src/components/PageScaffold";

export default function ProgramsScreen() {
  return (
    <PageScaffold
      eyebrow="Schedule"
      title="Programs"
      description="Pick the day. Respect the rest."
      actions={["Pick plan", "This week"]}
      highlights={["Push Pull Legs", "Upper Lower", "Custom", "Rest"]}
    />
  );
}
