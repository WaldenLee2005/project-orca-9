import { useThemeStyles } from "../../theme/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenHeading } from "../../components/ScreenHeading";
import { createThemedStyles } from "../../theme/designSystem";
import { ExerciseBrowser, RepDbCredit } from "../exercises/ExerciseBrowser";
import { sessionExercises, type CatalogExercise } from "../workouts/repdbSessionExercises";
import { ExerciseTargetEditor, NumberField } from "./ExerciseTargetEditor";
import { getImportIssues, importReviewIsCurrent, isWorkoutLogImport, IMPORT_LIMITS, validateImportExercises, type ParsedProgramImport } from "./importProgram";
import { prepareWorkoutImport } from "./importAdapter";
import { readImportScreenshot, screenshotImportSupported } from "./importOcr";
import { getDaySlotLabel, PROGRAM_LIMITS, type ProgramDraft, type ProgramExercise } from "./programModel";

export function ProgramImportScreen({ onCancel, onReview }: { onCancel: () => void; onReview: (draft: ProgramDraft) => void }) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const [text, setText] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedProgramImport | null>(null);
  const [reviewedText, setReviewedText] = useState<string | null>(null);
  const [workoutLog, setWorkoutLog] = useState(false);
  const [roundPartialReps, setRoundPartialReps] = useState(true);
  const [reviewedOptions, setReviewedOptions] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const imageRef = useRef<string | null>(null);
  const issues = parsed ? getImportIssues(parsed.draft) : [];
  const exerciseCount = parsed?.draft.days.reduce((sum, day) => sum + day.exercises.length, 0) ?? 0;
  const logInput = workoutLog || isWorkoutLogImport(text);
  const optionsKey = `${logInput}/${roundPartialReps}`;
  const sourceChanged = Boolean(parsed && (!importReviewIsCurrent(text, reviewedText) || optionsKey !== reviewedOptions));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { imageRef.current = imageUri; return () => releaseImage(imageUri); }, [imageUri]);

  async function screenshot() {
    if (controller.current) return;
    if (!screenshotImportSupported()) {
      setError(Platform.OS === "web" ? "Your browser cannot run local OCR. Paste text instead." : "Screenshot OCR needs an Orca development build, not Expo Go. Use the web app or paste text instead."); return;
    }
    setReading(true); setError(""); setStatus("Choose a screenshot…");
    const request = new AbortController(); controller.current = request;
    let pickedUri: string | null = null;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: false, quality: 1 });
      if (!result.canceled) pickedUri = result.assets[0]?.uri ?? null;
      if (request.signal.aborted || !mounted.current || controller.current !== request) return;
      if (result.canceled) { setStatus("No screenshot selected. Your text is unchanged."); return; }
      setStatus("Preparing local OCR…");
      const asset = result.assets[0];
      const extracted = await readImportScreenshot(asset, { signal: request.signal, onProgress: (message) => { if (mounted.current && !request.signal.aborted) setStatus(message); } });
      if (request.signal.aborted || !mounted.current || controller.current !== request) return;
      if (!extracted.trim()) throw new Error("No readable text found. Try a sharper crop with larger text, or paste the workout.");
      const next = [text.trim(), extracted].filter(Boolean).join("\n\n");
      if (next.length > IMPORT_LIMITS.characters || next.split(/\r?\n/).length > IMPORT_LIMITS.lines) throw new Error("That screenshot exceeds the import limit. Crop it to one workout or use a shorter plan.");
      setText(next); setImageUri(asset.uri); imageRef.current = asset.uri;
      setAcknowledged(false); setStatus(isWorkoutLogImport(extracted) ? "Workout table found. Columns and blank continuation cells are preserved below. Confirm Reps / Weight / Sets before reviewing." : "Text added. Check the reading below before parsing—OCR can confuse numbers and columns.");
    } catch (cause) {
      if (mounted.current && !request.signal.aborted && controller.current === request) { setStatus(""); setError(cause instanceof Error ? cause.message : "Couldn't read that screenshot. Try again or paste the text."); }
    } finally {
      if (pickedUri && pickedUri !== imageRef.current) releaseImage(pickedUri);
      if (controller.current === request) { controller.current = null; if (mounted.current) setReading(false); }
    }
  }

  function cancelReading() { controller.current?.abort(); controller.current = null; setReading(false); setStatus("Reading cancelled. Your existing text is unchanged."); }
  function updateExercise(id: string, update: Partial<ProgramExercise>) {
    setParsed((current) => current ? { ...current, draft: { ...current.draft, days: current.draft.days.map((day) => ({ ...day, exercises: day.exercises.map((entry) => entry.id === id ? { ...entry, ...update } : entry) })) } } : current);
    setAcknowledged(false); setError("");
  }
  function match(exercise: CatalogExercise) {
    if (!picking) return;
    updateExercise(picking, { exerciseId: exercise.id, exerciseName: exercise.name });
    setParsed((current) => current ? { ...current, sources: { ...current.sources, [picking]: { ...current.sources[picking], matched: false } } } : current);
    setPicking(null);
  }
  async function parse() {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request; setReading(true);
    try {
      const result = await prepareWorkoutImport({ text, catalog: sessionExercises, options: { workoutLog: logInput, roundPartialReps }, signal: request.signal });
      if (!mounted.current || request.signal.aborted || controller.current !== request) return;
      setParsed(result); setReviewedText(text); setReviewedOptions(optionsKey); setReviewing(true); setAcknowledged(false); setError("");
    }
    catch (cause) { if (mounted.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "Couldn't read that plan. Edit the text and try again."); }
    finally { if (controller.current === request) { controller.current = null; if (mounted.current) setReading(false); } }
  }
  function finish() {
    if (!parsed) return;
    try {
      if (sourceChanged) throw new Error("Your source or import settings changed. Rebuild the review before continuing.");
      if (!acknowledged) throw new Error("Check the extracted lines and acknowledge the review first.");
      onReview(validateImportExercises(parsed.draft));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Resolve the flagged exercises first."); }
  }

  if (picking && parsed) return <ExerciseBrowser initialQuery={parsed.sources[picking].query} onSelect={match} header={<View style={styles.panel}>
    <Button label="Back to import review" onPress={() => setPicking(null)} />
    <ScreenHeading eyebrow="Orca · Import" title="Match exercise" subtitle={`Source: ${parsed.sources[picking].text}`} />
    <Text style={styles.body}>Choose the exact variation and equipment. Clear the search if the original name is unfamiliar.</Text>
  </View>} />;

  return <ScrollView key={reviewing ? "import-review" : "import-source"} style={styles.screen} contentContainerStyle={[ui.content, styles.content]} keyboardShouldPersistTaps="handled">
    <Button label="Back to programs" onPress={() => { if (text || parsed || reading) setDiscarding(true); else onCancel(); }} />
    <ScreenHeading eyebrow="Orca · Import prototype" title={reviewing ? "Review import" : "Import program"}
      subtitle={reviewing ? "Match the lifts. Check every number. Nothing is saved yet." : "Paste workout text or read a screenshot, then make it your own."} icon="download-outline" />
    {discarding ? <View style={styles.panel}>
      <Text style={styles.title}>Discard this import?</Text><Text style={styles.body}>The source and unsaved review will be cleared. Saved programs stay unchanged.</Text>
      <Button label="Keep importing" onPress={() => setDiscarding(false)} primary />
      <Button label="Discard import" onPress={() => { controller.current?.abort(); onCancel(); }} />
    </View> : null}
    {!reviewing ? <>
      <View style={styles.panel}>
        <Text style={styles.title}>Text or screenshot</Text>
        <Text style={styles.body}>Local OCR + structured parsing. No AI account, no image uploads. Supports English workout plans and dated workout-log tables; videos and links aren't supported.</Text>
        <Button label={reading ? "Reading screenshot…" : imageUri ? "Add another screenshot" : "Choose screenshot"} icon="image-outline" onPress={screenshot} disabled={reading} />
        {reading ? <Button label="Cancel reading" onPress={cancelReading} /> : null}
        <Text style={styles.caption}>{Platform.OS === "web" ? "The first read needs internet to download OCR tools from jsDelivr. Images are processed here, not sent to a server." : "Text works in Expo Go. Screenshot reading requires a native development build with OCR installed."}</Text>
        {imageUri ? <Image accessibilityLabel="Last imported screenshot" source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" /> : null}
        {status ? <Text accessibilityLiveRegion="polite" style={styles.caption}>{status}</Text> : null}
      </View>
      <Text style={styles.label}>Workout text</Text>
      <TextInput accessibilityLabel="Workout text to import" multiline textAlignVertical="top" value={text} onChangeText={(value) => { setText(value); setError(value.length > IMPORT_LIMITS.characters ? "This text exceeds 30,000 characters. Shorten it before importing; nothing has been truncated." : ""); setStatus(""); setAcknowledged(false); }} editable={!reading}
        placeholder={"Program: My plan\nMonday - Upper\nArnold Press 3 x 8-12\nPlank 3 x 45 sec\nTuesday - Rest"}
        placeholderTextColor={colors.mutedText} selectionColor={colors.accent} style={styles.source} autoCorrect={false} />
      <Text style={styles.caption}>{text.length.toLocaleString()} / 30,000 characters · Use weekdays or Day 1, Day 2… · Targets are per set.</Text>
      <View style={styles.panel}>
        {isWorkoutLogImport(text) ? <Text style={styles.title}>Workout log detected</Text> : <Pressable accessibilityRole="checkbox" accessibilityLabel="Read as workout log table" accessibilityState={{ checked: workoutLog, disabled: reading }} disabled={reading} onPress={() => { setWorkoutLog(!workoutLog); setAcknowledged(false); }} style={styles.check}>
          <Ionicons name={workoutLog ? "checkbox" : "square-outline"} size={25} color={colors.accent} /><Text style={styles.checkText}>Read as workout log table</Text>
        </Pressable>}
        {logInput ? <>
          <Text style={styles.body}>Expected columns: optional Date · Exercise · Reps · Weight · Sets · optional Notes. If your order differs, edit the headers above. Blank exercise cells add sets to the previous lift.</Text>
          <Text style={styles.caption}>This converts recorded sessions into a program draft—not workout history. Different reps become a proposed range. Dates don't set the repeat schedule. Weights and notes stay in this review only.</Text>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="Round partial reps to nearest whole rep" accessibilityState={{ checked: roundPartialReps, disabled: reading }} disabled={reading} onPress={() => { setRoundPartialReps(!roundPartialReps); setAcknowledged(false); }} style={styles.check}>
            <Ionicons name={roundPartialReps ? "checkbox" : "square-outline"} size={25} color={colors.accent} /><Text style={styles.checkText}>Round partial reps to the nearest whole rep (6.5 → 7). Original values stay visible.</Text>
          </Pressable>
        </> : <Text style={styles.caption}>For rows like Bench · 8 · 135 · 3 (reps, weight, sets). Regular plans can use Bench 3 × 8.</Text>}
      </View>
      {parsed ? <Text style={sourceChanged ? styles.body : styles.caption}>{sourceChanged ? "Source changed. Rebuild the review to use your edits; the previous review is out of date." : "Parsing again replaces corrections in the current review."}</Text> : null}
      <Button label={parsed ? "Rebuild review" : "Review import"} icon="arrow-forward" primary onPress={parse} disabled={reading || !text.trim()} />
      {parsed ? <Button label="Return to current review" onPress={() => { if (!sourceChanged) { setReviewing(true); setError(""); } }} disabled={reading || sourceChanged} /> : null}
    </> : parsed ? <>
      <Button label="Edit source text" icon="create-outline" onPress={() => { setReviewing(false); setError(""); }} />
      <View style={styles.panel}>
        <Text style={styles.title}>{parsed.draft.name || "Imported workout"}</Text>
        <Text style={styles.body}>{parsed.draft.schedule.mode === "weekly" ? "Proposed weekly schedule" : `Proposed ${parsed.draft.days.length}-day cycle`} · {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"}</Text>
        <Text style={styles.caption}>You'll confirm the program name, start date, training days and rest days in the builder next.</Text>
        {parsed.kind === "workoutLog" ? <Text style={styles.body}>Check the table columns and proposed goals. These are grouped logged sets, not a prescribed training plan.</Text> : null}
        <Text accessibilityLiveRegion="polite" style={issues.length ? styles.error : styles.caption}>{issues.length ? `${issues.length} ${issues.length === 1 ? "issue" : "issues"} to resolve below` : "All exercises are ready for your review."}</Text>
        {issues.slice(0, 5).map((issue, index) => <Text key={index} style={styles.body}>{issue.message}</Text>)}
        {issues.length > 5 ? <Text style={styles.caption}>Plus {issues.length - 5} more issues in the exercise cards below.</Text> : null}
      </View>
      {parsed.warnings.length ? <View style={styles.warning}>
        <Text style={styles.title}>Source notes · check before saving</Text>
        {parsed.warnings.map((warning, index) => <Text key={index} style={styles.body}>{warning}</Text>)}
      </View> : null}
      {parsed.draft.days.map((day, dayIndex) => <View key={day.id} style={styles.day}>
        <Text style={styles.title}>{getDaySlotLabel(parsed.draft.schedule.mode, dayIndex)}{day.name ? ` · ${day.name}` : ""}</Text>
        {day.kind === "rest" ? <Text style={styles.caption}>Rest · confirm in the builder</Text> : !day.exercises.length ? <>
          <Text style={styles.error}>No exercises on this training day. Add them in the source, or make it a rest day here without losing your other corrections.</Text>
          <Button label={`Mark ${getDaySlotLabel(parsed.draft.schedule.mode, dayIndex)} as rest`} icon="leaf-outline" onPress={() => {
            setParsed((current) => current ? { ...current, draft: { ...current.draft, days: current.draft.days.map((item) => item.id === day.id ? { ...item, kind: "rest" } : item) } } : current); setAcknowledged(false); setError("");
          }} />
        </> : null}
        {day.exercises.map((entry) => <View key={entry.id} style={styles.panel}>
          <Text style={styles.sourceLine}>{parsed.kind === "workoutLog" ? "" : `Line ${parsed.sources[entry.id].line}: `}{parsed.sources[entry.id].text}</Text>
          <Text style={styles.title}>{entry.exerciseName}</Text>
          {parsed.sources[entry.id].notes?.map((note, index) => <Text key={index} style={styles.body}>{note}</Text>)}
          <Text style={entry.exerciseId ? styles.caption : styles.error}>{entry.exerciseId ? (parsed.sources[entry.id].matched ? "Name matched · verify the variation below" : "Library match selected") : "No exact library match. Choose the intended exercise."}</Text>
          <Button label={entry.exerciseId ? `Change match: ${entry.exerciseName}` : `Match exercise: ${entry.exerciseName}`} onPress={() => setPicking(entry.id)} />
          <NumberField label="Sets" exerciseContext={`import line ${parsed.sources[entry.id].line}`} value={entry.sets} max={PROGRAM_LIMITS.sets} onChange={(sets) => updateExercise(entry.id, { sets })} />
          <ExerciseTargetEditor value={entry.target} context={`import line ${parsed.sources[entry.id].line}`} disabled={false} onChange={(target) => updateExercise(entry.id, { target })} />
          <Button label={`Remove line ${parsed.sources[entry.id].line}`} icon="close" onPress={() => {
            setParsed({ ...parsed, draft: { ...parsed.draft, days: parsed.draft.days.map((item) => ({ ...item, exercises: item.exercises.filter((exercise) => exercise.id !== entry.id) })) } }); setAcknowledged(false); setError("");
          }} />
        </View>)}
      </View>)}
      <RepDbCredit />
      {issues.length ? <Text accessibilityLiveRegion="polite" style={styles.error}>Resolve the {issues.length} flagged {issues.length === 1 ? "issue" : "issues"} above before continuing.</Text> : null}
      <Pressable accessibilityRole="checkbox" accessibilityLabel="I checked the source, matches, targets and warnings" accessibilityState={{ checked: acknowledged }} onPress={() => setAcknowledged(!acknowledged)} style={styles.check}>
        <Ionicons name={acknowledged ? "checkbox" : "square-outline"} size={25} color={colors.accent} />
        <Text style={styles.checkText}>I checked the source, matches, targets and warnings. OCR and parsing can make mistakes.</Text>
      </Pressable>
      <Button label="Continue to program builder" icon="arrow-forward" primary onPress={finish} disabled={!acknowledged || Boolean(issues.length) || sourceChanged} />
      <Text style={styles.caption}>Review only. No workout history, streaks or active programs will change. Save explicitly in the builder when ready.</Text>
    </> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </ScrollView>;
}

function releaseImage(uri: string | null) {
  if (Platform.OS === "web" && uri?.startsWith("blob:")) URL.revokeObjectURL(uri);
}

function Button({ label, onPress, disabled, primary, icon }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; icon?: keyof typeof Ionicons.glyphMap }) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} onPress={onPress} disabled={disabled} style={[styles.button, primary && ui.primary, disabled && { opacity: 0.45 }]}>
    {icon ? <Ionicons name={icon} size={20} color={primary ? colors.onAccent : colors.accent} /> : null}
    <Text style={[styles.buttonText, primary && { color: colors.onAccent }]}>{label}</Text>
  </Pressable>;
}
const themedStyles = createThemedStyles((colors, ui) => ({
  screen: { flex: 1, backgroundColor: colors.background }, content: { gap: 18 },
  panel: { ...ui.group, padding: 20, gap: 16 }, day: { gap: 16 },
  warning: { ...ui.input, borderWidth: 1, borderColor: colors.accent, padding: 20, gap: 14 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" }, body: { color: colors.secondaryText, fontSize: 14, lineHeight: 22 },
  caption: { color: colors.mutedText, fontSize: 12, lineHeight: 19 }, label: { color: colors.secondaryText, fontSize: 14, fontWeight: "600" },
  source: { ...ui.input, minHeight: 240, padding: 18, color: colors.text, fontSize: 15, lineHeight: 25 },
  sourceLine: { color: colors.secondaryText, fontSize: 13, lineHeight: 20 },
  button: { ...ui.control, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 48, padding: 14 },
  buttonText: { color: colors.text, fontSize: 14, fontWeight: "700", flexShrink: 1 },
  preview: { height: 170, width: "100%", borderRadius: 12, backgroundColor: colors.background },
  check: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }, checkText: { flex: 1, color: colors.secondaryText, fontSize: 14, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 22 },
}));
