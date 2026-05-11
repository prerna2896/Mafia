//
//  ComponentTests.swift
//
//  Smoke + structural tests for the three design-system primitives:
//  `Card`, `PillButton`, `SectionLabel`.
//
//  NOTE on coverage scope: SwiftUI's rendered output is opaque from outside
//  of Xcode's preview/test infrastructure (no ViewInspector dependency here
//  by design — see "no new dependencies" guardrail in the brief). So these
//  tests fall into two buckets:
//
//    1. Compile-only smoke — the View can be constructed and has a non-nil
//       body of the expected type. Catches a regression where someone breaks
//       the public init or the generic Content parameter.
//    2. Structural — properties we deliberately expose on the View struct
//       (e.g. `SectionLabel.displayText`) get exercised against the input.
//
//  When the Xcode project lands we can add snapshot tests on top of these.
//
import Testing
import SwiftUI
@testable import MafiaDesignSystem

@Suite("Design-system primitives smoke + structure")
struct ComponentTests {

    /// All three documented `PillButtonStyle` cases construct a button
    /// successfully. The fourth (`.destructive`) is internal-use only
    /// (Cancel-subscription) so we touch it as well to keep the enum live.
    @Test func pillButtonHasThreeStyles() {
        let primary   = PillButton("Primary",   style: .primary)   { }
        let secondary = PillButton("Secondary", style: .secondary) { }
        let accent    = PillButton("Accent",    style: .accent)    { }
        let destruct  = PillButton("Cancel",    style: .destructive) { }

        // Construction succeeded — `Optional` of a non-optional always
        // unwraps, but the act of writing `_ = primary.body` forces the
        // SwiftUI body to type-check.
        _ = primary.body
        _ = secondary.body
        _ = accent.body
        _ = destruct.body

        // Sanity: style backgrounds are distinct.
        #expect(PillButtonStyle.primary.background != PillButtonStyle.accent.background)
        #expect(PillButtonStyle.secondary.background != PillButtonStyle.primary.background)
    }

    /// `Card` is a generic container — wrapping a `Text` should still type-
    /// check as `Card<Text>` (or its body expression).
    @Test func cardComposesArbitraryContent() {
        let card = Card { Text("Inside the card") }
        _ = card.body   // forces SwiftUI body evaluation; fails to compile
                        // if the generic Content parameter ever breaks.
    }

    /// `SectionLabel` exposes its display string for inspection because
    /// SwiftUI's rendered `Text` content can't be read from a command-line
    /// `swift test` run without a third-party introspection library.
    /// We assert the input→displayText mapping (lowercased input becomes
    /// uppercased rendered text).
    @Test func sectionLabelRendersUppercase() {
        let label = SectionLabel("discoveries")
        #expect(label.rawText     == "discoveries")
        #expect(label.displayText == "DISCOVERIES")

        // Already-uppercased input is idempotent.
        let mixed = SectionLabel("This week's invitation")
        #expect(mixed.displayText == "THIS WEEK'S INVITATION")
    }
}
