//
//  Vibe.swift
//  MafiaDesignSystem
//
//  The Calm / Playful vibe toggle from DESIGN.md §2.
//
//  Calm  — default. Amber + sage. Plain check / cross icons. Fraunces upright.
//  Playful — peachy coral + powder blue. Italics. Rotation animations on tap.
//
//  Persisted via `@AppStorage("mafia.vibe")` in `MafiaApp`. Exposed everywhere
//  in the view tree via `\.vibe`.
//
import SwiftUI

public enum Vibe: String, CaseIterable, Sendable {
    case calm
    case playful

    public var label: String {
        switch self {
        case .calm:    return "Calm"
        case .playful: return "Playful"
        }
    }
}

// MARK: - EnvironmentValues

private struct VibeKey: EnvironmentKey {
    static let defaultValue: Vibe = .calm
}

public extension EnvironmentValues {
    var vibe: Vibe {
        get { self[VibeKey.self] }
        set { self[VibeKey.self] = newValue }
    }
}

// MARK: - View modifier

public extension View {
    /// Sets the `vibe` environment value for this subtree. Useful for previews
    /// and for the Settings → Vibe toggle.
    func vibe(_ vibe: Vibe) -> some View {
        environment(\.vibe, vibe)
    }
}
