//
//  HomeView.swift — Home tab (port of `vault-view/.../screens/Home.tsx`).
//  Greeting + three-archetype invitation card (Spark / Facilitator / JIT)
//  + horizontal Discoveries scroll + trust footer.
//  See DESIGN.md §3.1, §6 (archetypes), §5 (microcopy).
//
//  Image assets are stubbed as solid Color rectangles. Each placeholder is
//  tagged `TODO(assets):` and gets replaced once the asset bundle / PhotoKit
//  wiring lands (PRD §12.1).
//
import SwiftUI
import MafiaDesignSystem

private enum HomeArchetype: CaseIterable {
    case spark, facilitator, jit
    var next: HomeArchetype {
        switch self {
        case .spark: return .facilitator
        case .facilitator: return .jit
        case .jit: return .spark
        }
    }
}

public struct HomeView: View {
    @State private var archetype: HomeArchetype = .spark
    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                greeting.padding(.top, 8)
                invitationCard.padding(.top, 28)
                discoveries.padding(.top, 36)
                Text("We never permanently delete without you.")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 40)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 128)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Good morning,\nPrerna.")
                .font(MafiaFont.serif(size: 34))
                .lineSpacing(-2)
                .foregroundStyle(MafiaColor.ink)
            Text("Charging · Wi-Fi · 4 surfaces synced")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
        }
    }

    private var invitationCard: some View {
        Card(cornerRadius: 22, padding: 20) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    SectionLabel("This week's invitation")
                    Spacer()
                    Button {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            archetype = archetype.next
                        }
                    } label: {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(MafiaColor.inkSoft)
                    }
                    .accessibilityLabel("Cycle invitation")
                }
                switch archetype {
                case .spark:       SparkCard()
                case .facilitator: FacilitatorCard()
                case .jit:         JitCard()
                }
            }
        }
    }

    private var discoveries: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel("Discoveries")
                Spacer()
                Text("3 new")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            .padding(.horizontal, 4)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    DiscoveryCard(tone: .amber,
                                  eyebrow: "Receipts · Files",
                                  title: "47 expired boarding passes",
                                  sub: "From 2019 – 2024 across Gmail + Drive",
                                  cta: "Vault all", imageColor: nil)
                    DiscoveryCard(tone: .default,
                                  eyebrow: "Inbox pattern",
                                  title: "18 senders = 73% of unread",
                                  sub: "Mostly newsletters & receipts",
                                  cta: "See senders", imageColor: nil)
                    // TODO(assets): real burst thumbnail from PhotoKit
                    DiscoveryCard(tone: .default,
                                  eyebrow: "Burst · 11 photos",
                                  title: "Pick the keeper from this burst",
                                  sub: "We picked the sharpest. Vault the other 10?",
                                  cta: "Open burst", imageColor: MafiaColor.sage)
                    // TODO(assets): real time-capsule thumbnail
                    DiscoveryCard(tone: .default,
                                  eyebrow: "Time capsule",
                                  title: "A photo you haven't seen in 3 years",
                                  sub: "Goa, Feb 2022",
                                  cta: "Open", imageColor: MafiaColor.amberSoft)
                }
                .padding(.horizontal, 24)
            }
            .padding(.horizontal, -24)
        }
    }
}

// MARK: - Archetype bodies

private struct SparkCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Want to see the 6 best shots from your Goa trip?")
                .font(MafiaFont.serif(size: 24)).foregroundStyle(MafiaColor.ink)
                .padding(.top, 12)
            HStack(spacing: 8) {
                // TODO(assets): swap solid Color tiles for real Goa thumbnails
                ForEach(0..<3, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill([MafiaColor.amberSoft, MafiaColor.sageSoft, MafiaColor.surface][i])
                        .frame(height: 78).frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 16)
            HStack {
                Text("From iCloud + Google Photos")
                    .font(MafiaFont.body(size: 11)).foregroundStyle(MafiaColor.inkSoft)
                Spacer()
                PillButton("Show me ✨", style: .accent, fullWidth: false) { }
            }
            .padding(.top, 16)
        }
    }
}

