// Reconstruct workout-log tables from word geometry, not OCR's reading order.
// Coordinates can be pixels or normalized, provided every word uses the same scale.
export type OcrWord = { text: string; x: number; y: number; width: number; height: number };
const numeric = /^\d+(?:\.\d+)?$/;
const date = /^\d{1,4}[/-]\d{1,2}[/-]\d{2,4}$/;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function wordsFromTsv(tsv: string): OcrWord[] {
  return tsv.split(/\r?\n/).flatMap((line) => {
    const cells = line.split("\t");
    const [x, y, width, height] = cells.slice(6, 10).map(Number);
    const text = cells.slice(11).join("\t").trim();
    return cells[0] === "5" && text && [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0 ? [{ text, x, y, width, height }] : [];
  });
}

export function workoutLogFromWords(input: OcrWord[], alternate: OcrWord[] = []): string | null {
  const words = input.filter((word) => word.text.trim() && [word.x, word.y, word.width, word.height].every(Number.isFinite) && word.width > 0 && word.height > 0);
  if (!words.length) return null;
  // Require a dated log; ordinary plans and unrelated three-column tables retain
  // their normal parser. Never infer what arbitrary numeric columns mean.
  if (!words.some((word) => date.test(word.text))) return null;
  // Existing labeled tables may use a different order. Leave their actual
  // headers intact for the header-aware parser instead of relabeling columns.
  if (words.some((word) => /^weight$/i.test(word.text)) && words.some((word) => /^sets$/i.test(word.text))) return null;
  const height = median(words.map((word) => word.height));
  const tolerance = height * 0.7;
  const groups: { edge: number; words: OcrWord[] }[] = [];
  for (const word of words.filter((word) => numeric.test(word.text))) {
    const edge = word.x + word.width;
    const group = groups.find((item) => Math.abs(item.edge - edge) <= tolerance);
    if (group) { group.words.push(word); group.edge = median(group.words.map((item) => item.x + item.width)); }
    else groups.push({ edge, words: [word] });
  }
  const columns = groups.filter((group) => group.words.length >= 3).sort((a, b) => b.words.length - a.words.length).slice(0, 3).sort((a, b) => a.edge - b.edge);
  if (columns.length !== 3 || columns.some((group, index) => index && group.edge - columns[index - 1].edge < height * 3)) return null;
  const [reps, weight, sets] = columns;
  const rows: { center: number; words: OcrWord[] }[] = [];
  for (const word of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const center = word.y + word.height / 2;
    const row = rows.find((item) => Math.abs(item.center - center) < height * 0.65);
    if (row) row.words.push(word);
    else rows.push({ center, words: [word] });
  }
  const output = ["Date | Exercise | Reps | Weight | Sets | Notes"];
  const corrections: string[] = [];
  let completeRows = 0;
  for (const row of rows.sort((a, b) => a.center - b.center)) {
    const cells: string[][] = Array.from({ length: 6 }, () => []);
    for (const word of row.words.sort((a, b) => a.x - b.x)) {
      const edge = word.x + word.width;
      const index = date.test(word.text) && word.x < reps.edge ? 0
        : word.x > sets.edge + height * 0.2 ? 5
        : word.x > weight.edge + height * 0.2 ? 4
        : word.x > reps.edge + height * 0.2 ? 3
        : Math.abs(edge - reps.edge) <= tolerance ? 2 : 1;
      let text = word.text;
      // A second segmentation pass can recover a dropped decimal. Only accept
      // identical digits at the same location, and expose both readings for review.
      if (index === 2 && /^\d+$/.test(text)) {
        const candidate = alternate.find((item) => /^\d+\.\d+$/.test(item.text) && item.text.replace(".", "") === text && Math.abs(item.x - word.x) < tolerance && Math.abs(item.y - word.y) < tolerance && Math.abs(item.width - word.width) < tolerance);
        if (candidate) { corrections.push(`OCR readings ${text} / ${candidate.text}: used ${candidate.text}. Verify the decimal in the screenshot.`); text = candidate.text; }
      }
      cells[index].push(text.replace(/\|/g, "/"));
    }
    if (cells[2].length && cells[3].length && cells[4].length) completeRows++;
    output.push(`| ${cells.map((cell) => cell.join(" ")).join(" | ")} |`);
  }
  if (completeRows < 3) return null;
  return [...output, ...[...new Set(corrections)].map((note) => `Notes: ${note}`)].join("\n");
}
