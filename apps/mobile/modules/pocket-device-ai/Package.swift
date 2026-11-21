// swift-tools-version:5.7
import PackageDescription
let package = Package(
  name: "PocketModelCore", platforms: [.macOS(.v12), .iOS(.v16)],
  products: [.library(name: "PocketModelCore", targets: ["PocketModelCore"])],
  targets: [
    .target(name: "PocketModelCore", path: "ios/Core"),
    .testTarget(name: "PocketModelCoreTests", dependencies: ["PocketModelCore"], path: "Tests")
  ]
)
