//
//  SendersDetailView.swift — drilled-into Senders screen (port of
//  `vault-view/src/components/mafia/screens/SendersDetail.tsx`).
//
//  Reached from Home → "See senders" Discovery card (DESIGN.md §3.2).
//  Hero headline "18 senders = 73% of unread", stacked horizontal bar of
//  the top 8 senders weighted by count, then a Card listing each sender
//  with Review (toggles a small inline preview of subjects) and Vault all
//  (toggles to a sage-soft "Vaulted" pill once tapped).
//
//  Sender data is inlined from the prototype's `topSenders` mock in
//  `vault-view/src/components/mafia/data.ts`. Sample subjects per sender
//  are ported verbatim from `SendersDetail.tsx`'s `sampleSubjects` dict;
//  generic fallback strings match the prototype's `subjectsFor` helper.
//
//  Deviations vs. prototype (intentional):
//  - No selection state inside the review preview — the prototype lets the
//    user check individual subjects then "Vault selected"; we only show the
//    preview list and rely on the row-level "Vault all" pill. Subject-level
//    selection ports later alongside the Bundle Review pattern in Vault.
//  - No `sonner` toast on Vault — the toast subsystem isn't wired yet.
//
import SwiftUI
import MafiaDesignSystem

// MARK: - Model (inlined from `topSenders` in data.ts)

private struct Sender: Identifiable, Hashable {
    let id: String         // == name; senders are unique by name
    let name: String
    let count: Int
    let color: Color
    var initial: String { String(name.prefix(1)) }
}

private let senders: [Sender] = [
    Sender(id: "LinkedIn",            name: "LinkedIn",            count: 412, color: Color(.sRGB, red: 10/255.0,  green: 102/255.0, blue: 194/255.0, opacity: 1)), // #0a66c2
    Sender(id: "Substack",            name: "Substack",            count: 287, color: Color(.sRGB, red: 255/255.0, green: 103/255.0, blue: 25/255.0,  opacity: 1)), // #FF6719
    Sender(id: "DoorDash",            name: "DoorDash",            count: 198, color: Color(.sRGB, red: 235/255.0, green: 23/255.0,  blue: 0/255.0,   opacity: 1)), // #EB1700
    Sender(id: "Airbnb",              name: "Airbnb",              count: 156, color: Color(.sRGB, red: 255/255.0, green: 56/255.0,  blue: 92/255.0,  opacity: 1)), // #FF385C
    Sender(id: "Medium Daily Digest", name: "Medium Daily Digest", count: 142, color: Color(.sRGB, red: 26/255.0,  green: 26/255.0,  blue: 26/255.0,  opacity: 1)), // #1A1A1A
    Sender(id: "Notion Updates",      name: "Notion Updates",      count: 119, color: Color(.sRGB, red: 55/255.0,  green: 53/255.0,  blue: 47/255.0,  opacity: 1)), // #37352f
    Sender(id: "Zoom",                name: "Zoom",                count: 98,  color: Color(.sRGB, red: 45/255.0,  green: 140/255.0, blue: 255/255.0, opacity: 1)), // #2D8CFF
    Sender(id: "Spotify",             name: "Spotify",             count: 87,  color: Color(.sRGB, red: 29/255.0,  green: 185/255.0, blue: 84/255.0,  opacity: 1)), // #1DB954
]

