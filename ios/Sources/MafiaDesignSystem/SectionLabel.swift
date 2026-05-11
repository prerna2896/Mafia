//
//  SectionLabel.swift
//  MafiaDesignSystem
//
//  Uppercase eyebrow with a 4pt amber dot prefix.
//  DESIGN.md §4.4: `text-[10px] tracking-[0.14em] uppercase` + an amber Dot.
//
import SwiftUI

public struct SectionLabel: View {
    /// The raw input text passed at init.
    public let rawText: String

    /// What ultimately renders inside the label — uppercased input.
    /// Exposed so command-line tests can verify the input→render mapping
    /// without needing a view-introspection library.
    public var displayText: String { rawText.uppercased() }

    public init(_ text: String) {
        self.rawText = text
    }

    public var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(MafiaColor.amber)
                .frame(width: 4, height: 4)
            Text(displayText)
                .font(MafiaFont.eyebrow)
                .tracking(1.4)               // ≈ 0.14em at 10pt
                .foregroundStyle(MafiaColor.inkSoft)
        }
    }
}

// See note in `Card.swift` about `#Preview` macro availability.
#if DEBUG
struct SectionLabel_Previews: PreviewProvider {
    static var previews: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel("This week's invitation")
            SectionLabel("Discoveries")
        }
        .padding(24)
        .background(MafiaColor.paper)
    }
}
#endif
