//
//  SurfacesView.swift — Surfaces tab (port of
//  `vault-view/.../screens/Surfaces.tsx`).
//
//  Connection list (iCloud Photos, Google Photos, Drive, Gmail, Dropbox)
//  with per-surface health + scope + Manage/Add affordances, plus the
//  cross-surface coherence card — Mafia's distinctive metric per
//  DESIGN.md §10 #2: "one photo across surfaces is one entity."
//
//  See DESIGN.md §3.1 (IA), §4.4 (Card / PillButton / SectionLabel
//  patterns), §5 (microcopy library). Mock data mirrors
//  `vault-view/src/components/mafia/data.ts`'s `surfaces` array.
//
//  TODO(actions): wire Manage / Add / Reconnect into real sheets
//      (ScopeManager, ConnectionCeremony, Reconnect) once those are
//      ported. Right now the pills are present but no-op.
//
import SwiftUI
import MafiaDesignSystem

// MARK: - Surface model

/// Mirror of `Surface` from `vault-view/.../mafia/data.ts`. Kept local to
/// this file because no other Swift surface consumes it yet — promote to
/// `MafiaCore` once Vault / Insights / Settings need the same shape.
private struct Surface: Identifiable {
    enum Health { case ok, warn, off }
    enum Scope: String { case readOnly = "read-only", readWrite = "read+write" }

    let id: String
    let name: String
    let initials: String
    /// Brand tint shown behind `initials`. Rendered at ~33% opacity to
    /// match the web prototype's `s.color + "55"` (hex alpha 0x55 ≈ 33%).
    let color: Color
    let lastSync: String
    let scope: Scope
    let health: Health
    let connected: Bool
}

private let mockSurfaces: [Surface] = [
    Surface(id: "icloud",  name: "iCloud Photos",  initials: "iC",
            color: Color(.displayP3, red: 0.659, green: 0.780, blue: 0.980, opacity: 1),
            lastSync: "2 min ago",   scope: .readOnly,  health: .ok,   connected: true),
    Surface(id: "gphotos", name: "Google Photos",  initials: "GP",
            color: Color(.displayP3, red: 0.965, green: 0.718, blue: 0.690, opacity: 1),
            lastSync: "5 min ago",   scope: .readWrite, health: .ok,   connected: true),
    Surface(id: "gdrive",  name: "Google Drive",   initials: "GD",
            color: Color(.displayP3, red: 1.000, green: 0.878, blue: 0.541, opacity: 1),
            lastSync: "12 min ago",  scope: .readOnly,  health: .ok,   connected: true),
    Surface(id: "gmail",   name: "Gmail",          initials: "Gm",
            color: Color(.displayP3, red: 0.910, green: 0.608, blue: 0.235, opacity: 1),
            lastSync: "2 hours ago", scope: .readWrite, health: .warn, connected: true),
    Surface(id: "dropbox", name: "Dropbox",        initials: "Db",
            color: Color(.displayP3, red: 0.722, green: 0.773, blue: 0.651, opacity: 1),
            lastSync: "—",           scope: .readOnly,  health: .off,  connected: false),
]

// MARK: - SurfacesView

public struct SurfacesView: View {
    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header.padding(.top, 8)
                SurfacesList(surfaces: mockSurfaces).padding(.top, 24)
                CoherenceCard().padding(.top, 24)
                Text("Mafia treats one photo across surfaces as one entity.")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 32)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 128)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Surfaces")
                .font(MafiaFont.serif(size: 34))
                .foregroundStyle(MafiaColor.ink)
            Text("One library, many places. Sync stays read-only unless you say otherwise.")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Surfaces list card

private struct SurfacesList: View {
    let surfaces: [Surface]

    var body: some View {
        // Card encloses the whole list; per-row hairline dividers between rows,
        // matching the web `border-b border-black/[0.04]` pattern.
        Card(cornerRadius: 20, padding: 0) {
            VStack(spacing: 0) {
                ForEach(Array(surfaces.enumerated()), id: \.element.id) { idx, s in
                    SurfaceRow(surface: s)
                    if idx < surfaces.count - 1 {
                        Rectangle()
                            .fill(MafiaColor.ring)
                            .frame(height: 1)
                    }
                }
            }
        }
    }
}

