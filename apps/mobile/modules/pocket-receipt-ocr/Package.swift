// swift-tools-version:5.7
import PackageDescription

let package = Package(
  name: "PocketReceiptOcrCore",
  platforms: [.macOS(.v12), .iOS(.v15)],
  products: [.library(name: "PocketReceiptOcrCore", targets: ["PocketReceiptOcrCore"])],
  targets: [
    .target(name: "PocketReceiptOcrCore", path: "ios/Core"),
    .testTarget(name: "PocketReceiptOcrCoreTests", dependencies: ["PocketReceiptOcrCore"],
      path: "Tests", resources: [.copy("Fixtures")])
  ]
)
