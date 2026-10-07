import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as programModel from "../src/features/programs/programModel.ts";

const require = createRequire(import.meta.url);
const { transformSync } = require("@babel/core");
function componentCode(name) {
  const filename = fileURLToPath(new URL(`../src/features/programs/${name}.tsx`, import.meta.url));
  return transformSync(readFileSync(filename, "utf8"), {
    filename, configFile: false, babelrc: false,
    plugins: [
      [require("@babel/plugin-transform-typescript"), { isTSX: true }],
      [require("@babel/plugin-transform-react-jsx"), { runtime: "automatic" }],
      require("@babel/plugin-transform-modules-commonjs")
    ]
  }).code;
}
const screenCode = componentCode("ProgramsScreen"), overviewCode = componentCode("ProgramOverview");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function program(id = "program", dayCount = 2) {
  return { id, name: id === "program" ? "My program" : "Other program", loadCoachingEnabled: false,
    createdAt: "2026-10-05", updatedAt: "2026-10-05", schedule: { mode: "cycle", startDate: "2026-10-05" },
    days: Array.from({ length: dayCount }, (_, index) => ({ id: `day-${index + 1}`, name: `Lift ${index + 1}`, kind: "training",
      exercises: [{ id: `lift-${index + 1}`, exerciseId: "bench", exerciseName: "Bench Press", sets: 3, target: { kind: "reps", reps: 8 } }] }))
  };
}

