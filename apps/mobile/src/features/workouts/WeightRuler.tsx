import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { createThemedStyles } from "../../theme/designSystem";
import { useThemeStyles } from "../../theme/ThemeProvider";
import {
  boundedWeight, formatWeight, isHorizontalWeightGesture, MAX_WEIGHT, MIN_WEIGHT,
  parseWeightInput, snapWeight, stepWeight, visibleWeightTicks, weightFromDrag
} from "./weightRulerModel";

type Props = { label: string; value: number; onChange: (value: number) => void; onInteract?: () => void; disabled?: boolean };

export function WeightRuler({ label, value, onChange, onInteract, disabled = false }: Props) {
  const { styles: s, colors } = useThemeStyles(themedStyles);
  const position = useRef(new Animated.Value(boundedWeight(value))).current;
  const [visualWeight, setVisualWeight] = useState(boundedWeight(value));
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const current = useRef({ value, onChange, onInteract, disabled });
  current.current = { value, onChange, onInteract, disabled };
  const gesture = useRef({ active: false, start: 0, offset: 0, distance: 0, tick: 0 });
  const claimedDistance = useRef(0);
  const lastSent = useRef(value);
  const lastHapticAt = useRef(0);

  function tickFeedback() {
    if (Platform.OS === "web") return;
    const now = Date.now();
    if (now - lastHapticAt.current < 35) return;
    lastHapticAt.current = now;
    // Unsupported hardware, disabled system feedback, and older native builds
    // must never prevent recording an actual weight.
    try {
      const feedback = Platform.OS === "android"
        ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick)
        : Haptics.selectionAsync();
      void feedback.catch(() => {});
    } catch {}
  }

  function sendValue(next: number) {
    if (current.current.disabled) return;
    if (!Object.is(next, current.current.value)) {
      lastSent.current = next;
      // Retain the selection until the controlled parent has rendered it.
      // Native termination can happen before that render or release event.
      current.current.value = next;
      current.current.onChange(next);
    }
  }

  function animateTo(next: number) {
    Animated.timing(position, { toValue: boundedWeight(next), duration: 110, useNativeDriver: false }).start();
  }

  function finishGesture(commit: boolean) {
    if (!gesture.current.active) return;
    gesture.current.active = false;
    setDragging(false);
    if (!commit || current.current.disabled) {
      animateTo(current.current.value);
      return;
    }
    const selected = snapWeight(weightFromDrag(gesture.current.start, gesture.current.distance));
    if (selected !== gesture.current.tick) tickFeedback();
    animateTo(selected);
    sendValue(selected);
  }

  function claimGesture(distanceX: number, distanceY: number, touches: number) {
    if (current.current.disabled || !isHorizontalWeightGesture(distanceX, distanceY, touches)) return false;
    if (!gesture.current.active) claimedDistance.current = distanceX;
    return true;
  }

  function moveGesture(distance: number) {
    gesture.current.distance = distance;
    const next = weightFromDrag(gesture.current.start, distance);
    const tick = snapWeight(next);
    position.setValue(next);
    if (tick !== gesture.current.tick) {
      gesture.current.tick = tick;
      tickFeedback();
    }
    // Persist each chosen tick rather than depending on a release that a
    // native ScrollView or operating-system interruption can consume.
    sendValue(tick);
  }

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => { claimedDistance.current = 0; return false; },
    onMoveShouldSetPanResponderCapture: (_, state) => claimGesture(state.dx, state.dy, state.numberActiveTouches),
    onMoveShouldSetPanResponder: (_, state) => claimGesture(state.dx, state.dy, state.numberActiveTouches),
    onPanResponderGrant: (_, state) => {
      if (current.current.disabled || state.numberActiveTouches !== 1) return;
      current.current.onInteract?.();
      position.stopAnimation();
      const start = boundedWeight(current.current.value);
      // PanResponder resets dx to zero when granting ownership. Keep the
      // move that crossed the threshold so short swipes still choose a tick.
      const offset = claimedDistance.current;
      gesture.current = { active: true, start, offset, distance: offset, tick: snapWeight(start) };
      setDragging(true);
      moveGesture(offset + state.dx);
    },
    onPanResponderStart: (_, state) => {
      if (state.numberActiveTouches !== 1) finishGesture(false);
    },
    onPanResponderMove: (_, state) => {
      if (!gesture.current.active || current.current.disabled) return;
      if (state.numberActiveTouches !== 1) { finishGesture(false); return; }
      moveGesture(gesture.current.offset + state.dx);
    },
    onPanResponderRelease: () => finishGesture(true),
    onPanResponderTerminationRequest: (_, state) => !gesture.current.active || current.current.disabled || state.numberActiveTouches !== 1,
    onPanResponderTerminate: () => finishGesture(true),
    onShouldBlockNativeResponder: () => true
  })).current;

  useEffect(() => {
    const listener = position.addListener(({ value: next }) => setVisualWeight(next));
    return () => { position.removeListener(listener); position.stopAnimation(); };
  }, [position]);

  useLayoutEffect(() => {
    // Reconcile before the next native event. A passive effect from the prior
    // tick can otherwise mistake a newer own selection for an external edit
    // and cancel a continuous drag. Coach apply/undo still cancels stale work.
    if (!Object.is(value, lastSent.current) || disabled) {
      gesture.current.active = false;
      setDragging(false);
      position.stopAnimation();
      position.setValue(boundedWeight(value));
      setEditing(false);
      lastSent.current = value;
    }
  }, [value, disabled, position]);

  function openEditor() {
    if (current.current.disabled) return;
    // Editing is an explicit choice even before a changed value is submitted.
    // Let the parent protect this field from a late history prefill.
    current.current.onInteract?.();
    finishGesture(false);
    setDraft(formatWeight(current.current.value));
    setError("");
    setEditing(true);
  }

  function saveExactWeight() {
    if (current.current.disabled) return;
    const next = parseWeightInput(draft);
    if (next === null) { setError("Enter a weight from 0 to 10,000 lb, with up to two decimal places."); return; }
    current.current.onInteract?.();
    position.stopAnimation();
    position.setValue(boundedWeight(next));
    sendValue(next);
    setEditing(false);
  }

  function step(direction: 1 | -1, amount: 0.5 | 5 | 10 = 0.5) {
    if (current.current.disabled) return;
    current.current.onInteract?.();
    finishGesture(false);
    const next = amount === 0.5 ? stepWeight(current.current.value, direction)
      : boundedWeight(Number((boundedWeight(current.current.value) + direction * amount).toFixed(2)));
    animateTo(next);
    if (!Object.is(next, current.current.value)) tickFeedback();
    sendValue(next);
  }

  const webControls = Platform.OS === "web" ? {
    tabIndex: disabled ? -1 as const : 0 as const,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onKeyDown: (event: { key: string; preventDefault: () => void }) => {
      if (disabled) return;
      if (["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        step(event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : -1);
      } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openEditor(); }
    }
  } : {};
  const selectedText = formatWeight(dragging ? snapWeight(visualWeight) : value);
  const tickHeights = { half: 7, one: 12, five: 20, ten: 28 };
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <View {...responder.panHandlers} style={[s.box, focused && { borderColor: colors.accent }, disabled && s.disabled]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Enter exact ${label}`}
        accessibilityHint="Type a weight or clear this field. Swiping the scale chooses half-pound increments."
        accessibilityState={{ disabled }} disabled={disabled} onPress={openEditor} style={s.valueRow}>
        <Text style={[s.value, !selectedText && s.placeholder]}>{selectedText ? `${selectedText} lb` : "Select weight"}</Text>
        <Text style={s.typeAction}>Type</Text>
      </Pressable>
      <View {...webControls} style={s.track}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)} accessible accessibilityRole="adjustable"
        accessibilityLabel={label} accessibilityHint="Swipe horizontally to choose weight. Swipe up or down with a screen reader, or use arrow keys, to change by 0.5 pounds."
        accessibilityState={{ disabled }}
        accessibilityValue={{ min: MIN_WEIGHT, max: MAX_WEIGHT, ...(Number.isFinite(value) && value >= MIN_WEIGHT && value <= MAX_WEIGHT ? { now: value } : {}), text: selectedText ? `${selectedText} pounds` : "Not set" }}
        accessibilityActions={[{ name: "increment", label: "Increase by 0.5 pounds" }, { name: "decrement", label: "Decrease by 0.5 pounds" }, { name: "activate", label: "Enter exact weight" }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "increment") step(1);
          else if (nativeEvent.actionName === "decrement") step(-1);
          else if (nativeEvent.actionName === "activate") openEditor();
        }}>
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[s.ticks, !selectedText && { opacity: 0.45 }]}>
          {visibleWeightTicks(visualWeight, width).map((tick) => <View key={tick.weight} style={[s.tickColumn, { left: tick.left - 22 }]}>
            <View style={{ width: tick.kind === "ten" ? 2 : 1, height: tickHeights[tick.kind], backgroundColor: tick.kind === "half" ? colors.mutedText : colors.secondaryText }} />
            {tick.kind === "ten" ? <Text style={s.tickLabel}>{tick.weight}</Text> : null}
          </View>)}
          <View style={s.marker} />
        </View>
      </View>
    </View>
    <View style={s.quickSteps}>
      {([-10, -5, 5, 10] as const).map((amount) => <Pressable key={amount} accessibilityRole="button"
        accessibilityLabel={`${amount > 0 ? "Increase" : "Decrease"} ${label} by ${Math.abs(amount)} pounds`}
        accessibilityState={{ disabled }} disabled={disabled}
        onPress={() => step(amount > 0 ? 1 : -1, Math.abs(amount) as 5 | 10)} style={[s.quickStep, disabled && s.disabled]}>
        <Text style={s.typeAction}>{amount > 0 ? "+" : "−"}{Math.abs(amount)}</Text>
      </Pressable>)}
    </View>
    <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}>
        <View style={s.dialog} accessibilityViewIsModal>
          <Text style={s.dialogTitle}>{label}</Text>
          <TextInput autoFocus accessibilityLabel={`Exact ${label}`} keyboardType="decimal-pad" inputMode="decimal"
            value={draft} editable={!disabled} selectTextOnFocus placeholder="Weight in lb" placeholderTextColor={colors.mutedText}
            maxLength={8} onChangeText={(text) => { setDraft(text); setError(""); }} onSubmitEditing={saveExactWeight} style={s.input} />
          <Text style={s.label}>Enter 0 for no external load. Leave blank to clear.</Text>
          {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
          <View style={s.dialogActions}>
            <Pressable accessibilityRole="button" onPress={() => setEditing(false)} style={s.dialogButton}><Text style={s.typeAction}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={saveExactWeight} style={s.dialogButton}><Text style={s.typeAction}>Done</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const themedStyles = createThemedStyles((colors, ui) => ({
  field: { width: "100%", gap: 6 },
  label: { color: colors.secondaryText, fontSize: 13, lineHeight: 20 },
  box: { ...ui.input, borderWidth: 1, borderColor: colors.border, overflow: "hidden",
    ...(Platform.OS === "web" ? { touchAction: "pan-y" as const, userSelect: "none" as const } : {}) },
  disabled: { opacity: 0.45 },
  valueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44, paddingHorizontal: 14 },
  value: { color: colors.text, fontSize: 20, fontWeight: "600", fontVariant: ["tabular-nums"] },
  placeholder: { color: colors.mutedText, fontSize: 16 },
  typeAction: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  track: { height: 52, overflow: "hidden" },
  ticks: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  tickColumn: { position: "absolute", top: 0, width: 44, alignItems: "center" },
  tickLabel: { color: colors.secondaryText, fontSize: 10, lineHeight: 14, marginTop: 4, fontVariant: ["tabular-nums"] },
  marker: { position: "absolute", left: "50%", marginLeft: -1, top: 0, width: 2, height: 30, backgroundColor: colors.accent },
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "rgba(0, 0, 0, 0.45)" },
  dialog: { ...ui.group, width: "100%", maxWidth: 360, padding: 20, gap: 12 },
  dialogTitle: { color: colors.text, fontSize: 18, fontWeight: "600" },
  input: { ...ui.input, minHeight: 48, padding: 12, color: colors.text, fontSize: 20 },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  dialogButton: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, justifyContent: "center", alignItems: "center" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  quickSteps: { flexDirection: "row", gap: 6 },
  quickStep: { ...ui.control, flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center" }
}));
