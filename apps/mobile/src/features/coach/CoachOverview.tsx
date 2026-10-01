import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { getCoachHistory } from "../../storage/workoutsRepository";
import { reviewTraining } from "./coachModel";
import { CoachButton, themedCoachStyles } from "./CoachControls";
import { useThemeStyles } from "../../theme/ThemeProvider";

export function CoachOverview() {
  const { styles: s } = useThemeStyles(themedCoachStyles);
  const router = useRouter();
  const [review, setReview] = useState<ReturnType<typeof reviewTraining> | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    getCoachHistory().then((history) => { if (active) { setReview(reviewTraining(history)); setError(""); } }).catch(() => { if (active) setError("Local history is unavailable. Try again when you return to this tab."); });
    return () => { active = false; };
  }, []));
  return <View style={s.card}>
    <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
      <View style={{ flex: 1, gap: 5 }}><Text style={s.eyebrow}>ON-DEVICE COACH</Text><Text style={s.title}>Training review</Text></View>
      <CoachButton label={open ? "Hide" : "Review"} onPress={() => setOpen(!open)} />
    </View>
    {open ? <Text style={s.copy}>Suggestions based on your completed sets and recent training. You decide what to apply.</Text> : <Text style={s.copy}>{review ? `${review.sessions} sessions in the last 7 days` : "Review your recent training"}</Text>}
    {open ? <CoachButton label="Try coach demo (no saved data)" onPress={() => router.push("/coach-preview")} /> : null}
    {open && review ? <><Text style={s.title}>{review.sessions} sessions · {review.sets} working sets</Text><Text style={s.copy}>{review.message}</Text></> : null}
    {error ? <Text style={s.error}>{error}</Text> : null}
  </View>;
}
