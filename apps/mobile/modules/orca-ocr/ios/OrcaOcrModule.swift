import ExpoModulesCore
import Vision

public class OrcaOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OrcaOcr")
    Constants(["isSupported": true])
    AsyncFunction("extractTextFromImage") { (uri: String) -> [String] in
      guard let url = URL(string: uri), url.isFileURL else {
        throw NSError(domain: "OrcaOcr", code: 1, userInfo: [NSLocalizedDescriptionKey: "Choose a local screenshot."])
      }
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.recognitionLanguages = ["en-US"]
      request.usesLanguageCorrection = false
      // The URL handler honors the image's orientation metadata; no network is used.
      try VNImageRequestHandler(url: url, options: [:]).perform([request])
      return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    }
  }
}
