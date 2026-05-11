//
//  Card.swift
//  MafiaDesignSystem
//
//  The white card on warm paper used everywhere in the prototype.
//  DESIGN.md §1.5 + §4.4: `rounded-[20px] bg-white ring-1 ring-black/4
//                          shadow-[0_2px_24px_-12px_rgba(0,0,0,0.12)]`.
//
import SwiftUI

public struct Card<Content: View>: View {
    private let content: () -> Content
    private let cornerRadius: CGFloat
    private let padding: CGFloat

    public init(
        cornerRadius: CGFloat = 20,
        padding: CGFloat = 16,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.cornerRadius = cornerRadius
        self.padding = padding
        self.content = content
    }

    public var body: some View {
        content()
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(MafiaColor.ring, lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.12), radius: 12, x: 0, y: 2)
    }
}