/// Sample subjects per sender — ported verbatim from `SendersDetail.tsx`'s
/// `sampleSubjects` dict so the inline review preview reads identically to
/// the web prototype. Senders not listed here fall back to `genericSubjects`.
private let sampleSubjects: [String: [String]] = [
    "LinkedIn": [
        "You appeared in 8 searches this week",
        "Prerna, people are viewing your profile",
        "5 new jobs for 'Product Designer'",
        "Your network is talking about AI",
        "Weekly digest: 12 posts you missed",
    ],
    "Substack": [
        "Platformer: The new Apple intelligence",
        "Lenny's Newsletter: How to ship faster",
        "Stratechery: Aggregation revisited",
        "Money Stuff by Matt Levine",
    ],
    "DoorDash": [
        "Your order from Blue Bottle — receipt",
        "30% off your next 3 orders",
        "Rate your recent delivery",
        "DashPass: free delivery this weekend",
    ],
    "Airbnb": [
        "Trip reminder: Lisbon in 3 days",
        "New homes in Goa you'd love",
        "Receipt for your stay in Tokyo",
    ],
]

private let dayLabels = ["Today", "Yesterday", "2d ago", "4d ago", "1w ago", "2w ago"]

private func subjectsFor(_ name: String, count: Int) -> [(id: String, subject: String, date: String)] {
    let base = sampleSubjects[name] ?? [
        "Weekly update",
        "You have new activity",
        "A message from \(name)",
        "Don't miss this",
        "Your monthly summary",
    ]
    let cap = min(6, count)
    guard cap > 0 else { return [] }
    return (0..<cap).map { i in
        (id: "\(name)-\(i)",
         subject: base[i % base.count],
         date: dayLabels[i])
    }
}

// MARK: - View

public struct SendersDetailView: View {
    private let onBack: () -> Void

    /// Set of sender names that have been "Vault all"-ed in this session.
    @State private var vaulted: Set<String> = []
    /// Currently-expanded sender's name for the inline Review preview.
    @State private var reviewing: String? = nil

    public init(onBack: @escaping () -> Void) {
        self.onBack = onBack
    }

    private var total: Int { senders.reduce(0) { $0 + $1.count } }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                backButton
                header.padding(.top, 8)
                stackedBar.padding(.top, 20)
                sendersCard.padding(.top, 20)
                Text("Your inbox stays — only their noise moves to Vault.")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 24)
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
            .padding(.bottom, 128)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }

    // MARK: - Sub-views

    private var backButton: some View {
        Button(action: onBack) {
            Text("← Back")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
        .padding(.leading, -8)
        .accessibilityLabel("Back")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel("Inbox pattern")
            // Mixed run: "18 senders are responsible for " + amber "73%" + " of your unread."
            (
                Text("18 senders are responsible for ")
                + Text("73%").foregroundColor(MafiaColor.amber)
                + Text(" of your unread.")
            )
            .font(MafiaFont.serif(size: 26))
            .foregroundStyle(MafiaColor.ink)
            .lineSpacing(-2)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 4)

            Text("\(total.formatted()) unread emails analyzed across Gmail.")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 8)
        }
    }

    /// Stacked horizontal bar — 3pt tall capsule of 8 colored segments
    /// weighted by each sender's share of the total.
    private var stackedBar: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(senders) { s in
                    Rectangle()
                        .fill(s.color)
                        .frame(width: geo.size.width * CGFloat(s.count) / CGFloat(total))
                }
            }
        }
        .frame(height: 3)
        .clipShape(Capsule(style: .continuous))
        .accessibilityLabel("Top senders stacked bar")
    }

    private var sendersCard: some View {
        Card(cornerRadius: 20, padding: 0) {
            VStack(spacing: 0) {
                ForEach(Array(senders.enumerated()), id: \.element.id) { idx, s in
                    SenderRow(
                        sender: s,
                        total: total,
                        isVaulted: vaulted.contains(s.name),
                        isReviewing: reviewing == s.name,
                        onToggleReview: { toggleReview(s.name) },
                        onVaultAll: { vaultAll(s.name) }
                    )
                    if idx != senders.count - 1 {
                        Rectangle()
                            .fill(Color.black.opacity(0.04))
                            .frame(height: 1)
                    }
                }
            }
        }
    }

    // MARK: - Actions

    private func toggleReview(_ name: String) {
        if reviewing == name {
            reviewing = nil
        } else {
            reviewing = name
        }
    }

    private func vaultAll(_ name: String) {
        vaulted.insert(name)
        if reviewing == name { reviewing = nil }
    }
}

