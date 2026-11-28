import Foundation
import Vision

let image = URL(fileURLWithPath: CommandLine.arguments[1])
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["en-US"]
try VNImageRequestHandler(url: image, options: [:]).perform([request])
let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
  .joined(separator: " ").lowercased()
guard text.contains("overview"), text.contains("budget"), text.contains("spent") else {
  fputs("Local budget overview is not visible.\n", stderr)
  exit(1)
}
print("Release app reached the local budget overview without an account.")
