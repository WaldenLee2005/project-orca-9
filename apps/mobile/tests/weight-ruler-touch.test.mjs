import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as model from "../src/features/workouts/weightRulerModel.ts";
import { fillUntouchedDraftWeights } from "../src/features/workouts/weightHistory.ts";

const require = createRequire(import.meta.url);
const { transformSync } = require("@babel/core");
const nativePreset = require("@react-native/babel-preset");
const nativeDirectory = join(dirname(require.resolve("react-native/package.json")), "Libraries/Interaction");

function evaluate(source, filename, options, dependency) {
  const code = transformSync(source, { filename, configFile: false, babelrc: false, ...options }).code;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(dependency, module, module.exports);
  return module.exports;
}

// Use the installed native implementation, including its dx reset at grant
// and touch-count changes before release, rather than a PanResponder mock.
const touchMathPath = join(nativeDirectory, "TouchHistoryMath.js");
const touchMath = evaluate(readFileSync(touchMathPath, "utf8"), touchMathPath, { presets: [nativePreset] }, require);
const panPath = join(nativeDirectory, "PanResponder.js");
const PanResponder = evaluate(readFileSync(panPath, "utf8"), panPath, { presets: [nativePreset] },
  (name) => name === "./TouchHistoryMath" ? touchMath : require(name)).default;

class AnimatedValue {
  constructor(value) { this.value = value; this.listeners = new Map(); }
  setValue(value) { this.value = value; for (const listener of this.listeners.values()) listener({ value }); }
  addListener(listener) { const id = Symbol(); this.listeners.set(id, listener); return id; }
  removeListener(id) { this.listeners.delete(id); }
  stopAnimation() {}
}

function mountRuler(value = NaN, disabled = false) {
  const slots = [];
  let index = 0;
  let dirty = false;
  let layoutEffects = [];
  let passiveEffects = [];
  let delayPassiveEffects = false;
  let tree;
  const changes = [];
  const interactions = [];
  const events = [];
  const props = { label: "Weight", value, disabled,
    onInteract() { interactions.push(props.value); events.push(["interact", props.value]); },
    onChange(next) { changes.push(next); events.push(["change", next]); props.value = next; dirty = true; }
  };
  function scheduleEffect(effect, dependencies, queue) {
    const slot = index++;
    if (!slots[slot] || dependencies.some((value, i) => !Object.is(value, slots[slot].dependencies[i]))) {
      slots[slot] = { dependencies, cleanup: slots[slot]?.cleanup };
      queue.push(() => { slots[slot].cleanup?.(); slots[slot].cleanup = effect(); });
    }
  }
  const hooks = {
    useRef(initial) { const slot = index++; return slots[slot] ??= { current: initial }; },
    useState(initial) {
      const slot = index++;
      slots[slot] ??= { value: initial };
      return [slots[slot].value, (next) => {
        const value = typeof next === "function" ? next(slots[slot].value) : next;
        if (!Object.is(value, slots[slot].value)) { slots[slot].value = value; dirty = true; }
      }];
    },
    useEffect(effect, dependencies) { scheduleEffect(effect, dependencies, passiveEffects); },
    useLayoutEffect(effect, dependencies) { scheduleEffect(effect, dependencies, layoutEffects); }
  };
  const native = {
    Animated: { Value: AnimatedValue, timing: (position, { toValue }) => ({ start: () => position.setValue(toValue) }) },
    PanResponder, Platform: { OS: "ios" },
    ...Object.fromEntries(["KeyboardAvoidingView", "Modal", "Pressable", "Text", "TextInput", "View"].map((name) => [name, name]))
  };
  const mocks = {
    react: hooks,
    "react-native": native,
    "expo-haptics": { selectionAsync: async () => {} },
    "../../theme/designSystem": { createThemedStyles: (factory) => factory({}, {}) },
    "../../theme/ThemeProvider": { useThemeStyles: (styles) => ({ styles, colors: {} }) },
    "./weightRulerModel": model
  };
  const componentPath = fileURLToPath(new URL("../src/features/workouts/WeightRuler.tsx", import.meta.url));
  const { WeightRuler } = evaluate(readFileSync(componentPath, "utf8"), componentPath, { plugins: [
    [require("@babel/plugin-transform-typescript"), { isTSX: true }],
    [require("@babel/plugin-transform-react-jsx"), { runtime: "automatic" }],
    require("@babel/plugin-transform-modules-commonjs")
  ] }, (name) => mocks[name] ?? require(name));

  function flushPassiveEffects() {
    const pending = passiveEffects;
    passiveEffects = [];
    for (const effect of pending) effect();
  }
  function render() {
    let passes = 0;
    do {
      assert.ok(passes++ < 10, "component updates settle");
      dirty = false; index = 0; layoutEffects = [];
      tree = WeightRuler(props);
      for (const effect of layoutEffects) effect();
      if (!delayPassiveEffects) flushPassiveEffects();
    } while (dirty);
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== "object") return undefined;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      if (child === undefined) continue;
      const result = find(predicate, child);
      if (result) return result;
    }
  }
  render();
  return {
    changes, interactions, events, props,
    event(action) {
      const result = action();
      // React may process a native event before flushing passive work from
      // the prior render, then flush that work before the next render.
      if (delayPassiveEffects) flushPassiveEffects();
      render();
      return result;
    },
    delayEffects() { delayPassiveEffects = true; },
    update(next) { Object.assign(props, next); render(); },
    handlers() { return find((node) => typeof node.props?.onMoveShouldSetResponderCapture === "function").props; },
    display() { return find((node) => node.type === "Text" && (node.props.children === "Select weight" || /^\d+(\.\d+)? lb$/.test(node.props.children))).props.children; },
    button(label) { return find((node) => node.type === "Pressable" && node.props.accessibilityLabel === label).props; },
    dialogAction(label) { return find((node) => node.type === "Pressable" && node.props.children?.type === "Text" && node.props.children.props.children === label).props; },
    input() { return find((node) => node.type === "TextInput" && node.props.accessibilityLabel === "Exact Weight").props; },
    editorVisible() { return find((node) => node.type === "Modal").props.visible; },
    position() { return slots.find((slot) => slot?.current instanceof AnimatedValue).current.value; }
  };
}