// MARK: - SenderRow

private struct SenderRow: View {
    let sender: Sender
    let total: Int
    let isVaulted: Bool
    let isReviewing: Bool
    let onToggleReview: () -> Void
    let onVaultAll: () -> Void

    private var percent: Int {
        Int((Double(sender.count) / Double(total) * 100).rounded())
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                // Color circle w/ first letter
                ZStack {
                    Circle().fill(sender.color)
                    Text(sender.initial)
                        .font(MafiaFont.body(size: 11, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 36, height: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(sender.name)
                        .font(MafiaFont.body(size: 13.5, weight: .medium))
                        .foregroundStyle(MafiaColor.ink)
                        .lineLimit(1)
                    Text("\(sender.count) unread · \(percent)%")
                        .font(MafiaFont.body(size: 11))
                        .monospacedDigit()
                        .foregroundStyle(MafiaColor.inkSoft)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if !isVaulted {
                    Button(action: onToggleReview) {
                        Text(isReviewing ? "Close" : "Review")
                            .font(MafiaFont.body(size: 11, weight: .medium))
                            .foregroundStyle(isReviewing ? MafiaColor.ink : MafiaColor.inkSoft)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule(style: .continuous)
                                    .fill(isReviewing ? MafiaColor.surface : Color.white)
                            )
                            .overlay(
                                Capsule(style: .continuous)
                                    .strokeBorder(Color.black.opacity(0.1), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }

                Button(action: { if !isVaulted { onVaultAll() } }) {
                    Text(isVaulted ? "Vaulted" : "Vault all")
                        .font(MafiaFont.body(size: 11, weight: .medium))
                        .foregroundStyle(isVaulted ? MafiaColor.inkSoft : .white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            Capsule(style: .continuous)
                                .fill(isVaulted ? MafiaColor.sageSoft : MafiaColor.ink)
                        )
                }
                .buttonStyle(.plain)
                .disabled(isVaulted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            if isReviewing && !isVaulted {
                ReviewPreview(sender: sender)
            }
        }
    }
}

// MARK: - ReviewPreview

private struct ReviewPreview: View {
    let sender: Sender

    private var previews: [(id: String, subject: String, date: String)] {
        subjectsFor(sender.name, count: sender.count)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("SHOWING \(previews.count) OF \(sender.count)")
                    .font(MafiaFont.body(size: 10.5, weight: .medium))
                    .tracking(1.0)
                    .foregroundStyle(MafiaColor.inkSoft)
                Spacer()
            }
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(MafiaColor.ring, lineWidth: 1)
                )
                .overlay(
                    VStack(spacing: 0) {
                        ForEach(Array(previews.enumerated()), id: \.element.id) { idx, p in
                            HStack(spacing: 12) {
                                Text(p.subject)
                                    .font(MafiaFont.body(size: 12.5))
                                    .foregroundStyle(MafiaColor.ink)
                                    .lineLimit(1)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Text(p.date)
                                    .font(MafiaFont.body(size: 10.5))
                                    .monospacedDigit()
                                    .foregroundStyle(MafiaColor.inkSoft)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            if idx != previews.count - 1 {
                                Rectangle()
                                    .fill(Color.black.opacity(0.04))
                                    .frame(height: 1)
                            }
                        }
                    }
                )
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
        .padding(.top, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MafiaColor.surface.opacity(0.6))
    }
}

// `#Preview` macro plugin is Xcode-only; use PreviewProvider so CLI builds.
// Swap to `#Preview { SendersDetailView(onBack: {}) }` once opened in Xcode.
#if DEBUG
struct SendersDetailView_Previews: PreviewProvider {
    static var previews: some View {
        SendersDetailView(onBack: {})
    }
}
#endif
