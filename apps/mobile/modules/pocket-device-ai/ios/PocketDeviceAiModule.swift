import ExpoModulesCore

public final class PocketDeviceAiModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PocketDeviceAi")
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
