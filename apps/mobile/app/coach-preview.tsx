import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenHeading } from "../src/components/ScreenHeading";
import { CoachButton, ReadinessCheck, themedCoachStyles } from "../src/features/coach/CoachControls";
import { DEFAULT_READINESS, evaluateCoach, type Readiness } from "../src/features/coach/coachModel";
import type { ProgramExercise } from "../src/features/programs/programModel";
import type { ExerciseExposure } from "../src/storage/workoutsRepository";
import { useThemeStyles } from "../src/theme/ThemeProvider";
import { CoachedSetLogger } from "../src/features/coach/CoachedSetLogger";

const example: ProgramExercise = { id: "demo-bench", exerciseId: "demo-bench", exerciseName: "Example bench press", sets: 3, target: { kind: "repRange", min: 8, max: 10 },
  load: { weight: 100, increment: 5, unit: "lb", convention: "total", equipmentKey: "Example barbell" } };
type Scenario = "progress" | "break" | "hard" | "new";

export default function CoachPreview() {
  const { styles: s, colors, ui } = useThemeStyles(themedCoachStyles);
  const router = useRouter();
  const [scenario, setScenario] = useState<Scenario>("progress");
  const [readiness, setReadiness] = useState<Readiness>({ ...DEFAULT_READINESS, feeling: "good", sameEquipment: true });
  const [applied, setApplied] = useState(false);
  const [logger, setLogger] = useState(false);
  const [saved, setSaved] = useState("");
  const now = new Date();
  function exposure(daysAgo: number): ExerciseExposure {
    const date = new Date(now); date.setDate(date.getDate() - daysAgo); date.setHours(12, 0, 0, 0);
    return { sessionId: `demo-${daysAgo}`, exerciseId: example.exerciseId, prescription: example, performedAt: date.toISOString(),
      actualSets: Array.from({ length: 3 }, () => ({ reps: scenario === "hard" ? 6 : 10, weight: 100, effort: scenario === "hard" ? "hard" : "moderate" })) };
  }
  const history = scenario === "new" ? [] : (scenario === "break" ? [21, 24] : [2, 5]).map(exposure);
  const result = evaluateCoach({ entry: example, history, readiness, now });
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[ui.content, { paddingTop: 20, paddingBottom: 60 }]}>
    <CoachButton label="Back to workouts" onPress={() => router.replace("/workouts")} />
    <ScreenHeading eyebrow="Orca · Sandbox" title="Coach demo" subtitle="Example data only. Nothing here changes your programs, workouts or streak." />
    <View style={s.card}><Text style={s.title}>Choose a scenario</Text>
      <View style={s.row}>{([ ["progress", "Meeting targets"], ["break", "Three weeks off"], ["hard", "Repeatedly hard"], ["new", "No history"] ] as const).map(([value, label]) =>
        <CoachButton key={value} label={label} selected={scenario === value} onPress={() => { setScenario(value); setApplied(false); setReadiness({ ...DEFAULT_READINESS, feeling: "good", sameEquipment: true }); }} />)}</View>
      <Text style={s.copy}>Example: 3 × 8–10 reps at 100 lb, with a 5 lb equipment increment. These numbers are test fixtures, not advice for your lifts.</Text>
    </View>
    <ReadinessCheck value={readiness} onChange={(value) => { setReadiness(value); setApplied(false); }} />
    {scenario === "break" ? <View style={s.card}><Text style={s.title}>No results for 21 days</Text><View style={s.row}>
      {([ ["unknown", "Not sure"], ["break", "I took a break"], ["elsewhere", "Trained elsewhere"] ] as const).map(([gap, label]) =>
        <CoachButton key={gap} label={label} selected={readiness.gap === gap} onPress={() => { setReadiness({ ...readiness, gap }); setApplied(false); }} />)}
    </View></View> : null}
    <View style={s.card}><Text style={s.eyebrow}>EXAMPLE RECOMMENDATION · LOCAL RULES</Text><Text style={s.title}>{result.title}</Text><Text style={s.copy}>{result.explanation}</Text>
      {result.canApply ? <><Text style={s.title}>{result.sets} sets · {result.weight} lb</Text><Text style={s.copy}>8–10 reps per set. No permanent program change.</Text>
        <CoachButton label={applied ? "Undo demo suggestion" : "Try suggestion in demo"} selected={applied} onPress={() => setApplied(!applied)} />
        {applied ? <Text accessibilityLiveRegion="polite" style={s.copy}>Demo session updated. Real workout history remains untouched.</Text> : null}</> : null}
      <Text style={s.copy}>Review-only prototype. Policies need qualified review before general release. No model is connected.</Text>
    </View>
    <CoachButton label={logger ? "Hide demo set logger" : "Try the real set logger without saving data"} onPress={() => { setLogger(!logger); setSaved(""); }} />
    {logger ? <CoachedSetLogger key={scenario} exerciseId={example.exerciseId} entry={example} readiness={readiness} onReadiness={setReadiness} saving={false}
      loadHistory={async () => history} onSave={async (sets) => setSaved(`Demo only: ${sets.map((set, index) => `set ${index + 1}: ${set.reps} reps at ${set.weight} lb`).join("; ")}. Nothing written to workout history.`)} /> : null}
    {saved ? <Text accessibilityLiveRegion="polite" style={s.copy}>{saved}</Text> : null}
  </ScrollView>;
}
