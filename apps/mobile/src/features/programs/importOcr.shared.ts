import { IMPORT_LIMITS } from "./importProgram";

export type ImportImage = { uri: string; width: number; height: number; fileSize?: number; mimeType?: string; file?: File };
export type OcrOptions = { signal: AbortSignal; onProgress: (message: string) => void };

export function formatOcrProgress(status: string, progress: number) {
  const percent = Math.round(Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)) * 100);
  if (status === "recognizing text") return `Reading screenshot · ${percent}%`;
  if (status === "loading language traineddata") return `Loading English text model · ${percent}%`;
  if (status === "loading tesseract core") return `Loading local reader · ${percent}%`;
  if (status === "initializing api") return "Starting local reader…";
  return "Preparing local OCR · first use downloads reading tools…";
}

export function validateImportImage(image: ImportImage) {
  if (!/^(file:|content:|blob:|data:image\/)/i.test(image.uri)) throw new Error("Choose a local screenshot, not an image link.");
  if (image.mimeType && !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType.toLowerCase())) throw new Error("Choose a PNG, JPG or WebP screenshot.");
  if ((image.file?.size ?? image.fileSize ?? 0) > IMPORT_LIMITS.imageBytes) throw new Error("Choose a screenshot under 15 MB.");
  if (!Number.isFinite(image.width * image.height) || image.width < 1 || image.height < 1 || image.width * image.height > IMPORT_LIMITS.imagePixels) throw new Error("Choose a screenshot with fewer than 24 million pixels.");
}

export function abortableOcr<T>(operation: Promise<T>, signal: AbortSignal, cleanup: () => void = () => {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); };
    const cancel = () => { finish(); cleanup(); reject(new Error("Screenshot reading cancelled.")); };
    const timer = setTimeout(() => { finish(); cleanup(); reject(new Error("Screenshot reading timed out. Try a smaller, clearer crop or paste the text.")); }, 90000);
    signal.addEventListener("abort", cancel, { once: true });
    operation.then((result) => { finish(); resolve(result); }, (error) => { finish(); reject(error); });
    if (signal.aborted) cancel();
  });
}
