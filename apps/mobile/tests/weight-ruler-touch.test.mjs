import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as model from "../src/features/workouts/weightRulerModel.ts";

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
  let effects = [];
  let tree;
  const changes = [];
  const props = { label: "Weight", value, disabled, onChange(next) { changes.push(next); props.value = next; dirty = true; } };
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
    useEffect(effect, dependencies) {
      const slot = index++;
      if (!slots[slot] || dependencies.some((value, i) => !Object.is(value, slots[slot].dependencies[i]))) {
        effects.push(() => { slots[slot]?.cleanup?.(); slots[slot] = { dependencies, cleanup: effect() }; });
      }
    }
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

  function render() {
    let passes = 0;
    do {
      assert.ok(passes++ < 10, "component updates settle");
      dirty = false; index = 0; effects = [];
      tree = WeightRuler(props);
      for (const effect of effects) effect();
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
    changes, props,
    event(action) { const result = action(); render(); return result; },
    update(next) { Object.assign(props, next); render(); },
    handlers() { return find((node) => typeof node.props?.onMoveShouldSetResponderCapture === "function").props; },
    display() { return find((node) => node.type === "Text" && (node.props.children === "Select weight" || /^\d+(\.\d+)? lb$/.test(node.props.children))).props.children; },
    button(label) { return find((node) => node.type === "Pressable" && node.props.accessibilityLabel === label).props; },
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
    claim(dx, dy = 0) {
      this.coordinates(dx, dy);
      return ruler.event(() => handlers.onMoveShouldSetResponderCapture(event()) || handlers.onMoveShouldSetResponder(event()));
    },
    coordinates(dx, dy = 0) {
      time += 16;
      record = { ...record, previousPageX: x, previousPageY: y, previousTimeStamp: record.currentTimeStamp,
        currentPageX: x += dx, currentPageY: y += dy, currentTimeStamp: time };
    },
    grant() { ruler.event(() => handlers.onResponderGrant(event())); },
    move(dx, dy = 0) { this.coordinates(dx, dy); ruler.event(() => handlers.onResponderMove(event())); },
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
    const ruler = mountRuler(135);
    const drag = finger(ruler);
    assert.equal(drag.claim(-8), true);
    drag.grant();
    ruler.update(update);
    const expected = ruler.props.value;
    drag.move(-80); drag.release();
    assert.equal(ruler.props.value, expected);
    assert.equal(ruler.position(), expected);
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
