//
//  InsightsView.swift — Insights tab (port of
//  `vault-view/src/components/mafia/screens/Insights.tsx`).
//
//  Three layers per DESIGN.md §8:
//    1. Hero stat card (cumulative GB recovered + 3-up sub-stats).
//    2. Wrapped-style horizontal scroll (ink / amber / sage / ink cards).
//    3. "This week we learned…" sage-tinted panel.
//
//  Plus the Tier-3 #12 editable allowlist (prototype lines 88–151):
//    a list of removable [×] chips with a toggle that, when open, also
//    surfaces a "+ Teach a new preference" inline form. State is local
//    (`@State`); the real allowlist will live in the Rust core (ADR-0002).
//
//  Style + structure follow `HomeView.swift`. Tapping × on a chip surfaces
//  a `ConfirmSheet` ("Forget this learning?") before the chip is actually
//  removed — mirrors the prototype's `setForgetting` flow.
//
import SwiftUI
import MafiaDesignSystem

public struct InsightsView: View {
    @State private var learnings: [String] = [
        "You keep group shots",
        "You vault DoorDash receipts",
        "You keep Airbnb receipts",
        "You don't keep LinkedIn digests",
        "You keep emails from sarah@hey.com",
    ]
    @State private var showAll: Bool = false
    @State private var adding: Bool = false
    @State private var draft: String = ""
    /// Currently-pending forget confirmation. Non-nil drives the ConfirmSheet.
    @State private var forgetting: String? = nil

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header.padding(.top, 8)
                heroCard.padding(.top, 24)
                wrappedScroll.padding(.top, 28)
                weekLearnedCard.padding(.top, 28)
                allowlistCard.padding(.top, 28)
                Text("No streaks. No pressure. Just signal.")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 32)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 128)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
        .sheet(
            isPresented: Binding(
                get: { forgetting != nil },
                set: { presented in if !presented { forgetting = nil } }
            )
        ) {
            ConfirmSheet(
                title: "Forget this learning?",
                body: "Mafia will go back to suggesting based on the original rules.",
                confirmLabel: "Forget",
                cancelLabel: "Keep",
                tone: .clay,
                onConfirm: {
                    if let target = forgetting {
                        learnings.removeAll { $0 == target }
                    }
                },
                onCancel: { forgetting = nil }
            )
        }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Insights")
                .font(MafiaFont.serif(size: 34))
                .foregroundStyle(MafiaColor.ink)
            Text("Cumulative, not streaks. We learn from what you keep.")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
        }
    }

    private var heroCard: some View {
        Card(cornerRadius: 24, padding: 24) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel("Recovered")
                HStack(alignment: .lastTextBaseline, spacing: 6) {
                    Text("47")
                        .font(MafiaFont.serif(size: 72))
                        .monospacedDigit()
                        .foregroundStyle(MafiaColor.ink)
                    Text("GB")
                        .font(MafiaFont.serif(size: 28))
                        .foregroundStyle(MafiaColor.inkSoft)
                }
                .padding(.top, 8)
                Text("across 6 months · 1,847 entities")
                    .font(MafiaFont.body(size: 12.5))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .padding(.top, 10)

                Rectangle()
                    .fill(MafiaColor.ring)
                    .frame(height: 1)
                    .padding(.top, 18)

                HStack(alignment: .top, spacing: 8) {
                    SubStat(n: "1,847", l: "Protected")
                    SubStat(n: "312",   l: "Vaulted")
                    SubStat(n: "0",     l: "Lost", tone: .sage)
                }
                .padding(.top, 14)
            }
        }
    }

    private var wrappedScroll: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel("Your year so far").padding(.horizontal, 4)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    WrappedCard(tone: .ink,
                                eyebrow: "Protection",
                                big: "1,847",
                                small: "photos protected with reasons")
                    WrappedCard(tone: .amber,
                                eyebrow: "Top sender",
                                big: "LinkedIn",
                                small: "412 emails vaulted")
                    WrappedCard(tone: .sage,
                                eyebrow: "Library",
                                big: "94%",
                                small: "deduped across surfaces")
                    WrappedCard(tone: .ink,
                                eyebrow: "We learned",
                                big: "\u{201C}Group shots\u{201D}",
                                small: "you tend to keep these",
                                italic: true)
                }
                .padding(.horizontal, 24)
            }
            .padding(.horizontal, -24)
        }
    }

    private var weekLearnedCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel("This week we learned\u{2026}")
            Text("You vault DoorDash receipts but keep Airbnb ones. We'll stop suggesting Airbnb.")
                .font(MafiaFont.serif(size: 22))
                .lineSpacing(2)
                .foregroundStyle(MafiaColor.ink)
                .padding(.top, 10)
                .fixedSize(horizontal: false, vertical: true)
            Text("Adjusted on Tuesday · 22 future nudges saved.")
                .font(MafiaFont.body(size: 11.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 12)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(MafiaColor.sageSoft)
        )
    }

    private var allowlistCard: some View {
        Card(cornerRadius: 20, padding: 20) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel("What we've learned")

                Group {
                    if learnings.isEmpty {
                        Text("No preferences learned yet.")
                            .font(MafiaFont.body(size: 12))
                            .foregroundStyle(MafiaColor.inkSoft)
                    } else {
                        FlowChips(
                            items: showAll ? learnings : Array(learnings.prefix(5)),
                            onRemove: removeLearning
                        )
                    }
                }
                .padding(.top, 12)

                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                        showAll.toggle()
                        if !showAll {
                            adding = false
                            draft = ""
                        }
                    }
                } label: {
                    Text(showAll ? "Show less" : "Edit all preferences \u{2192}")
                        .font(MafiaFont.body(size: 11.5, weight: .medium))
                        .foregroundStyle(MafiaColor.ink)
                        .underline()
                }
                .padding(.top, 12)

                if showAll {
                    Rectangle()
                        .fill(MafiaColor.ring)
                        .frame(height: 1)
                        .padding(.top, 12)
                    teachRow.padding(.top, 12)
                }
            }
        }
    }

    @ViewBuilder
    private var teachRow: some View {
        if adding {
            HStack(spacing: 8) {
                TextField("e.g. \u{201C}You keep boarding passes\u{201D}", text: $draft)
                    .font(MafiaFont.body(size: 12))
                    .foregroundStyle(MafiaColor.ink)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().fill(MafiaColor.surface)
                    )
                    .overlay(
                        Capsule().strokeBorder(MafiaColor.ring, lineWidth: 1)
                    )
                    .submitLabel(.done)
                    .onSubmit(saveDraft)

                Button(action: saveDraft) {
                    Text("Save")
                        .font(MafiaFont.body(size: 11.5, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(MafiaColor.ink))
                }

                Button {
                    draft = ""
                    adding = false
                } label: {
                    Text("Cancel")
                        .font(MafiaFont.body(size: 11.5))
                        .foregroundStyle(MafiaColor.inkSoft)
                }
            }
        } else {
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    adding = true
                }
            } label: {
                Text("+ Teach a new preference")
                    .font(MafiaFont.body(size: 11.5, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
                    .underline()
            }
        }
    }

    // MARK: - Mutations

    private func saveDraft() {
        let v = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        if !v.isEmpty, !learnings.contains(v) {
            learnings.append(v)
        }
        draft = ""
        adding = false
    }

    /// The × tap on a chip stages a confirm — the chip is only actually
    /// removed once the user taps "Forget" in the ConfirmSheet.
    private func removeLearning(_ l: String) {
        forgetting = l
    }
}

