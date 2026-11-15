import Foundation
import ImageIO
import Vision

enum ReceiptOcrError: LocalizedError {
  case localFileRequired, oversized, tooManyPixels, unreadable, noText, tooMuchText

  var errorDescription: String? {
    switch self {
    case .localFileRequired: return "Choose a receipt from this device."
    case .oversized: return "File exceeds 8 MB."
    case .tooManyPixels: return "Photo exceeds 50 megapixels. Use a smaller photo."
    case .unreadable: return "Cannot read this image on-device. Try cloud OCR."
    case .noText: return "No readable text. Retake the photo or try cloud OCR."
    case .tooMuchText: return "Too much text in this image. Try cloud OCR."
    }
  }
}

struct ReceiptTextBounds: Codable {
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct ReceiptTextLine: Codable {
  let text: String
  let confidence: Double
  let bounds: ReceiptTextBounds
}

struct RecognizedReceipt: Codable {
  let engine: String
  let width: Int
  let height: Int
  let lines: [ReceiptTextLine]
}

enum ReceiptTextRecognizer {
  static func recognize(uri: String) throws -> RecognizedReceipt {
    guard let url = URL(string: uri), url.isFileURL,
      url.host == nil || url.host == "" || url.host == "localhost"
    else { throw ReceiptOcrError.localFileRequired }
    let file = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    guard file.isRegularFile == true else { throw ReceiptOcrError.localFileRequired }
    guard let bytes = file.fileSize, bytes <= 8 * 1024 * 1024 else {
      throw ReceiptOcrError.oversized
    }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
      throw ReceiptOcrError.unreadable
    }
    let index = CGImageSourceGetPrimaryImageIndex(source)
    guard let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int,
      width > 0, height > 0
    else { throw ReceiptOcrError.unreadable }
    guard Double(width) * Double(height) <= 50_000_000 else {
      throw ReceiptOcrError.tooManyPixels
    }
    // ImageIO applies HEIF/EXIF orientation once, while limiting the decoded size.
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: 4096,
      kCGImageSourceShouldCacheImmediately: true
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, index, options as CFDictionary) else {
      throw ReceiptOcrError.unreadable
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    let supported = try request.supportedRecognitionLanguages()
    let preferred = ["en-US", "zh-Hans", "zh-Hant", "fr-FR"].filter { supported.contains($0) }
    if !preferred.isEmpty { request.recognitionLanguages = preferred }
    if #available(iOS 16.0, macOS 13.0, *) { request.automaticallyDetectsLanguage = true }
    try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])
    let lines = (request.results ?? []).compactMap { observation -> ReceiptTextLine? in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { return nil }
      let rect = observation.boundingBox
      return ReceiptTextLine(
        text: text, confidence: Double(candidate.confidence),
        bounds: ReceiptTextBounds(
          x: Double(rect.minX), y: Double(1 - rect.maxY),
          width: Double(rect.width), height: Double(rect.height)
        )
      )
    }.sorted { $0.bounds.y < $1.bounds.y }
    guard !lines.isEmpty else { throw ReceiptOcrError.noText }
    guard lines.count <= 1000, lines.reduce(0, { $0 + $1.text.count }) <= 64_000 else {
      throw ReceiptOcrError.tooMuchText
    }
    return RecognizedReceipt(engine: "apple-vision", width: image.width, height: image.height, lines: lines)
  }
}