function finger(ruler) {
  const handlers = ruler.handlers();
  let x = 200, y = 100, time = 1;
  let record = { touchActive: true, currentPageX: x, currentPageY: y, previousPageX: x, previousPageY: y, currentTimeStamp: time, previousTimeStamp: time };
  function event(touches = 1) {
    return { nativeEvent: { touches: Array.from({ length: touches }, () => ({})) }, touchHistory: {
      touchBank: [record], numberActiveTouches: touches, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: time
    } };
  }
  ruler.event(() => handlers.onStartShouldSetResponderCapture(event()));
  return {
    claim(dx, dy = 0, touches = 1) {
      this.coordinates(dx, dy);
      return ruler.event(() => handlers.onMoveShouldSetResponderCapture(event(touches)) || handlers.onMoveShouldSetResponder(event(touches)));
    },
    coordinates(dx, dy = 0) {
      time += 16;
      record = { ...record, previousPageX: x, previousPageY: y, previousTimeStamp: record.currentTimeStamp,
        currentPageX: x += dx, currentPageY: y += dy, currentTimeStamp: time };
    },
    grant() {
      // The native move that grants ownership is also dispatched as a move.
      // PanResponder suppresses that duplicate timestamp after its capture.
      ruler.event(() => { handlers.onResponderGrant(event()); handlers.onResponderMove(event()); });
    },
    move(dx, dy = 0) {
      this.coordinates(dx, dy);
      // Fabric's responder negotiation skips the current owner in capture;
      // ancestor negotiation is followed by this owner's move callback.
      ruler.event(() => handlers.onResponderMove(event()));
    },
    terminationRequested() { return ruler.event(() => handlers.onResponderTerminationRequest(event())); },
    terminate() { ruler.event(() => handlers.onResponderTerminate(event())); },
    release() {
      record.touchActive = false;
      ruler.event(() => { handlers.onResponderEnd(event(0)); handlers.onResponderRelease(event(0)); });
    },
    addFinger() { ruler.event(() => handlers.onResponderStart(event(2))); }
  };
}

test("native short swipes from blank retain the threshold move and release with zero touches", () => {
  for (const initial of [NaN, 0]) {
    const ruler = mountRuler(initial);
    const drag = finger(ruler);
    assert.equal(drag.claim(-8), true);
    drag.grant();
    drag.release();
    assert.equal(ruler.props.value, 0.5, "the move before native grant was not lost");
    assert.equal(ruler.display(), "0.5 lb");
    assert.equal(ruler.position(), 0.5);
    assert.deepEqual(ruler.changes, [0.5]);
  }
});

test("native long and repeated drags retain controlled updates and their original gesture origin", () => {
  const ruler = mountRuler(135);
  let drag = finger(ruler);
  assert.equal(drag.claim(-8), true);
  drag.grant();
  drag.move(-152);
  assert.equal(ruler.props.value, 145, "own tick renders do not reset the drag origin");
  drag.release();
  assert.equal(ruler.display(), "145 lb");
  drag = finger(ruler);
  assert.equal(drag.claim(8), true);
  drag.grant();
  drag.move(72);
  drag.release();
  assert.equal(ruler.props.value, 140);
  assert.equal(ruler.display(), "140 lb");
});

