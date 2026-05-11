//
//  SurfaceDetailView.swift — Port of
//  `vault-view/.../mafia/_sheets/SurfaceDetail.tsx`.
//
//  Full-screen overlay (`.fullScreenCover`). Per-surface drill-down,
//  reached from a tap on a surface row in the Surfaces tab.
//
//  Layout (top → bottom):
//    1. Top bar — Back / surface name / spacer
//    2. Surface header chip (initials tile + name + "Synced X · scope")
//    3. Storage card — 3-segment used/vaulted/headroom bar + legend
//    4. Top senders / folders card — 4 rows of "name N"
//    5. Last-30-days activity card — 5 placeholder mini-bars per spec
//
//  See DESIGN.md §3.1, §4.2 (sheet system), §5.1 (Surfaces tab).
//
//  Like `ScopeManagerSheet`, takes a lightweight `SurfaceDetailSurface`
//  descriptor so it doesn't depend on the private `Surface` model in
//  `Tabs/SurfacesView.swift`.
//

import SwiftUI
import MafiaDesignSystem

// MARK: - Surface descriptor

/// Minimal surface descriptor consumed by `SurfaceDetailView`.
public struct SurfaceDetailSurface {
    public let id: String
    public let name: String
    public let initials: String
    public let color: Color
    public let lastSync: String
    /// Human-readable scope label ("read-only" / "read+write").
    public let scope: String

    public init(
        id: String,
        name: String,
        initials: String,
        color: Color,
        lastSync: String,
        scope: String
    ) {
        self.id = id
        self.name = name
        self.initials = initials
        self.color = color
        self.lastSync = lastSync
        self.scope = scope
    }
}

// MARK: - SurfaceDetailView

public struct SurfaceDetailView: View {
    private let surface: SurfaceDetailSurface
    private let onClose: () -> Void

    /// Storage breakdown (percent). Used + vaulted + headroom = 100.
    private let used: Int = 62
    private let vaulted: Int = 18
    private var headroom: Int { 100 - used - vaulted }

    /// Top senders / folders mock — mirror of the prototype's array.
    private let topSenders: [(name: String, n: Int)] = [
        ("LinkedIn",  412),
        ("DoorDash",  198),
        ("Substack",  142),
        ("Notion",    119),
    ]

    public init(surface: SurfaceDetailSurface, onClose: @escaping () -> Void) {
        self.surface = surface
        self.onClose = onClose
    }

