//
//  ScopeManagerSheet.swift — Port of
//  `vault-view/.../mafia/_state/ScopeManager.tsx`.
//
//  Per-surface scope sheet, presented from the Surfaces tab when the user
//  taps "Manage" on a connected surface.
//
//  Layout (top → bottom):
//    1. Surface chip header (initials tile + name + "Connected as X · synced Y")
//    2. Permissions card — three rows:
//         • Read library          — always-on toggle (disabled)
//         • Modify (move to Vault)
//         • Delete (purge from Vault permanently)
//    3. Filters card — older-than slider (0–365 days) + skip-albums chip group
//    4. Danger zone collapsible row → reveals "Disconnect [surface]"
//    5. Done CTA
//
//  See DESIGN.md §4.2 (sheet system), §5 (copy library), §6.2 (read-only-first).
//
//  Surface is intentionally described by a lightweight value type
//  (`ScopeManagerSurface`) so this sheet doesn't depend on the private
//  `Surface` model in `Tabs/SurfacesView.swift`. The Surfaces tab will pass
//  a value mapped from its own model when wiring (TODO(actions) marker
//  there). Mirror of the `Surface` shape from `vault-view/.../data.ts`.
//

import SwiftUI
import MafiaDesignSystem

// MARK: - Surface descriptor

/// Lightweight surface descriptor the sheet needs to render its header.
/// Decouples this sheet from the private `Surface` model used in
/// `SurfacesView.swift` — callers map their own type into this when
/// presenting.
public struct ScopeManagerSurface {
    public let id: String
    public let name: String
    public let initials: String
    /// Brand tint behind `initials` (rendered ~33% opacity to match web's
    /// `s.color + "55"`).
    public let color: Color
    public let lastSync: String
    /// True if Mafia currently holds a `read+write` (modify) scope.
    public let canModify: Bool

    public init(
        id: String,
        name: String,
        initials: String,
        color: Color,
        lastSync: String,
        canModify: Bool
    ) {
        self.id = id
        self.name = name
        self.initials = initials
        self.color = color
        self.lastSync = lastSync
        self.canModify = canModify
    }
}

// MARK: - ScopeManagerSheet

public struct ScopeManagerSheet: View {
    private let surface: ScopeManagerSurface
    private let email: String
    private let onClose: () -> Void
    private let onDisconnect: () -> Void

    @State private var modify: Bool
    @State private var purge: Bool = false
    @State private var olderThan: Double = 30
    @State private var skipped: Set<String> = ["Favorites"]
    @State private var dangerOpen: Bool = false

    private let albums = ["Favorites", "Family", "Travel · 2024", "Screenshots", "Selfies"]

    public init(
        surface: ScopeManagerSurface,
        email: String = "prerna2896@gmail.com",
        onClose: @escaping () -> Void,
        onDisconnect: @escaping () -> Void = {}
    ) {
        self.surface = surface
        self.email = email
        self.onClose = onClose
        self.onDisconnect = onDisconnect
        _modify = State(initialValue: surface.canModify)
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                permissionsSection.padding(.top, 8)
                filtersSection.padding(.top, 8)
                dangerZone.padding(.top, 20)
                PillButton("Done", style: .primary, action: onClose)
                    .padding(.top, 20)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
        .presentationDetents([.large])
    }

    // MARK: header

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(surface.color.opacity(0.33))
                Text(surface.initials)
                    .font(MafiaFont.body(size: 12, weight: .semibold))
                    .foregroundStyle(MafiaColor.ink)
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text(surface.name)
                    .font(MafiaFont.serif(size: 20))
                    .foregroundStyle(MafiaColor.ink)
                Text("Connected as \(email) · synced \(surface.lastSync)")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: permissions

