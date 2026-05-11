//
//  SectionLabel.swift
//  MafiaDesignSystem
//
//  Uppercase eyebrow with a 4pt amber dot prefix.
//  DESIGN.md §4.4: `text-[10px] tracking-[0.14em] uppercase` + an amber Dot.
//
import SwiftUI

public struct SectionLabel: View {
    private let text: String

    public init(_ text: String) {
        self.text = text
    }

    public var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(MafiaColor.amber)
                .frame(width: 4, height: 4)
            Text(text.uppercased())
                .font(MafiaFont.eyebrow)
                .tracking(1.4)               // ≈ 0.14em at 10pt
                .foregroundStyle(MafiaColor.inkSoft)
        }
    }
}
