//
//  MafiaApp.swift
//
//  V1 iOS app entry point. Currently lives inside a library target so the
//  scaffold compiles via `swift build` against the Xcode Command Line Tools
//  only. When the user opens this folder in Xcode they will add an iOS app
//  target that depends on this library — at that point this `@main` becomes
//  the app's entry point with zero further changes.
//
import SwiftUI
import MafiaDesignSystem

@main
public struct MafiaApp: App {
    // Persist vibe across launches per DESIGN.md §2.
    @AppStorage("mafia.vibe") private var vibeRaw: String = Vibe.calm.rawValue

    public init() {}

    public var body: some Scene {
        WindowGroup {
            ContentView()
                .vibe(Vibe(rawValue: vibeRaw) ?? .calm)
        }
    }
}
