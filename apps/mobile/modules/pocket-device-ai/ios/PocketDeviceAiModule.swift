import ExpoModulesCore
import Foundation

public final class PocketDeviceAiModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PocketDeviceAi")
    AsyncFunction("generate") { (payload: String) async throws -> String in
      try await DeviceAiEngine.generate(payload: payload)
    }
    AsyncFunction("verifyModel") { (uri: String, bytes: Int64, sha256: String) throws -> Bool in
      guard let url = URL(string: uri), url.isFileURL,
        let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
        url.standardizedFileURL.path.hasPrefix(root.appendingPathComponent("pocket-models").path + "/") else { return false }
      var directory = url.deletingLastPathComponent()
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try directory.setResourceValues(values)
      return try ModelIntegrity.verify(url: url, bytes: bytes, sha256: sha256)
    }
    AsyncFunction("availability") { () async -> [String: Any] in
      await DeviceAiEngine.availability()
    }
    AsyncFunction("classify") { (text: String) async -> [String: Any] in
      await DeviceAiEngine.classify(text: text)
    }
    AsyncFunction("classifyReceipt") { (payload: String) async -> [String: Any] in
      await DeviceAiEngine.classifyReceipt(payload: payload)
    }
    AsyncFunction("chat") { (payload: String) async throws -> [String: Any] in
      try await DeviceAiEngine.chat(payload: payload)
    }
  }
}
