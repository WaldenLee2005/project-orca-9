import { Stack } from "expo-router";
import { PageScaffold } from "../../src/components/PageScaffold";

export default function OnboardingScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Onboarding" }} />
      <PageScaffold
        eyebrow="Setup"
        title="Onboarding"
        description="Set your lift profile."
        actions={["Continue", "Skip for now"]}
        highlights={["Name", "Goal", "Equipment", "Schedule"]}
      />
    </>
  );
}
