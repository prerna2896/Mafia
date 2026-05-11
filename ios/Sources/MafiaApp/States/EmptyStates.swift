//
//  EmptyStates.swift — Empty / first-run state views (port of
//  `vault-view/.../mafia/_state/EmptyStates.tsx`).
//
//  Four public views:
//    • VaultEmpty       — no vault items yet. Outlined vault illustration +
//                         Learn-how sheet explaining 30-day retention.
//    • SurfacesEmpty    — no surfaces connected. Title block + list of 5
//                         connect-a-surface cards.
//    • InsightsEmpty    — no insights to show yet. Quiet bar chart + body.
//    • HomeFirstScan    — Home card shown while the first scan is running;
//                         a shimmering progress bar over a "scanning…" label.
//
//  Inline surface data mirrors the web prototype's `data.ts` `surfaces` array.
//  See DESIGN.md §4 (components), §5 (microcopy).
//
import SwiftUI
import MafiaDesignSystem

// MARK: - Inline surface data (mirrors vault-view/.../data.ts)

private struct EmptyStateSurface: Identifiable {
    let id: String
    let name: String
    let initials: String
    /// Brand tint. Rendered at ~33% opacity to match web `s.color + "66"`.
    let color: Color
    let subtext: String
}

private let connectableSurfaces: [EmptyStateSurface] = [
    EmptyStateSurface(
        id: "icloud", name: "iCloud Photos", initials: "iC",
        color: Color(.displayP3, red: 0.659, green: 0.780, blue: 0.980, opacity: 1),
        subtext: "Read your library · nothing changes"),
    EmptyStateSurface(
        id: "gphotos", name: "Google Photos", initials: "GP",
        color: Color(.displayP3, red: 0.965, green: 0.718, blue: 0.690, opacity: 1),
        subtext: "Read your library · nothing changes"),
    EmptyStateSurface(
        id: "gdrive", name: "Google Drive", initials: "GD",
        color: Color(.displayP3, red: 1.000, green: 0.878, blue: 0.541, opacity: 1),
        subtext: "Read your files · nothing changes"),
    EmptyStateSurface(
        id: "gmail", name: "Gmail", initials: "Gm",
        color: Color(.displayP3, red: 0.910, green: 0.608, blue: 0.235, opacity: 1),
        subtext: "Read your inbox · nothing changes"),
    EmptyStateSurface(
        id: "dropbox", name: "Dropbox", initials: "Db",
        color: Color(.displayP3, red: 0.722, green: 0.773, blue: 0.651, opacity: 1),
        subtext: "Read your files · nothing changes"),
]

// MARK: - VaultEmpty

public struct VaultEmpty: View {
    @State private var showInfo = false
    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            VaultIllustration()
                .frame(width: 120, height: 120)
            Text("Nothing here yet.")
                .font(MafiaFont.serif(size: 26))
                .foregroundStyle(MafiaColor.ink)
                .multilineTextAlignment(.center)
                .padding(.top, 24)
            Text("Items you move from your inbox or library will live here for 30 days. We never permanently delete without you.")
                .font(MafiaFont.body(size: 12.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 280)
                .padding(.top, 12)
            Button {
                showInfo = true
            } label: {
                Text("Learn how Vault works")
                    .font(MafiaFont.body(size: 12, weight: .medium))
                    .underline()
                    .foregroundStyle(MafiaColor.ink)
            }
            .padding(.top, 20)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MafiaColor.paper.ignoresSafeArea())
        .sheet(isPresented: $showInfo) {
            VaultInfoSheet(onDismiss: { showInfo = false })
                .presentationDetents([.medium])
        }
    }
}