// Run the real screen's refresh hooks and its overview/actions without native
// layout. Persistence has separate web/SQLite tests; these cover when the UI
// offers starts after delayed, failed, resumed, and date-changing reads.
function mountPrograms({ programs = [program()], activeProgramId = "program", loadCompleted = async () => [] } = {}) {
  const slots = [], listeners = new Set(), foregroundListeners = new Set(), timers = new Set(), completionDates = [], routes = [];
  let index = 0, dirty = false, effects = [], tree, date = "2026-10-05";
  const state = { loadCompleted, loadLibrary: async () => ({ programs, activeProgramId }) };
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
    useMemo(callback, dependencies) {
      const slot = index++;
      if (!slots[slot] || dependencies.some((value, i) => !Object.is(value, slots[slot].dependencies[i]))) {
        slots[slot] = { dependencies, value: callback() };
      }
      return slots[slot].value;
    },
    useCallback(callback, dependencies) { return hooks.useMemo(() => callback, dependencies); },
    useEffect(effect, dependencies) {
      const slot = index++;
      if (!slots[slot] || dependencies.some((value, i) => !Object.is(value, slots[slot].dependencies[i]))) {
        effects.push(() => { slots[slot]?.cleanup?.(); slots[slot] = { dependencies, cleanup: effect() }; });
      }
    }
  };
  const mocks = {
    react: hooks,
    "react-native": {
      AppState: { addEventListener(_event, listener) { foregroundListeners.add(listener); return { remove: () => foregroundListeners.delete(listener) }; } },
      Platform: { OS: "web" }, StyleSheet: { hairlineWidth: 1 }, Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View"
    },
    "@expo/vector-icons": { Ionicons: "Ionicons" },
    "expo-router": { useFocusEffect: (effect) => hooks.useEffect(effect, [effect]), useRouter: () => ({ push: (route) => routes.push(route) }) },
    "../../theme/ThemeProvider": { useThemeStyles: () => ({ styles: {}, colors: {}, ui: {} }) },
    "../../theme/designSystem": { createThemedStyles: () => ({}) },
    "../../components/ScreenHeading": { ScreenHeading: "ScreenHeading" },
    "../exercises/ExerciseBrowser": { ExerciseBrowser: "ExerciseBrowser" },
    "./ProgramExerciseList": { ProgramExerciseList: "ProgramExerciseList" },
    "./programModel": { ...programModel, localDateKey: () => date },
    "./ProgramScheduleEditor": { emptyProgramDay: () => ({ id: "new-day", name: "", kind: "rest", exercises: [] }), ProgramScheduleEditor: "ProgramScheduleEditor" },
    "../workouts/repdbSessionExercises": { sessionExercises: [] },
    "../../storage/database": { createLocalId: (prefix) => `${prefix}-new` },
    "../../storage/programsRepository": { getProgramLibrary: () => state.loadLibrary() },
    "../../storage/workoutsRepository": { getActiveWorkoutSession: async () => null, getCompletedProgramDays: (key) => { completionDates.push(key); return state.loadCompleted(key); } },
    "../../storage/trainingChanges": { subscribeToTrainingChanges(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    "./ProgramImportScreen": { ProgramImportScreen: "ProgramImportScreen" },
    "./StarterProgramLibrary": { StarterProgramLibrary: "StarterProgramLibrary" },
    "./starterPrograms": { createStarterProgram: () => ({ ...program("starter"), name: "Starter preview" }), STARTER_GUIDANCE: "" },
    "../coach/CoachControls": { LoadCoachingToggle: "LoadCoachingToggle" }
  };
  function evaluate(code) {
    const module = { exports: {} };
    new Function("require", "module", "exports", "setInterval", "clearInterval", code)(
      (name) => mocks[name] ?? require(name), module, module.exports,
      (callback) => { timers.add(callback); return callback; }, (callback) => timers.delete(callback)
    );
    return module.exports;
  }
  mocks["./ProgramOverview"] = evaluate(overviewCode);
  const Screen = evaluate(screenCode).default;
  function render() {
    let passes = 0;
    do {
      assert.ok(passes++ < 12, "program updates settle");
      dirty = false; index = 0; effects = []; tree = Screen();
      for (const effect of effects) effect();
    } while (dirty);
  }
  function nodes(predicate, node = tree) {
    if (!node || typeof node !== "object") return [];
    if (typeof node.type === "function") return nodes(predicate, node.type(node.props));
    return [...(predicate(node) ? [node] : []), ...[node.props?.children].flat(Infinity).filter((child) => child !== undefined).flatMap((child) => nodes(predicate, child))];
  }
  async function flush() { for (let turn = 0; turn < 8; turn++) { await Promise.resolve(); render(); } }
  render();
  return {
    state, completionDates, routes, flush,
    text: () => nodes((node) => node.type === "Text").map((node) => [node.props.children].flat(Infinity).join("")).join("\n"),
    button: (label) => nodes((node) => node.type === "Pressable" && (node.props.accessibilityLabel === label || (!node.props.accessibilityLabel &&
      [node.props.children].flat(Infinity).some((child) => child?.type === "Text" && child.props.children === label))))[0],
    async press(label) {
      const button = this.button(label); assert.ok(button, `find program action: ${label}`); assert.ok(!button.props.disabled, `${label} is enabled`);
      await button.props.onPress(); await flush();
    },
    async previewStarter() { nodes((node) => node.type === "StarterProgramLibrary")[0].props.onPreview({ id: "starter", name: "Starter preview" }); render(); await flush(); },
    async trainingChanged() { for (const listener of listeners) listener(); await flush(); },
    async foreground() { for (const listener of foregroundListeners) listener("active"); await flush(); },
    setDate(key) { date = key; },
    async tickDate() { for (const timer of timers) timer(); await flush(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); }
  };
}

test("Programs hides a completed day's shortcuts while keeping other days and programs available", async () => {
  const screen = mountPrograms({ programs: [program(), program("other")], loadCompleted: async () => [{ programId: "program", dayId: "day-1" }] });
  await screen.flush();
  assert.match(screen.text(), /Completed today/);
  assert.equal(screen.button("Open today's session"), undefined);
  await screen.press("View program");
  assert.equal(screen.button("Start Day 1 · Lift 1"), undefined);
  assert.ok(screen.button("Start Day 2 · Lift 2"));
  await screen.press("Programs");
  await screen.press("View program Other program");
  assert.ok(screen.button("Start Day 1 · Lift 1"), "same day ID in another program is a separate workout");
  assert.doesNotMatch(screen.text(), /Completed today/);
  screen.unmount();
});

test("Programs observes successful completion writes and foreground retries without changing history", async () => {
  let completed = [];
  const screen = mountPrograms({ loadCompleted: async () => completed });
  await screen.flush();
  assert.ok(screen.button("Open today's session"));
  completed = [{ programId: "program", dayId: "day-1" }];
  await screen.trainingChanged();
  assert.equal(screen.button("Open today's session"), undefined);
  assert.match(screen.text(), /Completed today/);
  completed = [];
  await screen.foreground();
  assert.ok(screen.button("Open today's session"));
  assert.deepEqual(screen.routes, [], "refreshing never starts or saves a session");
  screen.unmount();
});

test("Programs ignores older completion responses and reads a new date after midnight", async () => {
  const first = deferred(), second = deferred();
  let request = 0;
  const screen = mountPrograms({ programs: [program("program", 1)], loadCompleted: () => ++request === 1 ? first.promise : second.promise });
  await screen.foreground();
  second.resolve([{ programId: "program", dayId: "day-1" }]); await screen.flush();
  first.resolve([]); await screen.flush();
  assert.equal(screen.button("Open today's session"), undefined, "older response cannot restore the start shortcut");
  const midnightRead = deferred();
  screen.state.loadCompleted = () => midnightRead.promise;
  await screen.foreground();
  screen.setDate("2026-10-06");
  screen.state.loadCompleted = async () => [];
  midnightRead.resolve([{ programId: "program", dayId: "day-1" }]); await screen.flush();
  assert.equal(screen.completionDates.at(-1), "2026-10-06", "a delayed yesterday response triggers a fresh calendar-date read");
  assert.ok(screen.button("Open today's session"), "the same day in a one-day cycle is eligible again tomorrow");
  assert.doesNotMatch(screen.text(), /Completed today/);
  screen.unmount();
});

test("completion read failures keep saved overview starts disabled until retry succeeds", async () => {
  const screen = mountPrograms(); await screen.flush();
  await screen.press("View program");
  screen.state.loadCompleted = async () => { throw new Error("Could not read completed workouts."); };
  await screen.trainingChanged();
  assert.match(screen.text(), /Could not read completed workouts/);
  assert.equal(screen.button("Start Day 1 · Lift 1").props.disabled, true);
  screen.state.loadCompleted = async () => [{ programId: "program", dayId: "day-1" }];
  await screen.press("Retry loading");
  assert.equal(screen.button("Start Day 1 · Lift 1"), undefined);
  assert.equal(screen.button("Start Day 2 · Lift 2").props.disabled, false);
  screen.unmount();
});

test("starter previews never inherit the saved program's completed badges", async () => {
  const screen = mountPrograms({ loadCompleted: async () => [{ programId: "program", dayId: "day-1" }] });
  await screen.flush(); await screen.previewStarter();
  assert.doesNotMatch(screen.text(), /Completed today/);
  assert.equal(screen.button("Start Day 1 · Lift 1"), undefined, "starter browsing remains read-only");
  assert.ok(screen.button("Activate Starter preview"));
  screen.unmount();
});

test("Programs uses the restarted day order instead of the weekly template's weekday and keeps completion protection", async () => {
  const weekly = { ...program("program", 7), schedule: { mode: "weekly", startDate: "2026-10-05" } };
  const before = structuredClone(weekly);
  let completed = [];
  const screen = mountPrograms({ programs: [weekly], loadCompleted: async () => completed });
  await screen.flush();
  screen.setDate("2026-10-06");
  screen.state.loadLibrary = async () => ({ programs: [weekly], activeProgramId: "program",
    activeSchedule: { mode: "cycle", startDate: "2026-10-06" }, restartedAt: "2026-10-06" });
  await screen.trainingChanged();
  assert.match(screen.text(), /Today · Day 1 · Lift 1/);
  assert.match(screen.text(), /Restarted at Day 1 today/);
  assert.doesNotMatch(screen.text(), /Today · Tuesday/);
  await screen.press("View program");
  assert.ok(screen.button("Start Day 1 · Lift 1"), "the overview shares the execution day labels");
  assert.match(screen.text(), /Following the program's day order/);
  completed = [{ programId: "program", dayId: "day-1" }];
  await screen.trainingChanged();
  assert.equal(screen.button("Start Day 1 · Lift 1"), undefined);
  assert.match(screen.text(), /Completed today/);
  await screen.press("Programs");
  assert.equal(screen.button("Open today's session"), undefined);
  screen.setDate("2026-10-07"); await screen.tickDate();
  assert.match(screen.text(), /Today · Day 2 · Lift 2/);
  assert.doesNotMatch(screen.text(), /Restarted at Day 1 today/);
  assert.deepEqual(weekly, before, "the saved template remains untouched by the screen");
  screen.unmount();
});
