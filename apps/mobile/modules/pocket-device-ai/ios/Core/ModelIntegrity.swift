import Foundation
import CryptoKit

enum ModelIntegrity {
  // Stream weights; never allocate a model-sized Data/base64 string on the JS heap.
  static func verify(url: URL, bytes: Int64, sha256: String) throws -> Bool {
    guard url.isFileURL, bytes > 0, sha256.count == 64,
      let size = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber,
      size.int64Value == bytes else { return false }
    let file = try FileHandle(forReadingFrom: url)
    defer { try? file.close() }
    var hash = SHA256()
    while let data = try file.read(upToCount: 1024 * 1024), !data.isEmpty { hash.update(data: data) }
    let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
    return digest == sha256.lowercased()
  }
}
