import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as weightHistory from "../src/features/workouts/weightHistory.ts";
import * as setDraftNotes from "../src/features/workouts/setDraftNotes.ts";

const require = createRequire(import.meta.url);
const { transformSync } = require("@babel/core");
const componentPath = fileURLToPath(new URL("../src/features/coach/CoachedSetLogger.tsx", import.meta.url));
const code = transformSync(readFileSync(componentPath, "utf8"), {
  filename: componentPath, configFile: false, babelrc: false,
  plugins: [
    [require("@babel/plugin-transform-typescript"), { isTSX: true }],
    [require("@babel/plugin-transform-react-jsx"), { runtime: "automatic" }],
    require("@babel/plugin-transform-modules-commonjs")
  ]
}).code;

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const history = (weight = 135) => [{
  sessionId: "completed-session", exerciseId: "bench",
  performedAt: new Date(Date.now() - 86400000).toISOString(),
  actualSets: [{ weight, reps: 8, warmup: false }]
}];
const programEntry = (extra = {}) => ({
  id: "planned-bench", exerciseId: "bench", exerciseName: "Bench", sets: 3,
  target: { kind: "reps", reps: 8 }, ...extra
});

// Exercise the real logger's hooks and event handlers with controlled history
// promises. Rendering the child controls is unnecessary for these draft races;
// native ruler events have their own installed-PanResponder regression tests.
function mountLogger(initialProps = {}) {
  const slots = [];
  let index = 0, dirty = false, effects = [], tree;
  const activeListeners = new Set();
  const saved = [];
  const props = {
    exerciseId: "bench", readiness: {}, onReadiness() {}, saving: false,
    loadHistory: async () => [], onSave: async (sets) => { saved.push(sets); },
    ...initialProps
  };
  const hooks = {
    useRef(initial) { const slot = index++; return slots[slot] ??= { current: initial }; },
    useState(initial) {
      const slot = index++;
      slots[slot] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[slot].value, (next) => {
        const value = typeof next === "function" ? next(slots[slot].value) : next;
        if (!Object.is(value, slots[slot].value)) { slots[slot].value = value; dirty = true; }
      }];
    },
    useEffect(effect, dependencies) {
      const slot = index++;
      if (!slots[slot] || dependencies.some((value, i) => !Object.is(value, slots[slot].dependencies[i]))) {
        effects.push(() => {
          slots[slot]?.cleanup?.();
          slots[slot] = { dependencies, cleanup: effect() };
        });
      }
    }
  };
  const mocks = {
    react: hooks,
    "react-native": {
      AppState: { addEventListener(_event, listener) { activeListeners.add(listener); return { remove: () => activeListeners.delete(listener) }; } },
      Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View"
    },
    "@expo/vector-icons": { Ionicons: "Ionicons" },
    "../programs/ExerciseTargetEditor": { NumberField: "NumberField", DurationFields: "DurationFields" },
    "../../storage/workoutsRepository": {
      getCoachHistory: async () => [], MAX_SET_NOTE_LENGTH: 1000,
      validateActualSets(sets) { if (sets.some((set) => !Number.isFinite(set.weight))) throw new Error("Choose a weight for every set."); }
    },
    "./coachModel": {
      evaluateCoach({ entry, history }) { return {
        key: `${entry.exerciseId}:${history[0]?.actualSets[0].weight ?? "empty"}`,
        title: "Keep today's work short", explanation: "Keep your actual weights.",
        canApply: true, sets: 2, weight: null, daysAway: 1
      }; }
    },
    "./CoachControls": { CoachButton: "CoachButton", ReadinessCheck: "ReadinessCheck", themedCoachStyles: {} },
    "../../theme/ThemeProvider": { useThemeStyles: () => ({ styles: {}, colors: {} }) },
    "../workouts/setDraftNotes": setDraftNotes,
    "../workouts/WeightRuler": { WeightRuler: "WeightRuler" },
    "../workouts/EffortSelector": { EffortSelector: "EffortSelector" },
    "../workouts/weightHistory": weightHistory
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "setInterval", "clearInterval", code)(
    (name) => mocks[name] ?? require(name), module, module.exports, () => 1, () => {}
  );
  const { CoachedSetLogger } = module.exports;

  function render() {
    let passes = 0;
    do {
      assert.ok(passes++ < 12, "logger updates settle");
      dirty = false; index = 0; effects = [];
      tree = CoachedSetLogger(props);
      for (const effect of effects) effect();
    } while (dirty);
  }
  function nodes(predicate, node = tree) {
    if (!node || typeof node !== "object") return [];
    return [
      ...(predicate(node) ? [node] : []),
      ...[node.props?.children].flat(Infinity).filter((child) => child !== undefined).flatMap((child) => nodes(predicate, child))
    ];
  }
  async function flush() {
    for (let turn = 0; turn < 4; turn++) { await Promise.resolve(); render(); }
  }
  render();
  return {
    saved, props, flush,
    weights: () => nodes((node) => node.type === "WeightRuler").map((node) => node.props.value),
    reps: () => nodes((node) => node.type === "NumberField").map((node) => node.props.value),
    efforts: () => nodes((node) => node.type === "EffortSelector").map((node) => node.props.value),
    notes: () => nodes((node) => node.type?.name === "SetNoteField").map((node) => node.props.value),
    text: () => nodes((node) => node.type === "Text").map((node) => [node.props.children].flat(Infinity).join("")).join("\n"),
    changeWeight(row, value) { nodes((node) => node.type === "WeightRuler")[row].props.onChange(value); render(); },
    changeReps(row, value) { nodes((node) => node.type === "NumberField")[row].props.onChange(value); render(); },
    changeEffort(row, value) { nodes((node) => node.type === "EffortSelector")[row].props.onChange(value); render(); },
    changeNote(row, value) { nodes((node) => node.type?.name === "SetNoteField")[row].props.onChange(value); render(); },
    remove(row) { nodes((node) => node.type === "Pressable" && node.props.accessibilityLabel === `Remove set ${row + 1}`)[0].props.onPress(); render(); },
    async press(label) {
      const button = nodes((node) => node.type === "CoachButton" && node.props.label === label)[0];
      assert.ok(button, `find logger action: ${label}`);
      await button.props.onPress(); await flush();
    },
    async foreground() { for (const listener of activeListeners) listener("active"); await flush(); },
    async update(next) { Object.assign(props, next); render(); await flush(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); }
  };
}

