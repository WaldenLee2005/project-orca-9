import { useThemeStyles } from "../../theme/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { Keyboard, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type ViewStyle } from "react-native";
import { createThemedStyles } from "../../theme/designSystem";
import { clampDragTranslation, getDragTargetIndex, moveProgramExercise, PROGRAM_LIMITS, type ProgramExercise, type RowFrame } from "./programModel";
import { ExerciseTargetEditor } from "./ExerciseTargetEditor";

export type ProgramScrollMetrics = { offset: number; height: number; contentHeight: number; top: number };
type Drag = { id: string; from: number; to: number; translation: number; dy: number; pointerY: number; scrollStart: number; frames: RowFrame[] };
type DragHandlers = { start: (id: string, y: number) => void; move: (dy: number, y: number) => void; finish: (cancel?: boolean) => void };
const GAP = 18;

export function ProgramExerciseList({ entries, onChange, scrollRef, scrollMetrics, onDraggingChange, disabled }: {
  entries: ProgramExercise[];
  onChange: (entries: ProgramExercise[]) => void;
  scrollRef: RefObject<ScrollView | null>;
  scrollMetrics: MutableRefObject<ProgramScrollMetrics>;
  onDraggingChange: (dragging: boolean) => void;
  disabled: boolean;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const [visibleDrag, setVisibleDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const compact = useWindowDimensions().width < 360;
  const latest = useRef({ entries, onChange, onDraggingChange, disabled });
  latest.current = { entries, onChange, onDraggingChange, disabled };
  const frames = useRef(new Map<string, RowFrame>());
  const drag = useRef<Drag | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const handlers = useMemo<DragHandlers>(() => {
    function publish() {
      const current = drag.current;
      if (!current) return;
      const raw = current.dy + scrollMetrics.current.offset - current.scrollStart;
      current.translation = clampDragTranslation(current.frames, current.from, raw);
      current.to = getDragTargetIndex(current.frames, current.from, current.translation);
      setVisibleDrag({ ...current });
    }
    return {
      start(id, pointerY) {
        if (latest.current.disabled || drag.current) return;
        const orderedFrames = latest.current.entries.map((entry) => frames.current.get(entry.id));
        if (orderedFrames.some((frame) => !frame)) return;
        const from = latest.current.entries.findIndex((entry) => entry.id === id);
        if (from < 0) return;
        Keyboard.dismiss();
        scrollRef.current?.getNativeScrollRef()?.measureInWindow((_x, y, _width, height) => {
          scrollMetrics.current.top = y;
          scrollMetrics.current.height = height;
        });
        drag.current = { id, from, to: from, translation: 0, dy: 0, pointerY, scrollStart: scrollMetrics.current.offset, frames: orderedFrames as RowFrame[] };
        latest.current.onDraggingChange(true);
        publish();
        timer.current = setInterval(() => {
          const current = drag.current;
          if (!current) return;
          const metrics = scrollMetrics.current;
          // Leave room for the fixed bottom navigation while dragging toward an edge.
          const topEdge = metrics.top + 70;
          const bottomEdge = metrics.top + metrics.height - 140;
          const speed = current.pointerY < topEdge ? -10 : current.pointerY > bottomEdge ? 10 : 0;
          const next = Math.max(0, Math.min(Math.max(0, metrics.contentHeight - metrics.height), metrics.offset + speed));
          if (speed && next !== metrics.offset) {
            metrics.offset = next;
            scrollRef.current?.scrollTo({ y: next, animated: false });
            publish();
          }
        }, 16);
      },
      move(dy, pointerY) {
        if (!drag.current) return;
        drag.current.dy = dy;
        drag.current.pointerY = pointerY;
        publish();
      },
      finish(cancel = false) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        const current = drag.current;
        drag.current = null;
        setVisibleDrag(null);
        latest.current.onDraggingChange(false);
        if (!current || cancel || current.from === current.to) return;
        const next = moveProgramExercise(latest.current.entries, current.from, current.to);
        latest.current.onChange(next);
        setAnnouncement(`${next[current.to].exerciseName} moved to position ${current.to + 1}.`);
      }
    };
  }, [scrollMetrics, scrollRef]);

  function move(from: number, to: number) {
    if (to < 0 || to >= entries.length) return;
    onChange(moveProgramExercise(entries, from, to));
    setAnnouncement(`${entries[from].exerciseName} moved to position ${to + 1}.`);
  }

  return (
    <View>
      <View style={styles.list}>
        {entries.map((entry, index) => {
          const active = visibleDrag?.id === entry.id;
          let translation = 0;
          if (visibleDrag) {
            const shift = visibleDrag.frames[visibleDrag.from].height + GAP;
            if (active) translation = visibleDrag.translation;
            else if (visibleDrag.from < index && index <= visibleDrag.to) translation = -shift;
            else if (visibleDrag.to <= index && index < visibleDrag.from) translation = shift;
          }
          return (
            <View key={entry.id} onLayout={({ nativeEvent }) => frames.current.set(entry.id, { y: nativeEvent.layout.y, height: nativeEvent.layout.height })}
              style={{ transform: [{ translateY: translation }], zIndex: active ? 20 : 0 }}>
              <ProgramExerciseRow entry={entry} index={index} count={entries.length} active={active} target={visibleDrag?.to} compact={compact}
                disabled={disabled || Boolean(visibleDrag)} handlers={handlers} onMove={(to) => move(index, to)}
                onRemove={() => onChange(entries.filter((item) => item.id !== entry.id))}
                onUpdate={(patch) => onChange(entries.map((item) => item.id === entry.id ? { ...item, ...patch } : item))} />
            </View>
          );
        })}
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.announcement}>{announcement}</Text>
    </View>
  );
}

