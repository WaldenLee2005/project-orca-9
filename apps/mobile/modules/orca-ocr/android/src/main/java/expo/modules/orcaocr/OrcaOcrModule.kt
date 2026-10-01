package expo.modules.orcaocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OrcaOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OrcaOcr")
    Constants("isSupported" to true)
    AsyncFunction("extractTextFromImage") { uriString: String, promise: Promise ->
      try {
        val uri = Uri.parse(uriString)
        require(uri.scheme == "file" || uri.scheme == "content") { "Choose a local screenshot." }
        val context = appContext.reactContext ?: throw IllegalStateException("App is unavailable")
        val image = InputImage.fromFilePath(context, uri)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
          recognizer.process(image)
            .addOnSuccessListener { result -> promise.resolve(result.textBlocks.flatMap { block -> block.lines.map { it.text } }) }
            .addOnFailureListener { error -> promise.reject(CodedException("OCR_FAILED", "Could not read the screenshot", error)) }
            .addOnCompleteListener { recognizer.close() }
        } catch (error: Exception) {
          recognizer.close()
          throw error
        }
      } catch (error: Exception) {
        promise.reject(CodedException("OCR_FAILED", "Could not read the screenshot", error))
      }
    }
  }
}