test("coaching-off logger centers blank drafts on real recent weights without saving results", async () => {
  const pending = deferred();
  const logger = mountLogger({ loadHistory: () => pending.promise });
  assert.ok(logger.weights().every(Number.isNaN));
  pending.resolve(history()); await logger.flush();
  assert.deepEqual(logger.weights(), [135, 135, 135]);
  assert.match(logger.text(), /Recent average: 135 lb/);
  assert.deepEqual(logger.saved, [], "prefilling never persists completed results");
  logger.unmount();
});

test("custom logger uses saved names across new selection/native IDs and keeps catalog names separate", async () => {
  const customHistory = [
    { ...history(100)[0], sessionId: "custom-web", exerciseId: "custom-old-web-id", exerciseName: "  My Bench  " },
    { ...history(150)[0], sessionId: "custom-native", exerciseId: "custom-native-row-id", exerciseName: "MY BENCH" },
    { ...history(500)[0], sessionId: "catalog", exerciseId: "catalog-bench", exerciseName: "My Bench" }
  ];
  const logger = mountLogger({ exerciseId: "custom-new-selection", exerciseName: "my bench", loadHistory: async () => customHistory });
  await logger.flush();
  assert.deepEqual(logger.weights(), [125, 125, 125]);
  assert.match(logger.text(), /Recent average: 125 lb · 2 workouts/);
  assert.deepEqual(logger.saved, []);
  logger.unmount();
});

test("delayed history preserves manual decimals, deliberate clearing, reps and private notes", async () => {
  const pending = deferred();
  const logger = mountLogger({ loadHistory: () => pending.promise });
  logger.changeWeight(0, 142.25);
  logger.changeWeight(1, NaN);
  logger.changeReps(2, 11);
  logger.changeNote(2, "Keep my tempo note");
  pending.resolve(history()); await logger.flush();
  assert.equal(logger.weights()[0], 142.25);
  assert.ok(Number.isNaN(logger.weights()[1]));
  assert.equal(logger.weights()[2], 135);
  assert.deepEqual(logger.reps(), [8, 8, 11]);
  assert.equal(logger.notes()[2], "Keep my tempo note");
  logger.unmount();
});

test("removing an earlier row remaps a cleared weight and copying protects the new draft", async () => {
  const pending = deferred();
  const logger = mountLogger({ loadHistory: () => pending.promise });
  logger.changeWeight(1, NaN);
  logger.remove(0);
  await logger.press("Add set (copy last values)");
  pending.resolve(history()); await logger.flush();
  assert.ok(Number.isNaN(logger.weights()[0]), "explicit clearing follows the surviving row");
  assert.equal(logger.weights()[1], 135, "untouched surviving row still receives history");
  assert.ok(Number.isNaN(logger.weights()[2]), "copied draft keeps the copied blank selection");
  logger.unmount();
});