function ProgramExerciseRow({ entry, index, count, active, target, compact, disabled, handlers, onMove, onRemove, onUpdate }: {
  entry: ProgramExercise; index: number; count: number; active: boolean; target?: number; compact: boolean; disabled: boolean; handlers: DragHandlers;
  onMove: (to: number) => void; onRemove: () => void; onUpdate: (patch: Partial<ProgramExercise>) => void;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabledRef.current,
    onMoveShouldSetPanResponder: () => !disabledRef.current,
    onPanResponderGrant: (event) => handlers.start(entry.id, event.nativeEvent.pageY),
    onPanResponderMove: (_event, gesture) => handlers.move(gesture.dy, gesture.moveY),
    onPanResponderRelease: () => handlers.finish(),
    onPanResponderTerminate: () => handlers.finish(true),
    onPanResponderTerminationRequest: () => false
  }), [entry.id, handlers]);
  const label = `${entry.exerciseName}, exercise ${index + 1}`;
  return (
    <View style={[styles.card, active && styles.dragging]}>
      <View style={styles.rowHeader}>
        <Text style={styles.position}>{active ? (target ?? index) + 1 : index + 1}</Text>
        <Text style={styles.exerciseName}>{entry.exerciseName}</Text>
        <View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={`Reorder ${label}`}
          accessibilityHint="Drag to change order, or use the move up and move down buttons."
          accessibilityValue={{ min: 1, max: count, now: index + 1 }}
          aria-valuemin={1} aria-valuemax={count} aria-valuenow={index + 1} aria-valuetext={`Position ${index + 1} of ${count}`}
          accessibilityActions={[{ name: "increment", label: "Move down" }, { name: "decrement", label: "Move up" }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (disabled) return;
            if (nativeEvent.actionName === "increment") onMove(index + 1);
            if (nativeEvent.actionName === "decrement") onMove(index - 1);
          }}
          style={[styles.dragHandle, Platform.OS === "web" && ({ touchAction: "none", userSelect: "none" } as ViewStyle)]}>
          <Ionicons name="reorder-three-outline" size={27} color={colors.accent} />
        </View>
      </View>
      <View style={[styles.goals, compact && { flexDirection: "column" }]}>
        <GoalInput label="Sets" context={label} value={entry.sets} max={PROGRAM_LIMITS.sets} disabled={disabled} onChange={(sets) => onUpdate({ sets })} />
      </View>
      <ExerciseTargetEditor value={entry.target} onChange={(target) => onUpdate({ target })} disabled={disabled} context={label} />
      <View style={styles.rowActions}>
        <View style={styles.moveActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Move ${label} up`} disabled={disabled || index === 0}
            onPress={() => onMove(index - 1)} style={[styles.iconButton, (disabled || index === 0) && styles.disabled]}>
            <Ionicons name="arrow-up" size={19} color={colors.secondaryText} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Move ${label} down`} disabled={disabled || index === count - 1}
            onPress={() => onMove(index + 1)} style={[styles.iconButton, (disabled || index === count - 1) && styles.disabled]}>
            <Ionicons name="arrow-down" size={19} color={colors.secondaryText} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} disabled={disabled} onPress={onRemove} style={styles.removeButton}>
          <Ionicons name="close-outline" size={18} color={colors.secondaryText} /><Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