// MARK: - Sub-stats (hero)

private struct SubStat: View {
    enum Tone { case ink, sage }
    let n: String
    let l: String
    var tone: Tone = .ink

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(n)
                .font(MafiaFont.serif(size: 22))
                .monospacedDigit()
                .foregroundStyle(tone == .sage ? sageDeep : MafiaColor.ink)
            Text(l)
                .font(MafiaFont.body(size: 10.5))
                .foregroundStyle(MafiaColor.inkSoft)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // Web uses `color-mix(in oklab, var(--sage) 70%, black)`. Approximate by
    // darkening the sage token; close enough until oklch conversion lands.
    private var sageDeep: Color {
        Color(.displayP3, red: 0.40, green: 0.46, blue: 0.34, opacity: 1.0)
    }
}

// MARK: - Wrapped-style card

private struct WrappedCard: View {
    enum Tone { case ink, amber, sage }
    let tone: Tone
    let eyebrow: String
    let big: String
    let small: String
    var italic: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(eyebrow.uppercased())
                .font(MafiaFont.body(size: 10, weight: .medium))
                .tracking(1.4)
                .foregroundStyle(softColor)
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 8) {
                Text(big)
                    .font(bigFont)
                    .monospacedDigit()
                    .italic(italic)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .foregroundStyle(fgColor)
                Text(small)
                    .font(MafiaFont.body(size: 11.5))
                    .foregroundStyle(softColor)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(20)
        .frame(width: 180, height: 230, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(bgColor)
        )
    }

    private var bigFont: Font {
        MafiaFont.serif(size: big.count > 8 ? 28 : 40)
    }

    private var bgColor: Color {
        switch tone {
        case .ink:   return MafiaColor.ink
        case .amber: return MafiaColor.amber
        case .sage:  return MafiaColor.sage
        }
    }

    private var fgColor: Color {
        switch tone {
        case .ink:              return .white
        case .amber, .sage:     return MafiaColor.ink
        }
    }

    private var softColor: Color {
        switch tone {
        case .ink:              return Color.white.opacity(0.6)
        case .amber, .sage:     return Color.black.opacity(0.55)
        }
    }
}