test("prescribed weights retain priority and timed/no-history drafts do not invent load", async () => {
  const load = { unit: "lb", weight: 50, increment: 5, convention: "total", equipmentKey: "Barbell" };
  const comparableHistory = history();
  comparableHistory[0].prescription = programEntry({ load });
  const prescribed = mountLogger({ entry: programEntry({ load }), loadHistory: async () => comparableHistory });
  await prescribed.flush();
  assert.deepEqual(prescribed.weights(), [50, 50, 50]);
  assert.match(prescribed.text(), /Recent average: 135 lb/);
  prescribed.changeReps(0, 11);
  prescribed.changeNote(1, "Preserve my private note");
  prescribed.changeEffort(2, "hard");
  await prescribed.press("Use recent 135 lb for all sets");
  assert.deepEqual(prescribed.weights(), [135, 135, 135], "an explicit action can select history over program weight");
  assert.deepEqual(prescribed.reps(), [11, 8, 8]);
  assert.equal(prescribed.notes()[1], "Preserve my private note");
  assert.equal(prescribed.efforts()[2], "hard");
  prescribed.unmount();
  for (const props of [
    { loadHistory: async () => [] },
    { entry: programEntry({ target: { kind: "duration", seconds: 45 } }), loadHistory: async () => history() }
  ]) {
    const logger = mountLogger(props); await logger.flush();
    assert.ok(logger.weights().every(Number.isNaN));
    logger.unmount();
  }
});

test("newest history response wins, then foreground refresh leaves chosen baseline intact", async () => {
  const first = deferred(), second = deferred();
  let request = 0;
  const logger = mountLogger({ loadHistory: () => ++request === 1 ? first.promise : request === 2 ? second.promise : Promise.resolve(history(145)) });
  await logger.foreground();
  second.resolve(history(140)); await logger.flush();
  assert.deepEqual(logger.weights(), [140, 140, 140]);
  first.resolve(history(135)); await logger.flush();
  assert.deepEqual(logger.weights(), [140, 140, 140], "older response cannot seed or replace newer data");
  logger.changeWeight(1, NaN);
  await logger.foreground();
  assert.equal(logger.weights()[0], 140);
  assert.ok(Number.isNaN(logger.weights()[1]), "a later refresh does not refill explicit clearing");
  logger.unmount();
});

test("a failed history read can recover without clearing a separate manual save error", async () => {
  let fail = true;
  const logger = mountLogger({ loadHistory: async () => { if (fail) throw new Error("offline read failure"); return history(); } });
  await logger.flush();
  assert.match(logger.text(), /Recent weights could not be read/);
  await logger.press("Save completed exercise");
  assert.match(logger.text(), /Choose a weight for every set/);
  fail = false; await logger.foreground();
  assert.doesNotMatch(logger.text(), /Recent weights could not be read/);
  assert.match(logger.text(), /Choose a weight for every set/, "refresh clears its own error only");
  assert.deepEqual(logger.weights(), [135, 135, 135]);
  logger.unmount();
});

test("replaced history loaders ignore stale completion from the old effect", async () => {
  const obsolete = deferred();
  const logger = mountLogger({ loadHistory: () => obsolete.promise });
  await logger.update({ loadHistory: async () => history(150) });
  assert.deepEqual(logger.weights(), [150, 150, 150]);
  obsolete.resolve(history(135)); await logger.flush();
  assert.deepEqual(logger.weights(), [150, 150, 150]);
  logger.unmount();
});

test("coach apply/undo and coaching toggles retain the original prefill and subsequent manual selections", async () => {
  let currentHistory = history(135);
  const logger = mountLogger({ entry: programEntry(), coachingEnabled: true, loadHistory: async () => currentHistory });
  await logger.flush();
  assert.deepEqual(logger.weights(), [135, 135, 135]);
  logger.changeNote(0, "Keep this through coaching");
  await logger.press("Use for today");
  assert.deepEqual(logger.weights(), [135, 135]);
  await logger.press("Undo suggestion");
  assert.deepEqual(logger.weights(), [135, 135, 135]);
  assert.equal(logger.notes()[0], "Keep this through coaching");
  logger.changeWeight(0, 140);
  currentHistory = history(145); await logger.foreground();
  await logger.update({ coachingEnabled: false });
  assert.deepEqual(logger.weights(), [140, 135, 135]);
  logger.unmount();
});
