import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { createThemedStyles } from "../../theme/designSystem";
import { useThemeStyles } from "../../theme/ThemeProvider";
import { getActualSets, MAX_SET_NOTE_LENGTH, updateWorkoutSetNote, type StoredSessionExercise, type WorkoutSet } from "../../storage/workoutsRepository";
import { formatDuration } from "../programs/programModel";

export function SavedSetNotes({ entry, onNoteSaved, expandedInitially = false }: {
  entry: StoredSessionExercise;
  onNoteSaved: (setNumber: number, note: string | null) => void;
  expandedInitially?: boolean;
}) {
  const { styles: s } = useThemeStyles(themedStyles);
  const [expanded, setExpanded] = useState(expandedInitially);
  const sets = getActualSets(entry);
  const noteCount = sets.filter((set) => set.note).length;
  return <View style={s.container}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
      accessibilityLabel={`Sets and notes for ${entry.exercise.name}`}
      onPress={() => setExpanded(!expanded)} style={s.action}>
      <Text style={s.actionText}>{expanded ? "Hide sets and notes" : "View sets and notes"}{noteCount ? ` · ${noteCount} ${noteCount === 1 ? "note" : "notes"}` : ""}</Text>
    </Pressable>
    <View style={[s.sets, !expanded && { display: "none" }]}>{sets.map((set, index) => <SavedSetNote key={index} set={set}
      setNumber={index + 1} exerciseName={entry.exercise.name} exerciseEntryId={entry.id}
      onSaved={(note) => onNoteSaved(index + 1, note)} />)}</View>
  </View>;
}

function SavedSetNote({ set, setNumber, exerciseName, exerciseEntryId, onSaved }: {
  set: WorkoutSet; setNumber: number; exerciseName: string; exerciseEntryId: string;
  onSaved: (note: string | null) => void;
}) {
  const { styles: s, colors } = useThemeStyles(themedStyles);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function save(note: string | null) {
    if (inFlight.current) return;
    inFlight.current = true; setSaving(true); setError("");
    try {
      const storedNote = await updateWorkoutSetNote(exerciseEntryId, setNumber, note);
      onSaved(storedNote); setEditing(false);
    } catch {
      setError("Could not save this note. Your saved note is unchanged; please try again.");
    } finally { inFlight.current = false; setSaving(false); }
  }
  return <View style={s.set}>
    <Text style={s.setLabel}>Set {setNumber} · {set.durationSeconds != null ? formatDuration(set.durationSeconds) : `${set.reps} reps`} × {set.weight} lb{set.warmup ? " · Warm-up" : ""}</Text>
    {editing ? <>
      <Text style={s.copy}>Note to self (optional)</Text>
      <TextInput accessibilityLabel={`Note to self · ${exerciseName} · set ${setNumber} (optional)`}
        accessibilityHint="Private note saved on this device. Leave blank to remove the note."
        multiline maxLength={MAX_SET_NOTE_LENGTH} value={draft} onChangeText={setDraft} editable={!saving}
        placeholder="Anything to remember for next time" placeholderTextColor={colors.mutedText}
        style={s.input} textAlignVertical="top" />
      <View style={s.actions}>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => { void save(draft); }} style={s.action}>
          <Text style={s.actionText}>{saving ? "Saving note…" : "Save note"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setEditing(false); setError(""); }} style={s.action}>
          <Text style={s.actionText}>Cancel</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Clear note for ${exerciseName}, set ${setNumber}`}
          disabled={saving} onPress={() => { setDraft(""); void save(null); }} style={s.action}>
          <Text style={s.actionText}>Clear note</Text>
        </Pressable>
      </View>
    </> : <>
      {set.note ? <Text style={s.note}>{set.note}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${set.note ? "Edit" : "Add"} note to self for ${exerciseName}, set ${setNumber}`}
        onPress={() => { setDraft(set.note ?? ""); setError(""); setEditing(true); }} style={s.action}>
        <Text style={s.actionText}>{set.note ? "Edit note" : "Add note to self (optional)"}</Text>
      </Pressable>
    </>}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </View>;
}

const themedStyles = createThemedStyles((colors, ui) => ({
  container: { gap: 6 },
  sets: { gap: 12 },
  set: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 },
  setLabel: { color: colors.text, fontSize: 13, fontWeight: "600", lineHeight: 20 },
  copy: { color: colors.secondaryText, fontSize: 13 },
  note: { color: colors.text, fontSize: 14, lineHeight: 21 },
  input: { ...ui.input, color: colors.text, fontSize: 16, minHeight: 96, padding: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  action: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  actionText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 }
}));