private struct SurfaceRow: View {
    let surface: Surface

    var body: some View {
        HStack(spacing: 12) {
            // Colored square w/ initials. ~33% tint matches web `+ "55"`.
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(surface.color.opacity(0.33))
                .frame(width: 44, height: 44)
                .overlay(
                    Text(surface.initials)
                        .font(MafiaFont.body(size: 12, weight: .semibold))
                        .foregroundStyle(MafiaColor.ink)
                )

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(surface.name)
                        .font(MafiaFont.title)
                        .foregroundStyle(MafiaColor.ink)
                    if surface.connected, let dot = healthColor {
                        Circle().fill(dot).frame(width: 6, height: 6)
                    }
                }
                Text(subline)
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            trailingPill
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private var healthColor: Color? {
        switch surface.health {
        case .ok:   return MafiaColor.sage
        case .warn: return MafiaColor.clay
        case .off:  return nil
        }
    }

    private var subline: String {
        if surface.connected {
            return "Synced \(surface.lastSync) · \(surface.scope.rawValue)"
        }
        return "Not connected"
    }

    @ViewBuilder
    private var trailingPill: some View {
        if surface.connected {
            // TODO(actions): present ScopeManager sheet.
            Text("Manage")
                .font(MafiaFont.body(size: 11, weight: .medium))
                .foregroundStyle(MafiaColor.ink)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(MafiaColor.surface))
        } else {
            // TODO(actions): present ConnectionCeremony sheet.
            HStack(spacing: 4) {
                Image(systemName: "plus")
                    .font(.system(size: 10, weight: .semibold))
                Text("Add")
            }
            .font(MafiaFont.body(size: 11, weight: .medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Capsule().fill(MafiaColor.ink))
        }
    }
}

// MARK: - Cross-surface coherence card

private struct CoherenceCard: View {
    // Stats grid content — kept inline because no other surface needs it.
    private let stats: [(n: String, l: String)] = [
        ("12,847", "Entities"),
        ("1,204",  "Cross-linked"),
        ("76",     "Duplicates left"),
    ]

    var body: some View {
        Card(cornerRadius: 20, padding: 20) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel("Cross-surface coherence")
                Text("Your Photos and Drive are 94% deduped relative to each other.")
                    .font(MafiaFont.serif(size: 20))
                    .foregroundStyle(MafiaColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)

                CoherenceBar(uniqueFraction: 0.94).padding(.top, 16)

                HStack {
                    Text("Unique entities · 94%")
                    Spacer()
                    Text("Cross-surface duplicates · 6%")
                }
                .font(MafiaFont.body(size: 10.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 8)

                HStack(spacing: 12) {
                    ForEach(stats, id: \.l) { stat in
                        StatTile(number: stat.n, label: stat.l)
                    }
                }
                .padding(.top, 20)
            }
        }
    }
}

/// Horizontal stacked bar: sage `uniqueFraction` + amber remainder.
private struct CoherenceBar: View {
    let uniqueFraction: Double

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                Rectangle()
                    .fill(MafiaColor.sage)
                    .frame(width: geo.size.width * uniqueFraction)
                Rectangle()
                    .fill(MafiaColor.amber)
            }
        }
        .frame(height: 8)
        .clipShape(Capsule())
        .background(Capsule().fill(MafiaColor.surface))
    }
}

private struct StatTile: View {
    let number: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(number)
                .font(MafiaFont.serif(size: 20))
                .monospacedDigit()
                .foregroundStyle(MafiaColor.ink)
            Text(label)
                .font(MafiaFont.body(size: 10.5))
                .foregroundStyle(MafiaColor.inkSoft)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(MafiaColor.surface)
        )
    }
}

// `#Preview` macro plugin is Xcode-only; use PreviewProvider so CLI builds.
#if DEBUG
struct SurfacesView_Previews: PreviewProvider {
    static var previews: some View { SurfacesView() }
}
#endif
