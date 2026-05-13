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
//  TODO(actions): wire Reconnect pill (warn-health rows) into the
//      ReconnectSheet once that's ported. Manage / Add / row-tap /
//      coherence-duplicates are wired below to ScopeManagerSheet,
//      ConnectionCeremonyView, SurfaceDetailView and ConflictResolutionView
//      respectively.
//
import SwiftUI
import MafiaDesignSystem

// MARK: - Sheet payload wrappers
//
// `.sheet(item:)` and `.fullScreenCover(item:)` require `Identifiable`
// payloads. The sheets' public descriptor types (`ScopeManagerSurface`,
// `SurfaceDetailSurface`, `CeremonySurface`) are intentionally plain
// value types — we wrap them locally so we can drive presentation by
// setting/clearing a single optional state.

private struct ScopeManagerPayload: Identifiable {
    let id: String
    let surface: ScopeManagerSurface
}

private struct SurfaceDetailPayload: Identifiable {
    let id: String
    let surface: SurfaceDetailSurface
}

private struct CeremonyPayload: Identifiable {
    let id: String
    let surface: CeremonySurface
}

/// Marker payload for the coherence-card duplicates link. The conflict
/// sheet doesn't need a per-row descriptor — just a present/dismiss flag —
/// but `.fullScreenCover(item:)` still wants something Identifiable.
private struct ConflictPayload: Identifiable {
    let id: String = "coherence-duplicates"
    let groups: [ConflictGroup]
}

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

// Brand tints reused for the mock conflict groups, mirroring the inline
// data block in `vault-view/.../mafia/_sheets/ConflictResolution.tsx`.
private let icloudTint = Color(.displayP3, red: 0.659, green: 0.780, blue: 0.980, opacity: 1)
private let gphotosTint = Color(.displayP3, red: 0.965, green: 0.718, blue: 0.690, opacity: 1)
private let driveTint = Color(.displayP3, red: 1.000, green: 0.878, blue: 0.541, opacity: 1)

/// Mock cross-surface duplicate groups surfaced when the user taps the
/// coherence card's "Cross-surface duplicates · 6%" target. 4 groups,
/// mirroring the shape (though not the exact size) of the inline mock in
/// `ConflictResolution.tsx`.
private let mockSurfacesConflictGroups: [ConflictGroup] = [
    ConflictGroup(id: "sg1", surfaces: [
        ConflictSurface(id: "sg1-icloud",  name: "iCloud",        color: icloudTint),
        ConflictSurface(id: "sg1-gphotos", name: "Google Photos", color: gphotosTint),
    ]),
    ConflictGroup(id: "sg2", surfaces: [
        ConflictSurface(id: "sg2-icloud",  name: "iCloud",        color: icloudTint),
        ConflictSurface(id: "sg2-gphotos", name: "Google Photos", color: gphotosTint),
        ConflictSurface(id: "sg2-drive",   name: "Drive",         color: driveTint),
    ]),
    ConflictGroup(id: "sg3", surfaces: [
        ConflictSurface(id: "sg3-gphotos", name: "Google Photos", color: gphotosTint),
        ConflictSurface(id: "sg3-drive",   name: "Drive",         color: driveTint),
    ]),
    ConflictGroup(id: "sg4", surfaces: [
        ConflictSurface(id: "sg4-icloud",  name: "iCloud",        color: icloudTint),
        ConflictSurface(id: "sg4-drive",   name: "Drive",         color: driveTint),
    ]),
]

// MARK: - SurfacesView

public struct SurfacesView: View {
    public init() {}

