import ExpoModulesCore
import Foundation

public final class PocketReceiptOcrModule: Module {
  private let queue = DispatchQueue(label: "com.pocketbudget.receipt-ocr", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("PocketReceiptOcr")

    AsyncFunction("recognize") { (uri: String, promise: Promise) in
      autoreleasepool {
        do {
          guard let url = URL(string: uri), url.isFileURL,
            let files = self.appContext?.fileSystem,
            files.getPathPermissions(url.resolvingSymlinksInPath().path).contains(.read)
          else { throw ReceiptOcrError.localFileRequired }
          let receipt = try ReceiptTextRecognizer.recognize(uri: uri)
          let encoded = try JSONEncoder().encode(receipt)
          promise.resolve(try JSONSerialization.jsonObject(with: encoded))
        } catch let error as ReceiptOcrError {
          promise.reject("ERR_RECEIPT_OCR", error.localizedDescription)
        } catch {
          promise.reject("ERR_RECEIPT_OCR", "Cannot read this image on-device. Try another photo.")
        }
      }
    }.runOnQueue(queue)
  }
}
