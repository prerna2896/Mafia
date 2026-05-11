//
//  ColorsTests.swift
//
//  Verifies the design tokens in MafiaDesignSystem/Colors.swift match the
//  hex values documented in /Users/prernaagarwal/wonder/Mafia/docs/DESIGN.md §1.2.
//
//  Uses **Swift Testing** (`import Testing`) rather than XCTest — XCTest is
//  not shipped in the Xcode Command Line Tools, only in full Xcode. Swift
//  Testing is available in Swift 5.10+ / Swift 6.0+ and runs fine in the
//  command-line toolchain.
//
//  When the Xcode project lands these will continue to work; Xcode 16+ runs
//  Swift Testing alongside XCTest natively.
//
import Testing
import SwiftUI
@testable import MafiaDesignSystem

@Suite("Color tokens match DESIGN.md §1.2 hex values")
struct ColorsTests {

    /// Amber `#E89B3C` → approximately (0.910, 0.608, 0.235) in sRGB / Display P3.
    /// This is the primary CTA color; if it drifts, the brand drifts.
    @Test func amberMatchesHex() {
        let amber = MafiaColor.amberComponents
        // #E89B3C → R 232 / 255 ≈ 0.9098, G 155 / 255 ≈ 0.6078, B 60 / 255 ≈ 0.2353
        #expect(abs(amber.red   - 0.910) < 0.01, "amber R drifted from #E89B3C")
        #expect(abs(amber.green - 0.608) < 0.01, "amber G drifted from #E89B3C")
        #expect(abs(amber.blue  - 0.235) < 0.01, "amber B drifted from #E89B3C")
    }

    /// Paper `#FAFAF7` → (0.980, 0.980, 0.969).
    @Test func paperMatchesHex() {
        let paper = MafiaColor.paperComponents
        #expect(abs(paper.red   - 0.980) < 0.01)
        #expect(abs(paper.green - 0.980) < 0.01)
        #expect(abs(paper.blue  - 0.969) < 0.01)
    }

    /// Ink `#1A1A1A` → (0.102, 0.102, 0.102).
    @Test func inkMatchesHex() {
        let ink = MafiaColor.inkComponents
        #expect(abs(ink.red   - 0.102) < 0.01)
        #expect(abs(ink.green - 0.102) < 0.01)
        #expect(abs(ink.blue  - 0.102) < 0.01)
    }

    /// Sage `#B8C5A6` and Clay `#C66B5C` — secondary + destructive accents.
    @Test func secondaryAccents() {
        let sage = MafiaColor.sageComponents
        #expect(abs(sage.red   - 0.722) < 0.01)
        #expect(abs(sage.green - 0.773) < 0.01)
        #expect(abs(sage.blue  - 0.651) < 0.01)

        let clay = MafiaColor.clayComponents
        #expect(abs(clay.red   - 0.776) < 0.01)
        #expect(abs(clay.green - 0.420) < 0.01)
        #expect(abs(clay.blue  - 0.361) < 0.01)
    }

    /// Hex helper round-trip — sanity-check the documentation utility.
    @Test func hexHelper() {
        let comps = Color.componentsFromHex(0xE89B3C)
        #expect(abs(comps.r - 232.0 / 255.0) < 0.001)
        #expect(abs(comps.g - 155.0 / 255.0) < 0.001)
        #expect(abs(comps.b -  60.0 / 255.0) < 0.001)
    }
}
