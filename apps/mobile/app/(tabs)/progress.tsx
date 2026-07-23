import { PageScaffold } from "../../src/components/PageScaffold";

export default function ProgressScreen() {
  return (
    <PageScaffold
      eyebrow="Trends"
      title="Progress"
      description="See strength move."
      actions={["Volume", "PRs"]}
      highlights={["1W", "1M", "3M", "All"]}
    />
  );
}