    private var permissionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Permissions")
            VStack(spacing: 0) {
                PermRow(
                    title: "Read library",
                    sub: "Always on. Disconnect to revoke.",
                    on: .constant(true),
                    disabled: true,
                    showDivider: true
                )
                PermRow(
                    title: "Modify (move to Vault)",
                    sub: modify
                        ? "Mafia can move items you choose to Vault."
                        : "We can find duplicates but can't move them.",
                    on: $modify,
                    showDivider: true
                )
                PermRow(
                    title: "Delete (purge from Vault permanently)",
                    sub: purge
                        ? "Auto-purges after 30-day window."
                        : "We'll always need your manual confirmation to permanently delete.",
                    on: $purge,
                    showDivider: false
                )
            }
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(MafiaColor.ring, lineWidth: 1)
            )
        }
    }

    // MARK: filters

    private var filtersSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Filters")
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("Scan only photos older than ")
                        .font(MafiaFont.body(size: 13, weight: .medium))
                        .foregroundStyle(MafiaColor.ink)
                    + Text("\(Int(olderThan))")
                        .font(MafiaFont.serif(size: 13))
                        .monospacedDigit()
                        .foregroundStyle(MafiaColor.ink)
                    + Text(" days")
                        .font(MafiaFont.body(size: 11))
                        .foregroundStyle(MafiaColor.inkSoft)
                    Spacer(minLength: 0)
                }

                // Slider — SwiftUI's native control gives us track + thumb that
                // approximate the prototype's amber-filled range input.
                Slider(value: $olderThan, in: 0...365, step: 1)
                    .tint(MafiaColor.amber)
                    .padding(.top, 8)

                HStack {
                    Text("0").font(MafiaFont.body(size: 10)).monospacedDigit()
                    Spacer()
                    Text("90").font(MafiaFont.body(size: 10)).monospacedDigit()
                    Spacer()
                    Text("180").font(MafiaFont.body(size: 10)).monospacedDigit()
                    Spacer()
                    Text("365").font(MafiaFont.body(size: 10)).monospacedDigit()
                }
                .foregroundStyle(MafiaColor.inkSoft)

                Text("Skip albums")
                    .font(MafiaFont.body(size: 12, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
                    .padding(.top, 20)

                FlowChips(items: albums) { album in
                    let on = skipped.contains(album)
                    Button {
                        if on { skipped.remove(album) } else { skipped.insert(album) }
                    } label: {
                        Text(album)
                            .font(MafiaFont.body(size: 11, weight: .medium))
                            .foregroundStyle(on ? .white : MafiaColor.inkSoft)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                Capsule().fill(on ? MafiaColor.ink : Color.white)
                            )
                            .overlay(
                                Capsule().strokeBorder(
                                    on ? MafiaColor.ink : Color.black.opacity(0.1),
                                    lineWidth: 1
                                )
                            )
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 8)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(MafiaColor.ring, lineWidth: 1)
            )
        }
    }

    // MARK: danger zone

    private var dangerZone: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    dangerOpen.toggle()
                }
            } label: {
                HStack {
                    Text("DANGER ZONE")
                        .font(MafiaFont.eyebrow)
                        .tracking(1.4)
                        .foregroundStyle(MafiaColor.clay)
                    Spacer()
                    Text(dangerOpen ? "▾" : "▸")
                        .font(MafiaFont.body(size: 12))
                        .foregroundStyle(MafiaColor.inkSoft)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color.white)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(MafiaColor.ring, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)

            if dangerOpen {
                VStack(alignment: .leading, spacing: 4) {
                    Button {
                        onDisconnect()
                        onClose()
                    } label: {
                        Text("Disconnect \(surface.name)")
                            .font(MafiaFont.body(size: 13, weight: .medium))
                            .foregroundStyle(MafiaColor.clay)
                    }
                    .buttonStyle(.plain)
                    Text("Your vault items stay. New scans stop. Re-connect anytime.")
                        .font(MafiaFont.body(size: 11))
                        .foregroundStyle(MafiaColor.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color.white)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(MafiaColor.ring, lineWidth: 1)
                )
            }
        }
    }
}

// MARK: - PermRow

private struct PermRow: View {
    let title: String
    let sub: String
    @Binding var on: Bool
    var disabled: Bool = false
    var showDivider: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(MafiaFont.body(size: 13, weight: .medium))
                        .foregroundStyle(MafiaColor.ink)
                    Text(sub)
                        .font(MafiaFont.body(size: 11))
                        .foregroundStyle(MafiaColor.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                ScopeToggle(on: $on, disabled: disabled)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            if showDivider {
                Rectangle()
                    .fill(Color.black.opacity(0.04))
                    .frame(height: 1)
            }
        }
    }
}

/// Pill toggle matching the web prototype's `Toggle` component
/// (`bg-[var(--ink)]` on, `bg-black/15` off, 28h × 48w).
private struct ScopeToggle: View {
    @Binding var on: Bool
    var disabled: Bool

    var body: some View {
        Button {
            guard !disabled else { return }
            on.toggle()
        } label: {
            ZStack(alignment: on ? .trailing : .leading) {
                Capsule()
                    .fill(on ? MafiaColor.ink : Color.black.opacity(0.15))
                    .frame(width: 48, height: 28)
                Circle()
                    .fill(Color.white)
                    .frame(width: 24, height: 24)
                    .shadow(color: .black.opacity(0.18), radius: 2, x: 0, y: 1)
                    .padding(2)
            }
            .opacity(disabled ? 0.5 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.8), value: on)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }
}

// MARK: - FlowChips (wrapping chip row)

/// Wrap-around chip layout. SwiftUI 17 has `Layout` for precise control;
/// for this small finite list a simple wrapping HStack inside a `Layout`
/// approximation works. We use a simple horizontal flow via `WrappedHStack`.
private struct FlowChips<Item: Hashable, ChipContent: View>: View {
    let items: [Item]
    @ViewBuilder let chip: (Item) -> ChipContent

    var body: some View {
        WrappedHStack(spacing: 6) {
            ForEach(items, id: \.self) { item in
                chip(item)
            }
        }
    }
}

/// Minimal wrapping HStack — measures children, breaks rows when needed.
/// Adequate for short label sets like the album chip group; not a general
/// flow layout.
private struct WrappedHStack<Content: View>: View {
    let spacing: CGFloat
    @ViewBuilder let content: () -> Content

    var body: some View {
        // SwiftUI's Layout protocol is the right tool here; using FlowLayout
        // (iOS 17+, available via package platform target).
        FlowLayout(spacing: spacing) { content() }
    }
}

/// Tiny custom `Layout` that wraps subviews into rows. iOS 17+.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var rowWidth: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if rowWidth + size.width > maxWidth, rowWidth > 0 {
                totalHeight += rowHeight + spacing
                rowWidth = 0
                rowHeight = 0
            }
            rowWidth += size.width + (rowWidth > 0 ? spacing : 0)
            rowHeight = max(rowHeight, size.height)
        }
        totalHeight += rowHeight
        return CGSize(width: maxWidth, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            sub.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

// MARK: - Previews

#if DEBUG
struct ScopeManagerSheet_Previews: PreviewProvider {
    static var previews: some View {
        ScopeManagerSheet(
            surface: ScopeManagerSurface(
                id: "gphotos",
                name: "Google Photos",
                initials: "GP",
                color: Color(.displayP3, red: 0.965, green: 0.718, blue: 0.690, opacity: 1),
                lastSync: "5 min ago",
                canModify: true
            ),
            onClose: {},
            onDisconnect: {}
        )
        .previewDisplayName("ScopeManagerSheet")
    }
}
#endif
