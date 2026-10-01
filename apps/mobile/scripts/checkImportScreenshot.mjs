// Local-only OCR smoke test. No image upload or output file is created.
// Usage: node scripts/checkImportScreenshot.mjs /absolute/path/to/screenshot.png [OCR-cache-directory]
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { createWorker, PSM } from "tesseract.js";
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes("/features/programs/") && ["./programModel", "../exercises/exerciseSearch"].includes(specifier)) return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
  return next(specifier, context);
} });
const { parseProgramImport, getImportIssues } = await import("../src/features/programs/importProgram.ts");
const { wordsFromTsv, workoutLogFromWords } = await import("../src/features/programs/importOcrLayout.ts");
const { toCatalogMetadata } = await import("../src/features/exercises/exerciseSearch.ts");
const image = process.argv[2];
if (!image || !image.startsWith("/")) throw new Error("Pass an absolute path to a local screenshot.");
const worker = await createWorker("eng", 1, { cachePath: process.argv[3] ?? "/private/tmp", langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int" });
try {
  await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  const primary = await worker.recognize(image, {}, { text: true, tsv: true });
  const words = wordsFromTsv(primary.data.tsv ?? "");
  let source = primary.data.text;
  if (workoutLogFromWords(words)) {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const alternate = await worker.recognize(image, {}, { text: true, tsv: true });
    source = workoutLogFromWords(words, wordsFromTsv(alternate.data.tsv ?? ""));
  }
  const catalog = JSON.parse(readFileSync(new URL("../assets/repdb/exercises.json", import.meta.url), "utf8")).exercises.map(toCatalogMetadata);
  const result = parseProgramImport(source, catalog, "2026-01-01", { roundPartialReps: true });
  console.log(JSON.stringify({ source, ...result, issues: getImportIssues(result.draft) }, null, 2));
} finally { await worker.terminate(); }
