import type { ProgressPersonalRecordPoint } from "../../storage/workoutsRepository";

export type RunningPrPoint = ProgressPersonalRecordPoint & { value: number; isNewPr: boolean };

/** Build records from full chronological history before choosing a chart window. */
export function getRunningPrSeries(data: readonly ProgressPersonalRecordPoint[]): RunningPrPoint[] {
  let record: ProgressPersonalRecordPoint | null = null;
  return data.map((point) => {
    const isNewPr = record === null || point.weight > record.weight;
    if (isNewPr) record = point;
    const source = record!;
    return {
      ...point, weight: source.weight, reps: source.reps, exerciseName: source.exerciseName,
      value: source.weight, isNewPr
    };
  });
}
