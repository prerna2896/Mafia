//
//  Card.swift
//  MafiaDesignSystem
//
//  The white card on warm paper used everywhere in the prototype.
//  DESIGN.md §1.5 + §4.4: `rounded-[20px] bg-white ring-1 ring-black/4
//                          shadow-[0_2px_24px_-12px_rgba(0,0,0,0.12)]`.
//
import SwiftUI

/// White rounded card with a 1px black/4% ring and soft drop shadow.
///
/// Accepts arbitrary `@ViewBuilder` content. Defaults match the prototype's
/// `rounded-[20px]` cards; pass `cornerRadius: 22` for invitation cards.
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
            // Web: `shadow-[0_2px_24px_-12px_rgba(0,0,0,0.12)]` — the negative
            // spread on the web side means the shadow is tighter than radius
            // suggests. Approximate with a lower-opacity, smaller-radius shadow.
            .shadow(color: Color.black.opacity(0.08), radius: 10, x: 0, y: 2)
    }
}

// SwiftUI Preview — the `#Preview` macro requires the `PreviewsMacros`
// plugin which is shipped only with full Xcode (not the command-line
// toolchain). Once this package is opened in Xcode, replace the legacy
// `PreviewProvider` below with `#Preview("Card") { ... }`. The body is
// identical.
#if DEBUG
struct Card_Previews: PreviewProvider {
    static var previews: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                Text("Hello card").font(.headline)
                Text("Body text inside a card.").font(.subheadline)
            }
        }
        .padding()
        .background(MafiaColor.paper)
    }
}
#endif