private struct FacilitatorCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Free 4 GB right now.\nOne tap, Vault keeps a copy.")
                .font(MafiaFont.serif(size: 24)).foregroundStyle(MafiaColor.ink)
                .padding(.top, 12)
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("182.4").font(MafiaFont.serif(size: 28))
                            .monospacedDigit().foregroundStyle(MafiaColor.ink)
                        Text("/ 200 GB").font(MafiaFont.body(size: 14))
                            .foregroundStyle(MafiaColor.inkSoft)
                    }
                    Spacer()
                    Text("iCloud + Google").font(MafiaFont.body(size: 12))
                        .foregroundStyle(MafiaColor.inkSoft)
                }
                StorageBar(fraction: 0.91)
                HStack {
                    Text("Used 91%"); Spacer(); Text("4 GB recoverable now")
                }
                .font(MafiaFont.body(size: 10)).foregroundStyle(MafiaColor.inkSoft)
            }
            .padding(.top, 20)
            HStack {
                Text("Reversible · 30-day Vault")
                    .font(MafiaFont.body(size: 11)).foregroundStyle(MafiaColor.inkSoft)
                Spacer()
                PillButton("Free 4 GB", style: .accent, fullWidth: false) { }
            }
            .padding(.top, 20)
        }
    }
}

/// Gradient storage usage bar — sage→amber at 91% per the web prototype.
private struct StorageBar: View {
    let fraction: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(MafiaColor.surface)
                Capsule().fill(LinearGradient(
                    colors: [MafiaColor.sage, MafiaColor.amber],
                    startPoint: .leading, endPoint: .trailing))
                    .frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 10)
    }
}

private struct JitCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Pick your favorite from the last burst?")
                .font(MafiaFont.serif(size: 24)).foregroundStyle(MafiaColor.ink)
                .padding(.top, 12)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    // TODO(assets): swap for actual burst frames
                    ForEach(0..<11, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(MafiaColor.surface)
                            .frame(width: 44, height: 64)
                            .overlay(
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .strokeBorder(i == 0 ? MafiaColor.amber : .clear,
                                                  lineWidth: 2)
                                    .padding(-3))
                    }
                }
                .padding(.horizontal, 4).padding(.vertical, 6)
            }
            .padding(.top, 12)
            HStack {
                Text("11 photos · 0.6 sec apart")
                    .font(MafiaFont.body(size: 11)).foregroundStyle(MafiaColor.inkSoft)
                Spacer()
                PillButton("Pick keeper", style: .accent, fullWidth: false) { }
            }
            .padding(.top, 16)
        }
    }
}

private struct DiscoveryCard: View {
    enum Tone { case `default`, amber }
    let tone: Tone
    let eyebrow: String
    let title: String
    let sub: String
    let cta: String
    /// Nil = no image block; non-nil = colored stub. TODO(assets): real photo.
    let imageColor: Color?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let imageColor {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(imageColor).frame(height: 110).padding(.bottom, 12)
            }
            Text(eyebrow.uppercased())
                .font(MafiaFont.body(size: 10, weight: .medium)).tracking(1.2)
                .foregroundStyle(tone == .amber ? MafiaColor.amber : MafiaColor.inkSoft)
            Text(title)
                .font(MafiaFont.serif(size: 17)).foregroundStyle(MafiaColor.ink)
                .padding(.top, 6).fixedSize(horizontal: false, vertical: true)
            Text(sub)
                .font(MafiaFont.body(size: 11.5)).foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 6).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 4) { Text(cta); Text("→") }
                .font(MafiaFont.body(size: 11.5, weight: .medium))
                .foregroundStyle(MafiaColor.ink)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Capsule().fill(tone == .amber
                                           ? MafiaColor.amber
                                           : MafiaColor.surface))
                .padding(.top, 12)
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(width: 230, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color.white))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(MafiaColor.ring, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.08), radius: 9, x: 0, y: 2)
    }
}

// `#Preview` macro plugin is Xcode-only; use PreviewProvider so CLI builds.
// Swap to `#Preview { HomeView() }` once opened in Xcode.
#if DEBUG
struct HomeView_Previews: PreviewProvider {
    static var previews: some View { HomeView() }
}
#endif