// MARK: - Flow-layout chips (wraps to multiple lines)

private struct FlowChips: View {
    let items: [String]
    let onRemove: (String) -> Void

    var body: some View {
        FlowLayout(spacing: 6, lineSpacing: 6) {
            ForEach(items, id: \.self) { item in
                Chip(label: item) { onRemove(item) }
            }
        }
    }
}

private struct Chip: View {
    let label: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Text(label)
                .font(MafiaFont.body(size: 11.5))
                .foregroundStyle(MafiaColor.ink)
            Button(action: onRemove) {
                Text("\u{00D7}")
                    .font(MafiaFont.body(size: 12, weight: .medium))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .frame(width: 20, height: 20)
                    .background(
                        Circle().fill(Color.white)
                    )
                    .overlay(
                        Circle().strokeBorder(MafiaColor.ring, lineWidth: 1)
                    )
            }
            .accessibilityLabel("Forget \(label)")
        }
        .padding(.leading, 12)
        .padding(.trailing, 6)
        .padding(.vertical, 6)
        .background(Capsule().fill(MafiaColor.surface))
    }
}

/// Minimal flow layout — wraps children to next line when width is exceeded.
/// SwiftUI's `Layout` protocol (iOS 16+) handles this cleanly without
/// pulling in a third-party package.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    var lineSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0
        var totalWidth: CGFloat = 0

        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                y += lineHeight + lineSpacing
                x = 0
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
            totalWidth = max(totalWidth, x)
        }
        return CGSize(width: totalWidth, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var lineHeight: CGFloat = 0

        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if x + size.width > bounds.minX + maxWidth, x > bounds.minX {
                y += lineHeight + lineSpacing
                x = bounds.minX
                lineHeight = 0
            }
            sv.place(at: CGPoint(x: x, y: y),
                     anchor: .topLeading,
                     proposal: ProposedViewSize(width: size.width, height: size.height))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

// MARK: - Previews
//
// `#Preview` macro plugin is Xcode-only; use PreviewProvider so CLI builds.
// Swap to `#Preview { InsightsView() }` once opened in Xcode.

#if DEBUG
struct InsightsView_Previews: PreviewProvider {
    static var previews: some View { InsightsView() }
}
#endif