    // Sheet presentation state. Setting any of these to non-nil triggers
    // the corresponding `.sheet(item:)` / `.fullScreenCover(item:)` below.
    @State private var scopeManaging: ScopeManagerPayload?
    @State private var surfaceDetail: SurfaceDetailPayload?
    @State private var connectionCeremony: CeremonyPayload?
    @State private var conflictResolution: ConflictPayload?

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header.padding(.top, 8)
                SurfacesList(
                    surfaces: mockSurfaces,
                    onManage: { s in scopeManaging = mapToScopePayload(s) },
                    onRowTap: { s in
                        guard s.connected else { return }
                        surfaceDetail = mapToDetailPayload(s)
                    },
                    onAdd: { s in connectionCeremony = mapToCeremonyPayload(s) }
                )
                .padding(.top, 24)
                CoherenceCard(
                    onDuplicatesTap: {
                        conflictResolution = ConflictPayload(groups: mockSurfacesConflictGroups)
                    }
                )
                .padding(.top, 24)
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
        // Manage pill → scope manager (modal sheet, large detent).
        .sheet(item: $scopeManaging) { payload in
            ScopeManagerSheet(
                surface: payload.surface,
                onClose: { scopeManaging = nil }
            )
        }
        // `.fullScreenCover` is iOS-only; on macOS the package still
        // compiles via SwiftPM (see Package.swift) so fall back to `.sheet`
        // there. iOS gets the immersive full-screen overlay per spec.
        #if os(iOS)
        // Whole-row tap on connected surface → full-screen detail.
        .fullScreenCover(item: $surfaceDetail) { payload in
            SurfaceDetailView(
                surface: payload.surface,
                onClose: { surfaceDetail = nil }
            )
        }
        // Add pill on disconnected (Dropbox) row → ceremony overlay.
        .fullScreenCover(item: $connectionCeremony) { payload in
            ConnectionCeremonyView(
                surface: payload.surface,
                onClose: { connectionCeremony = nil }
            )
        }
        // Coherence card duplicates link → conflict resolver.
        .fullScreenCover(item: $conflictResolution) { payload in
            ConflictResolutionView(
                groups: payload.groups,
                onClose: { conflictResolution = nil }
            )
        }
        #else
        .sheet(item: $surfaceDetail) { payload in
            SurfaceDetailView(
                surface: payload.surface,
                onClose: { surfaceDetail = nil }
            )
        }
        .sheet(item: $connectionCeremony) { payload in
            ConnectionCeremonyView(
                surface: payload.surface,
                onClose: { connectionCeremony = nil }
            )
        }
        .sheet(item: $conflictResolution) { payload in
            ConflictResolutionView(
                groups: payload.groups,
                onClose: { conflictResolution = nil }
            )
        }
        #endif
    }

    // MARK: payload mapping
    //
    // The Surfaces tab's private `Surface` model carries everything the
    // sheets need, but each sheet declares its own minimal descriptor
    // type. We translate at the call site so the sheets stay decoupled.

    private func mapToScopePayload(_ s: Surface) -> ScopeManagerPayload {
        ScopeManagerPayload(
            id: s.id,
            surface: ScopeManagerSurface(
                id: s.id,
                name: s.name,
                initials: s.initials,
                color: s.color,
                lastSync: s.lastSync,
                canModify: s.scope == .readWrite
            )
        )
    }

    private func mapToDetailPayload(_ s: Surface) -> SurfaceDetailPayload {
        SurfaceDetailPayload(
            id: s.id,
            surface: SurfaceDetailSurface(
                id: s.id,
                name: s.name,
                initials: s.initials,
                color: s.color,
                lastSync: s.lastSync,
                scope: s.scope.rawValue
            )
        )
    }

    private func mapToCeremonyPayload(_ s: Surface) -> CeremonyPayload {
        CeremonyPayload(
            id: s.id,
            surface: CeremonySurface(
                id: s.id,
                name: s.name,
                initials: s.initials,
                color: s.color
            )
        )
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
    let onManage: (Surface) -> Void
    let onRowTap: (Surface) -> Void
    let onAdd: (Surface) -> Void

    var body: some View {
        // Card encloses the whole list; per-row hairline dividers between rows,
        // matching the web `border-b border-black/[0.04]` pattern.
        Card(cornerRadius: 20, padding: 0) {
            VStack(spacing: 0) {
                ForEach(Array(surfaces.enumerated()), id: \.element.id) { idx, s in
                    SurfaceRow(
                        surface: s,
                        onManage: { onManage(s) },
                        onRowTap: { onRowTap(s) },
                        onAdd: { onAdd(s) }
                    )
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
    let onManage: () -> Void
    let onRowTap: () -> Void
    let onAdd: () -> Void

    var body: some View {
        // The row is a full-width button so the entire surface (except the
        // trailing pill, which has its own gesture) opens SurfaceDetailView.
        // Disconnected rows ignore taps — the Add pill is the only affordance.
        Button(action: { if surface.connected { onRowTap() } }) {
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
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
            // Manage pill → ScopeManagerSheet. Nested Button intercepts taps
            // so the parent row-tap doesn't also fire.
            Button(action: onManage) {
                Text("Manage")
                    .font(MafiaFont.body(size: 11, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(MafiaColor.surface))
            }
            .buttonStyle(.plain)
        } else {
            // Add pill (Dropbox row) → ConnectionCeremonyView.
            Button(action: onAdd) {
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
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Cross-surface coherence card

private struct CoherenceCard: View {
    let onDuplicatesTap: () -> Void

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
                        .font(MafiaFont.body(size: 10.5))
                        .foregroundStyle(MafiaColor.inkSoft)
                    Spacer()
                    // Tap target → ConflictResolutionView. Matches the
                    // prototype's underlined ink-tone link on the right side
                    // of the bar legend.
                    Button(action: onDuplicatesTap) {
                        Text("Cross-surface duplicates · 6%")
                            .font(MafiaFont.body(size: 10.5))
                            .foregroundStyle(MafiaColor.ink)
                            .underline()
                    }
                    .buttonStyle(.plain)
                }
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
