//
//  Colors.swift
//  MafiaDesignSystem
//
//  Color tokens ported from `vault-view/src/styles.css`.
//
//  The prototype uses oklch values; SwiftUI's `Color` takes sRGB / Display P3
//  components. We hard-code the documented hex equivalents from DESIGN.md §1.2
//  here, expressed in Display P3 for the best on-device fidelity.
//
//  When the Rust core / Xcode project lands, we can swap to a proper oklch
//  conversion routine — until then, the design source-of-truth values are
//  the hex codes in DESIGN.md.
//
import SwiftUI

public enum MafiaColor {
    /// `#FAFAF7` — App background, warm off-white. Token: `--paper`.
    public static let paper      = Color(.displayP3, red: 0.980, green: 0.980, blue: 0.969, opacity: 1.0)

    /// Inset surfaces (segmented track, soft cards). Token: `--surface`.
    public static let surface    = Color(.displayP3, red: 0.962, green: 0.960, blue: 0.949, opacity: 1.0)

    /// `#1A1A1A` — Primary text, pill-button background. Token: `--ink`.
    public static let ink        = Color(.displayP3, red: 0.102, green: 0.102, blue: 0.102, opacity: 1.0)

    /// Secondary text, eyebrows. Token: `--ink-soft`.
    public static let inkSoft    = Color(.displayP3, red: 0.420, green: 0.420, blue: 0.430, opacity: 1.0)

    /// `#E89B3C` — Primary CTA, key accents. Token: `--amber`.
    public static let amber      = Color(.displayP3, red: 0.910, green: 0.608, blue: 0.235, opacity: 1.0)

    /// Tinted backgrounds (purge banner). Token: `--amber-soft`.
    public static let amberSoft  = Color(.displayP3, red: 0.961, green: 0.886, blue: 0.769, opacity: 1.0)

    /// `#B8C5A6` — Secondary, "ok" health, restored state. Token: `--sage`.
    public static let sage       = Color(.displayP3, red: 0.722, green: 0.773, blue: 0.651, opacity: 1.0)

    /// Soft tints (insight panels). Token: `--sage-soft`.
    public static let sageSoft   = Color(.displayP3, red: 0.910, green: 0.929, blue: 0.871, opacity: 1.0)

    /// `#C66B5C` — Destructive only (Cancel subscription, errors). Token: `--clay`.
    public static let clay       = Color(.displayP3, red: 0.776, green: 0.420, blue: 0.361, opacity: 1.0)

    /// Ring color used in place of borders. ~4% black.
    public static let ring       = Color.black.opacity(0.04)
}

// MARK: - Hex helpers (used by tests)

extension Color {
    /// Returns the approximate sRGB hex string `#RRGGBB` for this color.
    /// macOS / iOS implementation lives in the Xcode project; for SwiftPM
    /// (and tests) we duplicate the component vector that was used to build
    /// the color. Tests compare those components, not via this helper, so
    /// this exists purely as documentation.
    public static func componentsFromHex(_ hex: UInt32) -> (r: Double, g: Double, b: Double) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >>  8) & 0xFF) / 255.0
        let b = Double( hex        & 0xFF) / 255.0
        return (r, g, b)
    }
}

// MARK: - Component access (test-only, no UIKit/AppKit dependency)

/// Exposed for tests: the raw sRGB-ish component triples that the public
/// `MafiaColor` constants are built from. Keeping this as plain data lets the
/// test target verify hex correctness without pulling in UIKit/AppKit, which
/// would otherwise force us to compile against the iOS SDK.
public struct MafiaColorComponents: Equatable {
    public let red:   Double
    public let green: Double
    public let blue:  Double

    public init(red: Double, green: Double, blue: Double) {
        self.red = red; self.green = green; self.blue = blue
    }
}

public extension MafiaColor {
    static let paperComponents      = MafiaColorComponents(red: 0.980, green: 0.980, blue: 0.969)
    static let surfaceComponents    = MafiaColorComponents(red: 0.962, green: 0.960, blue: 0.949)
    static let inkComponents        = MafiaColorComponents(red: 0.102, green: 0.102, blue: 0.102)
    static let inkSoftComponents    = MafiaColorComponents(red: 0.420, green: 0.420, blue: 0.430)
    static let amberComponents      = MafiaColorComponents(red: 0.910, green: 0.608, blue: 0.235)
    static let amberSoftComponents  = MafiaColorComponents(red: 0.961, green: 0.886, blue: 0.769)
    static let sageComponents       = MafiaColorComponents(red: 0.722, green: 0.773, blue: 0.651)
    static let sageSoftComponents   = MafiaColorComponents(red: 0.910, green: 0.929, blue: 0.871)
    static let clayComponents       = MafiaColorComponents(red: 0.776, green: 0.420, blue: 0.361)
}
