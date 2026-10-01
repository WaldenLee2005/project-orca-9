import { requireOptionalNativeModule } from "expo";
import { abortableOcr, validateImportImage, type ImportImage, type OcrOptions } from "./importOcr.shared";

type TextExtractor = { isSupported: boolean; extractTextFromImage: (uri: string) => Promise<string[]> };
// Local Expo module autolinks in development/production builds; Expo Go remains safe.
const extractor = requireOptionalNativeModule<TextExtractor>("OrcaOcr");
export function screenshotImportSupported() { return Boolean(extractor?.isSupported); }

export async function readImportScreenshot(image: ImportImage, { signal, onProgress }: OcrOptions): Promise<string> {
  validateImportImage(image);
  if (!extractor?.isSupported) throw new Error("Screenshot OCR needs an Orca development build, not Expo Go. Open the web app or paste text instead.");
  if (signal.aborted) throw new Error("Screenshot reading cancelled.");
  onProgress("Reading screenshot on this device…");
  const lines = await abortableOcr(extractor.extractTextFromImage(image.uri), signal);
  return lines.join("\n").trim();
}
