// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DropAI",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "DropAI",
            targets: ["DropAI"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.0")
    ],
    targets: [
        .target(
            name: "DropAI",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/DropAI"),
        .testTarget(
            name: "DropAITests",
            dependencies: ["DropAI"],
            path: "ios/Tests/DropAITests")
    ]
)