    public var body: some View {
        ZStack {
            MafiaColor.paper.ignoresSafeArea()
            VStack(spacing: 0) {
                topBar
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        surfaceHeader
                        storageCard.padding(.top, 24)
                        topSendersCard.padding(.top, 24)
                        activityCard.padding(.top, 24)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 20)
                    .padding(.bottom, 32)
                }
            }
        }
    }

    // MARK: top bar

    private var topBar: some View {
        HStack {
            Button(action: onClose) {
                Text("← Surfaces")
                    .font(MafiaFont.body(size: 12.5, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
            }
            .buttonStyle(.plain)
            Spacer()
            Text(surface.name)
                .font(MafiaFont.body(size: 12, weight: .medium))
                .foregroundStyle(MafiaColor.ink)
            Spacer()
            Spacer().frame(width: 48)
        }
        .padding(.horizontal, 16)
        .padding(.top, 48)
        .padding(.bottom, 12)
        .overlay(
            Rectangle().fill(Color.black.opacity(0.04)).frame(height: 1),
            alignment: .bottom
        )
    }

    // MARK: surface header chip

    private var surfaceHeader: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(surface.color.opacity(0.33))
                Text(surface.initials)
                    .font(MafiaFont.body(size: 13, weight: .semibold))
                    .foregroundStyle(MafiaColor.ink)
            }
            .frame(width: 48, height: 48)

            VStack(alignment: .leading, spacing: 2) {
                Text(surface.name)
                    .font(MafiaFont.serif(size: 22))
                    .foregroundStyle(MafiaColor.ink)
                Text("Synced \(surface.lastSync) · \(surface.scope)")
                    .font(MafiaFont.body(size: 11.5))
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: storage card

    private var storageCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("STORAGE")
                    .font(MafiaFont.eyebrow)
                    .tracking(1.4)
                    .foregroundStyle(MafiaColor.inkSoft)
                Spacer()
                Text("187 GB / 200 GB")
                    .font(MafiaFont.body(size: 11))
                    .monospacedDigit()
                    .foregroundStyle(MafiaColor.inkSoft)
            }

            // 3-segment storage bar. SwiftUI's GeometryReader gives precise
            // proportional widths.
            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle()
                        .fill(surface.color)
                        .frame(width: geo.size.width * CGFloat(used) / 100)
                    Rectangle()
                        .fill(MafiaColor.sage)
                        .frame(width: geo.size.width * CGFloat(vaulted) / 100)
                    Rectangle()
                        .fill(headroomColor)
                        .frame(width: geo.size.width * CGFloat(headroom) / 100)
                }
            }
            .frame(height: 10)
            .clipShape(Capsule())
            .padding(.top, 12)

            HStack(spacing: 8) {
                Legend(dot: surface.color, label: "Used", value: "\(used)%")
                Legend(dot: MafiaColor.sage, label: "Vaulted", value: "\(vaulted)%")
                Legend(dot: headroomColor, label: "Headroom", value: "\(headroom)%")
            }
            .padding(.top, 12)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(MafiaColor.ring, lineWidth: 1)
        )
    }

    /// Lightened surface tone for the headroom segment. Prototype uses
    /// `color-mix(in oklab, var(--surface) 60%, white)` — we mix surface
    /// components with white at 60/40.
    private var headroomColor: Color {
        Color(
            .displayP3,
            red: 0.962 * 0.6 + 1.0 * 0.4,
            green: 0.960 * 0.6 + 1.0 * 0.4,
            blue: 0.949 * 0.6 + 1.0 * 0.4,
            opacity: 1
        )
    }

    // MARK: top senders card

    private var topSendersCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("TOP SENDERS / FOLDERS")
                .font(MafiaFont.eyebrow)
                .tracking(1.4)
                .foregroundStyle(MafiaColor.inkSoft)
            VStack(spacing: 8) {
                ForEach(topSenders, id: \.name) { row in
                    HStack {
                        Text(row.name)
                            .font(MafiaFont.body(size: 12.5))
                            .foregroundStyle(MafiaColor.ink)
                        Spacer()
                        Text("\(row.n)")
                            .font(MafiaFont.body(size: 11))
                            .monospacedDigit()
                            .foregroundStyle(MafiaColor.inkSoft)
                    }
                }
            }
            .padding(.top, 8)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(MafiaColor.ring, lineWidth: 1)
        )
    }

    // MARK: activity card

    /// Spec calls for 5 placeholder mini-bars (the web prototype renders 30
    /// thin daily bars; we mirror the spec exactly here).
    /// Heights chosen to suggest a varied 5-week activity gradient.
    private let activityHeights: [CGFloat] = [0.45, 0.7, 0.55, 0.85, 0.6]

    private var activityCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("LAST 30 DAYS · VAULT ACTIVITY")
                .font(MafiaFont.eyebrow)
                .tracking(1.4)
                .foregroundStyle(MafiaColor.inkSoft)
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(activityHeights.indices, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(surface.color.opacity(0.67))
                        .frame(maxWidth: .infinity)
                        .frame(height: 80 * activityHeights[i])
                }
            }
            .frame(height: 80)
            .padding(.top, 12)

            HStack {
                Text("30d ago")
                    .font(MafiaFont.body(size: 10))
                    .monospacedDigit()
                Spacer()
                Text("today")
                    .font(MafiaFont.body(size: 10))
                    .monospacedDigit()
            }
            .foregroundStyle(MafiaColor.inkSoft)
            .padding(.top, 8)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(MafiaColor.ring, lineWidth: 1)
        )
    }
}

// MARK: - Legend

private struct Legend: View {
    let dot: Color
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(dot)
                .frame(width: 8, height: 8)
            Text(label)
                .font(MafiaFont.body(size: 11))
                .foregroundStyle(MafiaColor.inkSoft)
            Spacer(minLength: 0)
            Text(value)
                .font(MafiaFont.body(size: 11))
                .monospacedDigit()
                .foregroundStyle(MafiaColor.ink)
        }
    }
}

// MARK: - Previews

#if DEBUG
struct SurfaceDetailView_Previews: PreviewProvider {
    static var previews: some View {
        SurfaceDetailView(
            surface: SurfaceDetailSurface(
                id: "gphotos",
                name: "Google Photos",
                initials: "GP",
                color: Color(.displayP3, red: 0.965, green: 0.718, blue: 0.690, opacity: 1),
                lastSync: "5 min ago",
                scope: "read+write"
            ),
            onClose: {}
        )
        .previewDisplayName("SurfaceDetail")
    }
}
#endif
