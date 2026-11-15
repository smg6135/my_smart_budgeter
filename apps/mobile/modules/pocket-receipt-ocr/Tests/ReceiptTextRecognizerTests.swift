import XCTest
import Foundation
@testable import PocketReceiptOcrCore

final class ReceiptTextRecognizerTests: XCTestCase {
  private func fixture(_ name: String) -> URL {
    Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fixtures")!
  }

  func testRealPngAndHeicReceipts() throws {
    for file in ["receipt.png", "receipt.heic", "rotated.jpg"] {
      let result = try ReceiptTextRecognizer.recognize(uri: fixture(file).absoluteString)
      let text = result.lines.map { $0.text.uppercased() }.joined(separator: " ")
      XCTAssertTrue(text.contains("POCKET CAFE"), file)
      XCTAssertTrue(text.contains("TOTAL USD 5.00"), file)
      XCTAssertEqual(result.width, 420)
      XCTAssertEqual(result.height, 500)
      XCTAssertEqual(result.engine, "apple-vision")
      for line in result.lines {
        XCTAssertTrue((0...1).contains(line.confidence))
        XCTAssertTrue((0...1).contains(line.bounds.x))
        XCTAssertTrue((0...1).contains(line.bounds.y))
      }
    }
  }

  func testRemoteUrlsCannotFetchReceiptImages() {
    XCTAssertThrowsError(try ReceiptTextRecognizer.recognize(uri: "https://example.com/receipt.png"))
    XCTAssertThrowsError(try ReceiptTextRecognizer.recognize(uri: "data:image/png;base64,abc"))
  }

  func testUnreadableAndOversizedFiles() throws {
    let path = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: path) }
    try Data("not an image".utf8).write(to: path)
    XCTAssertThrowsError(try ReceiptTextRecognizer.recognize(uri: path.absoluteString))
    try Data(count: 8 * 1024 * 1024 + 1).write(to: path)
    XCTAssertThrowsError(try ReceiptTextRecognizer.recognize(uri: path.absoluteString)) { error in
      XCTAssertEqual(error.localizedDescription, "File exceeds 8 MB.")
    }
  }
}
