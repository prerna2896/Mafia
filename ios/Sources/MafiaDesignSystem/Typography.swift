//
//  Typography.swift
//  MafiaDesignSystem
//
//  Font tokens per DESIGN.md §1.1.
//
//  IMPORTANT: This scaffold does NOT yet bundle the Inter / Fraunces font
//  files. When the Xcode project exists we will:
//    1. Drop `Inter-Variable.ttf` + `Fraunces-Variable.ttf` into the app bundle
//    2. List them under `UIAppFonts` in `Info.plist`
//    3. Replace the system-font fallbacks below with `Font.custom(...)` returns
//
//  Until then we return SwiftUI system fonts so the package compiles. Designs
//  built against `MafiaFont` will still respect the right weight + size, just
//  in San Francisco instead of Inter / Fraunces.
//
import SwiftUI

public enum MafiaFont {
    // MARK: Body / UI chrome (Inter)

    /// 11pt — tertiary text. Never go below this.
    public static let caption = Font.system(size: 11, weight: .regular,  design: .default)
    /// 12.5pt — body / subtitle.
    public static let body    = Font.system(size: 12.5, weight: .regular, design: .default)
    /// 13pt — pill-button label.
    public static let button  = Font.system(size: 13, weight: .medium,   design: .default)
    /// 14pt — list-row title.
    public static let title   = Font.system(size: 14, weight: .medium,   design: .default)

    // MARK: Display (Fraunces)

    /// 26pt — onboarding headline.
    public static let displayS = Font.system(size: 26, weight: .regular, design: .serif)
    /// 28pt — screen headline.
    public static let displayM = Font.system(size: 28, weight: .regular, design: .serif)
    /// 34pt — Vault hero.
    public static let displayL = Font.system(size: 34, weight: .regular, design: .serif)
    /// 72pt — Insights hero number with `.monospacedDigit()`.
    public static let hero     = Font.system(size: 72, weight: .regular, design: .serif).monospacedDigit()

    // MARK: Eyebrow (uppercase Inter, tracked)

    /// 10pt uppercase with tight letter spacing. Used by `SectionLabel`.
    public static let eyebrow = Font.system(size: 10, weight: .medium, design: .default)

    // MARK: Factory helpers
    //
    // For one-off sizes not covered by the named tokens above. When the
    // Xcode project lands, these will switch to `Font.custom("Fraunces", ...)`
    // / `Font.custom("Inter", ...)` and pick up the registered variable fonts.

    /// Fraunces-equivalent serif font at the given size.
    public static func serif(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        Font.system(size: size, weight: weight, design: .serif)
    }

    /// Inter-equivalent body font at the given size.
    public static func body(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        Font.system(size: size, weight: weight, design: .default)
    }
}

// MARK: - TODO(font-registration)
//
// When porting to the Xcode project:
//
// ```swift
// public static let body = Font.custom("Inter-Variable", size: 12.5)
// public static let displayM = Font.custom("Fraunces-Variable", size: 28)
// ```
//
// Make sure `UIAppFonts` lists the file names, and that the Fraunces variable
// font is configured with `font-optical-sizing: auto` (use `Font.custom`'s
// `relativeTo:` parameter for Dynamic Type support per DESIGN.md §12.5).
