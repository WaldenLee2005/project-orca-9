// Actual-set storage accepts 0–10,000 lb. The ruler shares those bounds,
// but only user gestures/steps snap: mounting must preserve exact saved values.
export const MIN_WEIGHT = 0;
export const MAX_WEIGHT = 10000;
export const WEIGHT_STEP = 0.5;
export const WEIGHT_TICK_SPACING = 8;

export function boundedWeight(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, value)) : MIN_WEIGHT;
}

export function snapWeight(value: number): number {
  return Math.round(boundedWeight(value) / WEIGHT_STEP) * WEIGHT_STEP;
}

export function stepWeight(value: number, direction: 1 | -1): number {
  const steps = boundedWeight(value) / WEIGHT_STEP;
  // Move to the next tick in the requested direction, including off-grid loads.
  const next = direction === 1 ? Math.floor(steps + 1e-9) + 1 : Math.ceil(steps - 1e-9) - 1;
  return boundedWeight(next * WEIGHT_STEP);
}

export function weightFromDrag(startWeight: number, distanceX: number): number {
  if (!Number.isFinite(distanceX)) return boundedWeight(startWeight);
  return boundedWeight(boundedWeight(startWeight) - distanceX * WEIGHT_STEP / WEIGHT_TICK_SPACING);
}

export function isHorizontalWeightGesture(distanceX: number, distanceY: number, touches: number): boolean {
  return touches === 1 && Math.abs(distanceX) > 5 && Math.abs(distanceX) > Math.abs(distanceY) * 1.5;
}

export type WeightTick = { weight: number; left: number; kind: "half" | "one" | "five" | "ten" };

export function visibleWeightTicks(position: number, measuredWidth: number): WeightTick[] {
  // Render only the viewport. Even an invalid/oversized layout cannot allocate
  // the 20,001 ticks supported by the full storage range.
  const width = Number.isFinite(measuredWidth) ? Math.min(1200, Math.max(0, measuredWidth)) : 0;
  if (!width) return [];
  const center = boundedWeight(position);
  const radius = (width / 2 + 24) * WEIGHT_STEP / WEIGHT_TICK_SPACING;
  const first = Math.max(0, Math.floor((center - radius) / WEIGHT_STEP));
  const last = Math.min(MAX_WEIGHT / WEIGHT_STEP, Math.ceil((center + radius) / WEIGHT_STEP));
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const step = first + index;
    const weight = step * WEIGHT_STEP;
    return {
      weight,
      left: width / 2 + (weight - center) * WEIGHT_TICK_SPACING / WEIGHT_STEP,
      kind: step % 20 === 0 ? "ten" : step % 10 === 0 ? "five" : step % 2 === 0 ? "one" : "half"
    };
  });
}

export function formatWeight(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

export function parseWeightInput(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return NaN;
  if (!/^\d{1,5}(\.\d{0,2})?$/.test(trimmed) && !/^\.\d{1,2}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= MIN_WEIGHT && value <= MAX_WEIGHT ? value : null;
}