function GoalInput({ label, context, value, max, disabled, onChange }: {
  label: string; context: string; value: number; max: number; disabled: boolean; onChange: (value: number) => void;
}) {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const invalid = value < 1 || value > max;
  return (
    <View style={styles.goal}>
      <Text style={styles.goalLabel}>{label}</Text>
      <View style={[styles.stepper, invalid && styles.invalid]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label.toLowerCase()} for ${context}`}
          disabled={disabled || value <= 1} onPress={() => onChange(Math.max(1, Math.min(max, value - 1)))} style={styles.stepButton}>
          <Ionicons name="remove" size={17} color={disabled || value <= 1 ? colors.mutedText : colors.accent} />
        </Pressable>
        <TextInput accessibilityLabel={`${label} for ${context}`} value={value ? String(value) : ""} editable={!disabled}
          onChangeText={(text) => { if (/^\d{0,3}$/.test(text)) onChange(Number(text)); }}
          keyboardType="number-pad" inputMode="numeric" selectTextOnFocus maxLength={3} style={styles.numberInput}
          selectionColor={colors.accent} placeholder="0" placeholderTextColor={colors.mutedText} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label.toLowerCase()} for ${context}`}
          disabled={disabled || value >= max} onPress={() => onChange(Math.max(1, Math.min(max, value + 1)))} style={styles.stepButton}>
          <Ionicons name="add" size={17} color={disabled || value >= max ? colors.mutedText : colors.accent} />
        </Pressable>
      </View>
      {invalid ? <Text style={styles.validation}>Choose 1–{max}</Text> : null}
    </View>
  );
}

const themedStyles = createThemedStyles((colors, ui) => ({
  list: { gap: GAP },
  card: { ...ui.group, padding: 16, borderWidth: 1, borderColor: "transparent", gap: 16 },
  dragging: { borderColor: colors.accent, elevation: 12 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  position: { color: colors.accent, fontSize: 13, fontWeight: "700", minWidth: 18 },
  exerciseName: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600", flex: 1 },
  dragHandle: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  goals: { flexDirection: "row", gap: 14 }, goal: { flex: 1, minWidth: 0, gap: 8 },
  goalLabel: { color: colors.secondaryText, fontSize: 12, fontWeight: "600" },
  stepper: { ...ui.input, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "transparent", minHeight: 48 },
  stepButton: { width: 44, height: 46, alignItems: "center", justifyContent: "center" },
  numberInput: { flex: 1, minWidth: 20, paddingVertical: 10, paddingHorizontal: 0, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.text },
  invalid: { borderColor: colors.danger }, validation: { color: colors.danger, fontSize: 11 },
  rowActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  moveActions: { flexDirection: "row", gap: 8 }, iconButton: { ...ui.control, width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  removeButton: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: 4 }, removeText: { color: colors.secondaryText, fontSize: 12 },
  disabled: { opacity: 0.35 }, announcement: { color: colors.accent, fontSize: 12, marginTop: 12, minHeight: 18 }
}));
