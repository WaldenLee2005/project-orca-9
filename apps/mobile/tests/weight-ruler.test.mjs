import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boundedWeight, formatWeight, isHorizontalWeightGesture, MAX_WEIGHT,
  parseWeightInput, snapWeight, stepWeight, visibleWeightTicks, weightFromDrag
} from "../src/features/workouts/weightRulerModel.ts";

test("swiping follows the moving scale, stays smooth, then snaps at half pounds", () => {
  assert.equal(weightFromDrag(100, -160), 110);
  assert.equal(weightFromDrag(100, 8), 99.5);
  assert.equal(weightFromDrag(100, -3), 100.1875, "movement is continuous before release");
  assert.equal(snapWeight(weightFromDrag(100, -3)), 100);
  assert.equal(snapWeight(weightFromDrag(100, -5)), 100.5);
  assert.equal(weightFromDrag(NaN, -8), 0.5, "blank entry starts its chosen scale at zero");
});

test("ruler and accessible steps respect actual-set bounds and off-grid loads", () => {
  assert.equal(weightFromDrag(0, 1000), 0);
  assert.equal(weightFromDrag(MAX_WEIGHT, -1000), MAX_WEIGHT);
  assert.equal(snapWeight(-10), 0);
  assert.equal(snapWeight(MAX_WEIGHT + 1), MAX_WEIGHT);
  assert.equal(stepWeight(MAX_WEIGHT, 1), MAX_WEIGHT);
  assert.equal(stepWeight(0, -1), 0);
  assert.equal(stepWeight(12.25, 1), 12.5);
  assert.equal(stepWeight(12.25, -1), 12);
  assert.equal(stepWeight(12.5, 1), 13);
  assert.equal(stepWeight(12.5, -1), 12);
  assert.equal(boundedWeight(Infinity), 0);
  assert.equal(weightFromDrag(12.25, NaN), 12.25);
});

test("vertical scroll and multi-touch do not take control of the weight", () => {
  assert.equal(isHorizontalWeightGesture(3, 0, 1), false);
  assert.equal(isHorizontalWeightGesture(10, 20, 1), false);
  assert.equal(isHorizontalWeightGesture(10, 10, 1), false);
  assert.equal(isHorizontalWeightGesture(12, 5, 1), true);
  assert.equal(isHorizontalWeightGesture(-12, 5, 1), true);
  assert.equal(isHorizontalWeightGesture(12, 5, 2), false);
});

test("viewport ticks distinguish half, one, five and ten pound markings", () => {
  const ticks = visibleWeightTicks(100, 320);
  assert.equal(ticks.find((tick) => tick.weight === 100).kind, "ten");
  assert.equal(ticks.find((tick) => tick.weight === 105).kind, "five");
  assert.equal(ticks.find((tick) => tick.weight === 101).kind, "one");
  assert.equal(ticks.find((tick) => tick.weight === 100.5).kind, "half");
  assert.equal(ticks.find((tick) => tick.weight === 100).left, 160);
  assert.equal(ticks.find((tick) => tick.weight === 100.5).left, 168);
  assert.ok(ticks.length < 50);
  assert.ok(visibleWeightTicks(5000, 1e9).length < 160, "large stored weights/layouts stay bounded");
  assert.ok(visibleWeightTicks(0, 320).every((tick) => tick.weight >= 0));
  assert.ok(visibleWeightTicks(MAX_WEIGHT, 320).every((tick) => tick.weight <= MAX_WEIGHT));
  assert.deepEqual(visibleWeightTicks(100, NaN), []);
  assert.deepEqual(visibleWeightTicks(100, 0), []);
});

test("exact entry preserves blank and decimal loads without ruler rounding", () => {
  assert.equal(formatWeight(NaN), "");
  assert.equal(formatWeight(12.25), "12.25");
  assert.equal(parseWeightInput("12.25"), 12.25);
  assert.equal(parseWeightInput("12,25"), 12.25);
  assert.equal(parseWeightInput(".5"), 0.5);
  assert.equal(parseWeightInput("10000"), MAX_WEIGHT);
  assert.equal(parseWeightInput("0"), 0);
  assert.ok(Number.isNaN(parseWeightInput("")), "clearing does not invent bodyweight/no-load data");
  for (const text of ["10000.5", "-1", "1e3", "12.123", "NaN", "Infinity", ".", "12,2,5"]) {
    assert.equal(parseWeightInput(text), null, `reject invalid exact entry ${text}`);
  }
});
