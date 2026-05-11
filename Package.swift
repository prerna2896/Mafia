// swift-tools-version: 5.9
//
// Mafia iOS — V1 Swift Package scaffold.
//
// This package is intentionally a *library-only* scaffold so it compiles with
// `swift build` against the Xcode Command Line Tools (no full Xcode required).
//
// The real `.xcodeproj` with an `iOS` app target lives outside this manifest:
// when the user opens this folder in Xcode, they will add an iOS app target
// that depends on these three libraries — `MafiaApp`, `MafiaDesignSystem`,
// `MafiaCore`. The SwiftUI `@main App` lives in `Sources/MafiaApp/MafiaApp.swift`
// already so the wiring is trivial.
//
// Until then, everything here builds and tests on macOS via SwiftPM.
//
// See: docs/adr/ADR-0002-rust-core-and-v1-architecture.md in /Users/prernaagarwal/wonder/Mafia/
//
import PackageDescription

let package = Package(
    name: "Mafia",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(name: "MafiaApp",           targets: ["MafiaApp"]),
        .library(name: "MafiaDesignSystem",  targets: ["MafiaDesignSystem"]),
        .library(name: "MafiaCore",          targets: ["MafiaCore"]),
    ],
    targets: [
        .target(
            name: "MafiaApp",
            dependencies: ["MafiaDesignSystem", "MafiaCore"],
            path: "Sources/MafiaApp"
        ),
        .target(
            name: "MafiaDesignSystem",
            path: "Sources/MafiaDesignSystem"
        ),
        .target(
            name: "MafiaCore",
            path: "Sources/MafiaCore",
            exclude: ["README.md"]
        ),
        .testTarget(
            name: "MafiaDesignSystemTests",
            dependencies: ["MafiaDesignSystem"],
            path: "Tests/MafiaDesignSystemTests"
        ),
    ]
)