test("continuous native drags survive passive effects from the preceding tick render", () => {
  const ruler = mountRuler(135);
  ruler.delayEffects();
  const drag = finger(ruler);
  assert.equal(drag.claim(-8), true);
  drag.grant();
  for (const [distance, expected] of [[-8, 136], [-8, 136.5], [-8, 137], [8, 136.5], [8, 136], [-16, 137], [-8, 137.5]]) {
    drag.move(distance);
    assert.equal(ruler.props.value, expected, "every movement and reversal remains part of the same drag");
    assert.equal(ruler.position(), ruler.props.value, "a stale effect cannot snap back the displayed scale");
  }
  drag.release();
  assert.equal(ruler.props.value, 137.5);
  assert.equal(ruler.display(), "137.5 lb");
  assert.deepEqual(ruler.changes, [135.5, 136, 136.5, 137, 136.5, 136, 137, 137.5]);
});

test("ScrollView takeover is refused and forced native termination retains the selected tick", () => {
  const ruler = mountRuler();
  const drag = finger(ruler);
  assert.equal(drag.claim(-8), true);
  drag.grant();
  drag.move(-72);
  assert.equal(drag.terminationRequested(), false);
  drag.terminate();
  assert.equal(ruler.props.value, 5);
  assert.equal(ruler.display(), "5 lb");
  assert.equal(ruler.position(), 5);
});

test("vertical gestures, disabled rulers and added fingers cannot change weight", () => {
  const vertical = mountRuler(135);
  assert.equal(finger(vertical).claim(5, 40), false);
  assert.deepEqual(vertical.changes, []);
  const disabled = mountRuler(135, true);
  const blocked = finger(disabled);
  assert.equal(blocked.claim(-80), false);
  blocked.grant(); blocked.move(-80); blocked.release();
  assert.deepEqual(disabled.changes, []);

  const ruler = mountRuler(135);
  const drag = finger(ruler);
  assert.equal(drag.claim(-8), true);
  drag.grant();
  drag.addFinger();
  drag.move(-80); drag.release();
  assert.equal(ruler.props.value, 135.5, "valid single-finger movement remains, additional fingers do not add weight");
  assert.deepEqual(ruler.changes, [135.5]);
});

test("external coaching values and disabled updates cancel an in-flight drag", () => {
  for (const update of [{ value: 150 }, { disabled: true }]) {
    for (const delayed of [false, true]) {
      const ruler = mountRuler(135);
      if (delayed) ruler.delayEffects();
      const drag = finger(ruler);
      assert.equal(drag.claim(-8), true);
      drag.grant();
      ruler.update(update);
      const expected = ruler.props.value;
      drag.move(-80); drag.release();
      assert.equal(ruler.props.value, expected);
      assert.equal(ruler.position(), expected);
      assert.deepEqual(ruler.changes, [135.5], "a stale native move cannot overwrite a controlled edit");
    }
  }
});

test("large quick steps retain exact decimals, bounds and disabled state", () => {
  const ruler = mountRuler(135.25);
  ruler.event(() => ruler.button("Increase Weight by 10 pounds").onPress());
  assert.equal(ruler.props.value, 145.25);
  ruler.event(() => ruler.button("Decrease Weight by 5 pounds").onPress());
  assert.equal(ruler.props.value, 140.25);
  ruler.update({ value: 5.1 });
  ruler.event(() => ruler.button("Decrease Weight by 5 pounds").onPress());
  assert.equal(ruler.props.value, 0.1, "large steps do not save binary floating-point noise");
  assert.equal(ruler.display(), "0.1 lb");
  ruler.update({ value: 10.2 });
  ruler.event(() => ruler.button("Decrease Weight by 10 pounds").onPress());
  assert.equal(ruler.props.value, 0.2);
  assert.equal(ruler.display(), "0.2 lb");
  ruler.update({ value: 9999 });
  ruler.event(() => ruler.button("Increase Weight by 10 pounds").onPress());
  assert.equal(ruler.props.value, 10000);
  ruler.update({ value: 0 });
  ruler.event(() => ruler.button("Decrease Weight by 5 pounds").onPress());
  assert.equal(ruler.props.value, 0);
  ruler.update({ disabled: true });
  ruler.event(() => ruler.button("Increase Weight by 10 pounds").onPress());
  assert.equal(ruler.props.value, 0);
});