private struct VaultInfoSheet: View {
    let onDismiss: () -> Void
    private let bullets: [String] = [
        "Anything you Vault stays recoverable for 30 days.",
        "We remind you 3 days before anything is purged.",
        "One tap restores items back to their original surface.",
        "Nothing leaves your account, ever.",
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Capsule()
                .fill(Color.black.opacity(0.15))
                .frame(width: 40, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, 12)
            Text("The 30-day window")
                .font(MafiaFont.serif(size: 22))
                .foregroundStyle(MafiaColor.ink)
                .padding(.top, 16)
            VStack(alignment: .leading, spacing: 12) {
                ForEach(bullets, id: \.self) { line in
                    HStack(alignment: .top, spacing: 12) {
                        Circle()
                            .fill(MafiaColor.amber)
                            .frame(width: 6, height: 6)
                            .padding(.top, 7)
                        Text(line)
                            .font(MafiaFont.body(size: 12.5))
                            .foregroundStyle(MafiaColor.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.top, 16)
            PillButton("Got it", style: .primary) { onDismiss() }
                .padding(.top, 24)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MafiaColor.paper.ignoresSafeArea())
    }
}

/// Outlined "vault" glyph composed of SwiftUI shapes (rounded rect, inner
/// rect, dial circle, four ticks, amber accent arc). Matches the web SVG.
private struct VaultIllustration: View {
    var body: some View {
        ZStack {
            // Outer body
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(MafiaColor.inkSoft.opacity(0.5), lineWidth: 1.5)
                .padding(.horizontal, 18)
                .padding(.vertical, 22)
            // Inner inset
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(MafiaColor.inkSoft.opacity(0.35), lineWidth: 1.2)
                .padding(.horizontal, 28)
                .padding(.vertical, 32)
            // Dial ring + center dot
            Circle()
                .stroke(MafiaColor.inkSoft.opacity(0.6), lineWidth: 1.5)
                .frame(width: 28, height: 28)
            Circle()
                .fill(MafiaColor.inkSoft.opacity(0.6))
                .frame(width: 5, height: 5)
            // Four cardinal ticks
            ForEach(0..<4, id: \.self) { i in
                Rectangle()
                    .fill(MafiaColor.inkSoft.opacity(0.5))
                    .frame(width: 1.2, height: 6)
                    .offset(y: -20)
                    .rotationEffect(.degrees(Double(i) * 90))
            }
            // Amber accent arc (top-right quadrant of dial)
            Circle()
                .trim(from: 0.75, to: 1.0)
                .stroke(MafiaColor.amber, style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
                .frame(width: 52, height: 52)
                .rotationEffect(.degrees(-90))
        }
    }
}

// MARK: - SurfacesEmpty

public struct SurfacesEmpty: View {
    /// Optional tap handler — caller can wire to ConnectionCeremony.
    public var onConnect: ((String) -> Void)?
    public init(onConnect: ((String) -> Void)? = nil) {
        self.onConnect = onConnect
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Surfaces")
                    .font(MafiaFont.serif(size: 34))
                    .foregroundStyle(MafiaColor.ink)
                    .padding(.top, 8)
                Text("Connect your first surface. Read-only until you say otherwise.")
                    .font(MafiaFont.body(size: 12))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .padding(.top, 4)
                Text("Connect your first surface")
                    .font(MafiaFont.serif(size: 20))
                    .foregroundStyle(MafiaColor.ink)
                    .padding(.top, 28)
                VStack(spacing: 10) {
                    ForEach(connectableSurfaces) { s in
                        Button {
                            // TODO(actions): present ConnectionCeremony sheet.
                            onConnect?(s.id)
                        } label: {
                            SurfaceConnectRow(surface: s)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, 12)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 128)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }
}

private struct SurfaceConnectRow: View {
    let surface: EmptyStateSurface
    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(surface.color.opacity(0.4))
                .frame(width: 48, height: 48)
                .overlay(
                    Text(surface.initials)
                        .font(MafiaFont.body(size: 13, weight: .semibold))
                        .foregroundStyle(MafiaColor.ink)
                )
            VStack(alignment: .leading, spacing: 2) {
                Text(surface.name)
                    .font(MafiaFont.body(size: 14, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
                Text(surface.subtext)
                    .font(MafiaFont.body(size: 11.5))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text("Connect")
                .font(MafiaFont.body(size: 11, weight: .medium))
                .foregroundStyle(MafiaColor.ink)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(MafiaColor.surface))
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Color.black.opacity(0.05), lineWidth: 1)
        )
    }
}

// MARK: - InsightsEmpty

public struct InsightsEmpty: View {
    public init() {}
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Insights")
                    .font(MafiaFont.serif(size: 34))
                    .foregroundStyle(MafiaColor.ink)
                    .padding(.top, 8)
                VStack(spacing: 0) {
                    Spacer(minLength: 48)
                    QuietBarChart()
                        .frame(width: 160, height: 92)
                    Text("Come back after your\nfirst cleanup.")
                        .font(MafiaFont.serif(size: 24))
                        .foregroundStyle(MafiaColor.ink)
                        .multilineTextAlignment(.center)
                        .padding(.top, 24)
                    Text("We'll show you cumulative recovery, what we learned about your preferences, and where your duplicates live.")
                        .font(MafiaFont.body(size: 12.5))
                        .foregroundStyle(MafiaColor.inkSoft)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 280)
                        .padding(.top, 12)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 128)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }
}

private struct QuietBarChart: View {
    private let bars: [CGFloat] = [22, 38, 30, 52, 44, 64, 48]
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottomLeading) {
                // Baseline
                Rectangle()
                    .fill(MafiaColor.inkSoft.opacity(0.3))
                    .frame(width: geo.size.width - 12, height: 1)
                    .offset(x: 6, y: -6)
                HStack(alignment: .bottom, spacing: 7) {
                    ForEach(Array(bars.enumerated()), id: \.offset) { idx, h in
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(MafiaColor.inkSoft.opacity(0.18 + Double(idx) * 0.03))
                            .frame(width: 14, height: h)
                    }
                }
                .padding(.leading, 10)
                .padding(.bottom, 8)
            }
        }
    }
}

