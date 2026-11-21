import XCTest
@testable import PocketModelCore

final class ModelIntegrityTests: XCTestCase {
  func testIntegrityRejectsTruncationAndChangedWeights() throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: url) }
    try Data("abc".utf8).write(to: url)
    let sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    XCTAssertTrue(try ModelIntegrity.verify(url: url, bytes: 3, sha256: sha))
    XCTAssertFalse(try ModelIntegrity.verify(url: url, bytes: 4, sha256: sha))
    try Data("abd".utf8).write(to: url)
    XCTAssertFalse(try ModelIntegrity.verify(url: url, bytes: 3, sha256: sha))
  }
}