test("confirming an unchanged exact weight or an already blank field still records manual intent", () => {
  for (const initial of [135, NaN]) {
    const ruler = mountRuler(initial);
    const edited = new Set();
    const recordInteraction = ruler.props.onInteract;
    ruler.update({ onInteract: () => { recordInteraction(); edited.add(0); } });
    assert.deepEqual(ruler.interactions, [], "mounting and callback updates are not interactions");
    ruler.event(() => ruler.button("Enter exact Weight").onPress());
    assert.equal(ruler.interactions.length, 1, "opening the editor protects the field immediately");
    ruler.event(() => ruler.input().onChangeText(Number.isNaN(initial) ? "" : "135"));
    ruler.event(() => ruler.dialogAction("Done").onPress());
    assert.equal(ruler.interactions.length, 2, "valid same-value Done remains an explicit choice");
    assert.deepEqual(ruler.changes, [], "onChange still deduplicates unchanged values, including NaN");
    assert.equal(ruler.editorVisible(), false);
    const drafts = [{ weight: ruler.props.value }];
    assert.equal(fillUntouchedDraftWeights(drafts, 140, edited, { replaceSeeded: true }), drafts,
      "late history does not overwrite the unchanged or explicitly cleared choice");
  }
});

test("opening exact entry protects a seeded weight and its open dialog from late saved-weight prefill", () => {
  const ruler = mountRuler(50);
  const edited = new Set();
  const recordInteraction = ruler.props.onInteract;
  ruler.update({ onInteract: () => { recordInteraction(); edited.add(0); } });
  ruler.event(() => ruler.button("Enter exact Weight").onPress());
  assert.equal(ruler.editorVisible(), true);
  const drafts = [{ weight: 50, reps: 8 }, { weight: 50, reps: 8 }];
  const filled = fillUntouchedDraftWeights(drafts, 135, edited, { replaceSeeded: true });
  assert.equal(filled[0], drafts[0], "the open editor's field is already marked as manual");
  assert.equal(filled[1].weight, 135, "untouched neighboring seeds can still receive saved weight");
  ruler.update({ value: filled[0].weight });
  assert.equal(ruler.editorVisible(), true, "the parent history render does not close the editor");
  assert.equal(ruler.input().value, "50");
  assert.deepEqual(ruler.changes, []);
  ruler.event(() => ruler.input().onChangeText("55"));
  ruler.event(() => ruler.dialogAction("Done").onPress());
  assert.equal(ruler.props.value, 55);
  assert.deepEqual(ruler.events, [["interact", 50], ["interact", 50], ["change", 55]],
    "manual intent is reported before the changed value");
});

test("only enabled horizontal grants, explicit steps and valid exact actions report interaction", () => {
  const ruler = mountRuler(135);
  ruler.update({ value: 140 });
  assert.equal(finger(ruler).claim(2, 40), false);
  assert.equal(finger(ruler).claim(-24, 0, 2), false);
  assert.deepEqual(ruler.interactions, [], "controlled updates, vertical scroll and multitouch stay silent");
  ruler.update({ disabled: true });
  ruler.event(() => ruler.button("Enter exact Weight").onPress());
  ruler.event(() => ruler.button("Increase Weight by 10 pounds").onPress());
  ruler.event(() => ruler.input().onSubmitEditing());
  const disabledDrag = finger(ruler);
  assert.equal(disabledDrag.claim(-24), false);
  disabledDrag.grant(); disabledDrag.release();
  assert.deepEqual(ruler.interactions, []);
  ruler.update({ disabled: false });
  const drag = finger(ruler);
  assert.equal(drag.claim(-8), true);
  drag.grant(); drag.move(-8); drag.release();
  assert.deepEqual(ruler.events, [["interact", 140], ["change", 140.5], ["change", 141]],
    "one accepted gesture reports intent before any live ticks");

  const boundary = mountRuler(0);
  boundary.event(() => boundary.button("Decrease Weight by 5 pounds").onPress());
  assert.deepEqual(boundary.interactions, [0], "a clamped explicit step is still a manual choice");
  assert.deepEqual(boundary.changes, []);

  const invalid = mountRuler(135);
  invalid.event(() => invalid.button("Enter exact Weight").onPress());
  invalid.event(() => invalid.input().onChangeText("-1"));
  invalid.event(() => invalid.dialogAction("Done").onPress());
  assert.deepEqual(invalid.interactions, [135], "invalid Done adds no interaction beyond opening the editor");
  assert.deepEqual(invalid.changes, []);
  assert.equal(invalid.editorVisible(), true);
});
