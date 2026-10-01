import { createWorker, PSM, type Worker } from "tesseract.js";
import { abortableOcr, formatOcrProgress, validateImportImage, type ImportImage, type OcrOptions } from "./importOcr.shared";
import { wordsFromTsv, workoutLogFromWords } from "./importOcrLayout";

export function screenshotImportSupported() { return typeof window !== "undefined" && typeof WebAssembly !== "undefined" && typeof window.Worker !== "undefined"; }

export async function readImportScreenshot(image: ImportImage, { signal, onProgress }: OcrOptions): Promise<string> {
  validateImportImage(image);
  if (!screenshotImportSupported()) throw new Error("This browser cannot run local OCR. Paste your workout text instead.");
  if (signal.aborted) throw new Error("Screenshot reading cancelled.");
  let worker: Worker | undefined;
  let stopped = false;
  const stop = () => { stopped = true; if (worker) { void worker.terminate().catch(() => {}); worker = undefined; } };
  const operation = (async () => {
    try {
      // Versioned public OCR assets only. The selected image stays in this browser's worker.
      const loaded = await createWorker("eng", 1, {
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
        langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int",
        logger: ({ status, progress }) => { if (!stopped && !signal.aborted) onProgress(formatOcrProgress(status, progress)); },
        errorHandler: () => {},
      });
      if (stopped || signal.aborted) { await loaded.terminate(); throw new Error("Screenshot reading cancelled."); }
      worker = loaded;
      await loaded.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const result = await loaded.recognize(image.file ?? image.uri, {}, { text: true, tsv: true });
      const words = wordsFromTsv(result.data.tsv ?? "");
      const table = workoutLogFromWords(words);
      if (table && !stopped && !signal.aborted) {
        onProgress("Checking table columns and decimal reps…");
        await loaded.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const alternate = await loaded.recognize(image.file ?? image.uri, {}, { text: true, tsv: true });
        return workoutLogFromWords(words, wordsFromTsv(alternate.data.tsv ?? "")) ?? table;
      }
      return result.data.text.trim();
    } finally { stop(); }
  })();
  try { return await abortableOcr(operation, signal, stop); }
  catch (error) {
    if (signal.aborted || (error instanceof Error && /timed out/.test(error.message))) throw error;
    throw new Error("Couldn't read this screenshot. Use a clear PNG/JPG, and allow internet access for the initial OCR download. You can also paste the text.");
  }
}