// MARK: - HomeFirstScan

public struct HomeFirstScan: View {
    public init() {}
    public var body: some View {
        Card(cornerRadius: 20, padding: 20) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 12) {
                    ScanningBar()
                        .frame(height: 10)
                    Text("scanning…")
                        .font(MafiaFont.body(size: 10.5))
                        .monospacedDigit()
                        .foregroundStyle(MafiaColor.inkSoft)
                }
                Text("We'll surface findings here as Mafia learns. First scan running…")
                    .font(MafiaFont.body(size: 12))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)
            }
        }
    }
}

/// Indeterminate progress bar: an amber glow slides L→R forever, masked by
/// the track's capsule. Mirrors the web `mafia-firstscan` keyframe animation.
private struct ScanningBar: View {
    @State private var phase: CGFloat = 0
    var body: some View {
        GeometryReader { geo in
            Capsule()
                .fill(MafiaColor.surface)
                .overlay(
                    Capsule()
                        .fill(
                            LinearGradient(
                                gradient: Gradient(colors: [
                                    Color.clear,
                                    MafiaColor.amber,
                                    Color.clear,
                                ]),
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width / 3)
                        .offset(x: phase)
                        .mask(Capsule())
                )
                .onAppear {
                    let travel = geo.size.width
                    phase = -travel / 3
                    withAnimation(.linear(duration: 1.6).repeatForever(autoreverses: false)) {
                        phase = travel
                    }
                }
        }
    }
}

// MARK: - Previews

#if DEBUG
struct EmptyStates_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            VaultEmpty()
                .previewDisplayName("VaultEmpty")
            SurfacesEmpty()
                .previewDisplayName("SurfacesEmpty")
            InsightsEmpty()
                .previewDisplayName("InsightsEmpty")
            HomeFirstScan()
                .padding(24)
                .background(MafiaColor.paper)
                .previewDisplayName("HomeFirstScan")
        }
    }
}
#endif
