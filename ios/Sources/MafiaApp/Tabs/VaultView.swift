//
//  VaultView.swift — Vault tab (port of `vault-view/.../screens/Vault.tsx`).
//
//  Vault is the design centerpiece per DESIGN.md §7. First-class destination
//  with: hero header, purge warning banner, segmented filter (All / Photos /
//  Emails / Files), grouped recoverable items by recency (Today / Yesterday /
//  3 days ago), inline Bundle Review expansion, and the trust footer.
//
//  Mock data is inlined as a Swift array — the prototype's `vaultItems` from
//  `vault-view/src/components/mafia/data.ts`. Image thumbnails are solid
//  `Color` rectangles for now; replace with PhotoKit thumbnails / asset
//  bundle once that wiring lands (PRD §12.1).
//
//  Deviations vs. prototype (intentional, see commit message):
//  - Visual Swipe / Grid view-mode toggle inside Bundle Review is skipped.
//    Only the list-with-checkboxes mode is implemented; the swipe mode needs
//    real gesture work which is out of scope for this port.
//  - Snapshot sheet, SearchVault overlay, and toast feedback are deferred.
//
//  Sheet wiring (see `Sheets/Sheets.swift`):
//    • Long-press row             → mafiaContextMenu (Restore / Why / …)
//    • "Why is this in Vault?"    → WhyVaultedSheet (per-row title + source)
//
import SwiftUI
import MafiaDesignSystem

// MARK: - Model (inlined mock data)

private enum VaultKind: String { case photo, email, file }

private struct VaultItem: Identifiable, Hashable {
    let id: String
    let kind: VaultKind
    let title: String
    let subtitle: String
    let source: String
    let daysLeft: Int
    let group: String
    /// Nil → render kind glyph instead of a thumbnail.
    let thumbColor: Color?
    /// True if this row is a multi-item bundle (Review button enabled).
    let isBundle: Bool
}

/// Mock sub-items shown when a bundle row's Review is expanded. Matches
/// `subItemsFor` in the prototype for `v1` / `v2` / `v5`.
private struct SubItem: Identifiable, Hashable {
    let id: String
    let label: String
    let meta: String
}

private let mockVaultItems: [VaultItem] = [
    // TODO(assets): real burst frame thumbnail
    VaultItem(id: "v1", kind: .photo, title: "Burst — Goa beach",
              subtitle: "10 of 11 from burst", source: "iCloud Photos",
              daysLeft: 28, group: "Today",
              thumbColor: MafiaColor.amberSoft, isBundle: true),
    VaultItem(id: "v2", kind: .email, title: "LinkedIn — 14 weekly digests",
              subtitle: "Bundle of unread newsletters", source: "Gmail",
              daysLeft: 28, group: "Today",
              thumbColor: nil, isBundle: true),
    VaultItem(id: "v3", kind: .file, title: "Boarding pass · IndiGo 6E-235",
              subtitle: "BLR → GOI · Mar 2022", source: "Google Drive",
              daysLeft: 27, group: "Yesterday",
              thumbColor: nil, isBundle: false),
    // TODO(assets): real screenshot thumbnail
    VaultItem(id: "v4", kind: .photo, title: "Screenshot 2023-08-14",
              subtitle: "Receipt scan, indexed", source: "Google Photos",
              daysLeft: 27, group: "Yesterday",
              thumbColor: MafiaColor.sageSoft, isBundle: false),
    VaultItem(id: "v5", kind: .email, title: "DoorDash receipts × 22",
              subtitle: "Older than 1 year", source: "Gmail",
              daysLeft: 25, group: "3 days ago",
              thumbColor: nil, isBundle: true),
    // TODO(assets): real duplicate thumbnail
    VaultItem(id: "v6", kind: .photo, title: "Duplicate · Tokyo 2024",
              subtitle: "Same photo, two surfaces", source: "Google Photos",
              daysLeft: 25, group: "3 days ago",
              thumbColor: MafiaColor.surface, isBundle: false),
    VaultItem(id: "v7", kind: .file, title: "Old export — taxes_2019.zip",
              subtitle: "Untouched 4 yrs", source: "Google Drive",
              daysLeft: 25, group: "3 days ago",
              thumbColor: nil, isBundle: false),
]

/// Bundle sub-items keyed by parent item id. Matches prototype `subItemsFor`.
private let mockSubItems: [String: [SubItem]] = [
    "v1": (2...11).map { SubItem(id: "v1-\($0)",
                                 label: "Frame \($0)",
                                 meta: $0.isMultiple(of: 2) ? "Slightly blurry" : "Sharp") },
    "v2": [
        SubItem(id: "v2-0", label: "Your weekly LinkedIn digest", meta: "Mar 14"),
        SubItem(id: "v2-1", label: "8 people viewed your profile", meta: "Mar 12"),
        SubItem(id: "v2-2", label: "Trending in Product Design", meta: "Mar 10"),
        SubItem(id: "v2-3", label: "5 new jobs match your profile", meta: "Mar 8"),
        SubItem(id: "v2-4", label: "You appeared in 14 searches", meta: "Mar 5"),
    ],
    "v5": [
        SubItem(id: "v5-0", label: "Order from Blue Bottle — $14.20", meta: "Aug 3, 2024"),
        SubItem(id: "v5-1", label: "Order from Sweetgreen — $18.40", meta: "Jul 28, 2024"),
        SubItem(id: "v5-2", label: "Order from Tacombi — $22.10", meta: "Jul 19, 2024"),
        SubItem(id: "v5-3", label: "Order from Joe Coffee — $6.50", meta: "Jul 12, 2024"),
        SubItem(id: "v5-4", label: "Order from Levain — $9.80", meta: "Jul 4, 2024"),
    ],
]

private enum VaultTab: String, CaseIterable, Identifiable {
    case all = "All", photos = "Photos", emails = "Emails", files = "Files"
    var id: String { rawValue }

    func matches(_ kind: VaultKind) -> Bool {
        switch self {
        case .all:    return true
        case .photos: return kind == .photo
        case .emails: return kind == .email
        case .files:  return kind == .file
        }
    }
}

// Preserve the order in which groups first appear in the mock array, so the
// "Today / Yesterday / 3 days ago" order in the prototype is honored.
private func orderedGroups(_ items: [VaultItem]) -> [(String, [VaultItem])] {
    var order: [String] = []
    var bucket: [String: [VaultItem]] = [:]
    for item in items {
        if bucket[item.group] == nil {
            order.append(item.group)
            bucket[item.group] = []
        }
        bucket[item.group]?.append(item)
    }
    return order.map { ($0, bucket[$0] ?? []) }
}

// MARK: - Main view

public struct VaultView: View {
    @State private var tab: VaultTab = .all
    @State private var restored: Set<String> = []
    @State private var reviewingID: String? = nil
    @State private var selectedSubs: Set<String> = []
    /// Non-nil drives the WhyVaultedSheet for the matching row.
    @State private var whyItem: VaultItem? = nil

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header.padding(.top, 8)
                purgeBanner.padding(.top, 20)
                segmented.padding(.top, 20)
                groupedList.padding(.top, 24)
                Text("We never permanently delete without you.")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 32)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 128)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
        .sheet(item: $whyItem) { item in
            WhyVaultedSheet(
                title: item.title,
                source: item.source,
                onClose: { whyItem = nil }
            )
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Vault")
                .font(MafiaFont.serif(size: 34))
                .foregroundStyle(MafiaColor.ink)
            Text("Recoverable for 30 days. Nothing here is gone.")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
        }
    }

    private var purgeBanner: some View {
        // Amber-tinted card: matches the web `color-mix(amber 18%, white)`
        // background with an amber-30% ring.
        HStack(spacing: 12) {
            Text("3d")
                .font(MafiaFont.serif(size: 14))
                .monospacedDigit()
                .foregroundStyle(MafiaColor.ink)
                .frame(width: 40, height: 40)
                .background(Circle().fill(MafiaColor.amber))
            VStack(alignment: .leading, spacing: 2) {
                Text("47 items purging in 3 days")
                    .font(MafiaFont.body(size: 13, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
                Text("Anything you'd like to keep?")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            Spacer(minLength: 8)
            PillButton("Review", style: .primary, fullWidth: false) { /* TODO */ }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(MafiaColor.amberSoft)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(MafiaColor.amber.opacity(0.3), lineWidth: 1)
        )
    }

    private var segmented: some View {
        HStack(spacing: 4) {
            ForEach(VaultTab.allCases) { t in
                let isActive = tab == t
                Button {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.85)) {
                        tab = t
                    }
                } label: {
                    Text(t.rawValue)
                        .font(MafiaFont.body(size: 12, weight: .medium))
                        .foregroundStyle(isActive ? MafiaColor.ink : MafiaColor.inkSoft)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(
                            Capsule(style: .continuous)
                                .fill(isActive ? Color.white : Color.clear)
                                .shadow(color: Color.black.opacity(isActive ? 0.06 : 0),
                                        radius: 3, x: 0, y: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Capsule(style: .continuous).fill(MafiaColor.surface))
    }

    private var filteredGroups: [(String, [VaultItem])] {
        orderedGroups(mockVaultItems.filter { tab.matches($0.kind) })
    }

    private var groupedList: some View {
        VStack(alignment: .leading, spacing: 24) {
            ForEach(filteredGroups, id: \.0) { (group, items) in
                VStack(alignment: .leading, spacing: 8) {
                    Text(group.uppercased())
                        .font(MafiaFont.eyebrow)
                        .tracking(1.4)
                        .foregroundStyle(MafiaColor.inkSoft)
                        .padding(.horizontal, 4)

                    VStack(spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { idx, item in
                            VaultRow(
                                item: item,
                                isLast: idx == items.count - 1,
                                isRestored: restored.contains(item.id),
                                isReviewing: reviewingID == item.id,
                                selectedSubs: selectedSubs,
                                onRestore: { restored.insert(item.id) },
                                onToggleReview: { toggleReview(item.id) },
                                onToggleSub: { toggleSub($0) },
                                onRestoreSelected: { restoreSelected(for: item) }
                            )
                            // canPurge: gating on "past N days" is not wired
                            // yet; keep false for now per design notes.
                            .mafiaContextMenu(canPurge: false) { action in
                                handleContextAction(action, for: item)
                            }
                        }
                    }
                    .background(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(Color.white)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .strokeBorder(MafiaColor.ring, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .shadow(color: Color.black.opacity(0.06), radius: 9, x: 0, y: 2)
                }
            }
        }
    }

    // MARK: - State helpers

    private func toggleReview(_ id: String) {
        if reviewingID == id {
            reviewingID = nil
        } else {
            reviewingID = id
        }
        selectedSubs = []
    }

    private func toggleSub(_ subID: String) {
        if selectedSubs.contains(subID) {
            selectedSubs.remove(subID)
        } else {
            selectedSubs.insert(subID)
        }
    }

    private func restoreSelected(for item: VaultItem) {
        // Mock-only: collapse the review pane and mark the parent restored.
        // TODO(toasts): "Restored N of M to <source>" via a Toast/Snackbar.
        restored.insert(item.id)
        reviewingID = nil
        selectedSubs = []
    }

    /// Dispatches `mafiaContextMenu` actions per row.
    /// Restore is wired to the existing restore flow; `.why` opens the
    /// WhyVaultedSheet. Other actions are TODO(actions) no-ops.
    private func handleContextAction(_ action: ContextAction, for item: VaultItem) {
        switch action {
        case .restore:
            restored.insert(item.id)
        case .why:
            whyItem = item
        case .similar:
            // TODO(actions): present "find similar" surface.
            break
        case .share:
            // TODO(actions): wire iOS share sheet (UIActivityViewController).
            break
        case .purge:
            // TODO(actions): per-day-gated purge confirmation flow.
            break
        }
    }
}

// MARK: - Row

private struct VaultRow: View {
    let item: VaultItem
    let isLast: Bool
    let isRestored: Bool
    let isReviewing: Bool
    let selectedSubs: Set<String>
    let onRestore: () -> Void
    let onToggleReview: () -> Void
    let onToggleSub: (String) -> Void
    let onRestoreSelected: () -> Void

    private var subs: [SubItem] {
        mockSubItems[item.id] ?? []
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                Thumb(item: item)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(MafiaFont.body(size: 13.5, weight: .medium))
                        .foregroundStyle(MafiaColor.ink)
                        .lineLimit(1)
                    Text(item.subtitle)
                        .font(MafiaFont.body(size: 11))
                        .foregroundStyle(MafiaColor.inkSoft)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        Text("FROM \(item.source.uppercased())")
                            .font(MafiaFont.body(size: 9.5, weight: .medium))
                            .tracking(0.8)
                            .foregroundStyle(MafiaColor.inkSoft)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(MafiaColor.surface))
                        Text("· \(item.daysLeft)d left")
                            .font(MafiaFont.body(size: 10))
                            .monospacedDigit()
                            .foregroundStyle(MafiaColor.inkSoft)
                    }
                    .padding(.top, 2)
                }
                Spacer(minLength: 8)
                actionButtons
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)

            if isReviewing && !subs.isEmpty {
                reviewPanel
            }

            if !isLast {
                Rectangle()
                    .fill(MafiaColor.ring)
                    .frame(height: 1)
            }
        }
    }

    @ViewBuilder
    private var actionButtons: some View {
        VStack(alignment: .trailing, spacing: 6) {
            if item.isBundle && !isRestored {
                Button(action: onToggleReview) {
                    Text(isReviewing ? "Close" : "Review")
                        .font(MafiaFont.body(size: 11, weight: .medium))
                        .foregroundStyle(isReviewing ? MafiaColor.ink : MafiaColor.inkSoft)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule().fill(isReviewing ? MafiaColor.surface : Color.white)
                        )
                        .overlay(Capsule().strokeBorder(Color.black.opacity(0.1), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            Button(action: onRestore) {
                Text(isRestored ? "Restored" : (item.isBundle ? "Restore all" : "Restore"))
                    .font(MafiaFont.body(size: 11.5, weight: .medium))
                    .foregroundStyle(isRestored ? MafiaColor.inkSoft : Color.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule().fill(isRestored ? MafiaColor.sageSoft : MafiaColor.ink)
                    )
            }
            .buttonStyle(.plain)
            .disabled(isRestored)
        }
    }

    private var selectedCount: Int {
        subs.filter { selectedSubs.contains($0.id) }.count
    }

    private var allSelected: Bool {
        !subs.isEmpty && subs.allSatisfy { selectedSubs.contains($0.id) }
    }

    private var reviewPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("PICK WHAT TO BRING BACK")
                    .font(MafiaFont.body(size: 10.5, weight: .medium))
                    .tracking(1.4)
                    .foregroundStyle(MafiaColor.inkSoft)
                Spacer()
                Button {
                    if allSelected {
                        subs.forEach { onToggleSub($0.id) }
                    } else {
                        subs.filter { !selectedSubs.contains($0.id) }
                            .forEach { onToggleSub($0.id) }
                    }
                } label: {
                    Text(allSelected ? "Clear" : "Select all")
                        .font(MafiaFont.body(size: 11, weight: .medium))
                        .foregroundStyle(MafiaColor.ink)
                }
                .buttonStyle(.plain)
            }

            // Vertical checkbox list. Visual Swipe / Grid modes from the
            // prototype are deferred — see file-top deviations note.
            VStack(spacing: 0) {
                ForEach(Array(subs.enumerated()), id: \.element.id) { idx, sub in
                    SubRow(
                        sub: sub,
                        isChecked: selectedSubs.contains(sub.id),
                        isLast: idx == subs.count - 1,
                        onTap: { onToggleSub(sub.id) }
                    )
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(MafiaColor.ring, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            HStack {
                Text("\(selectedCount) of \(subs.count) selected")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                Spacer()
                Button(action: onRestoreSelected) {
                    Text("Restore selected")
                        .font(MafiaFont.body(size: 11.5, weight: .medium))
                        .foregroundStyle(selectedCount == 0 ? MafiaColor.inkSoft : MafiaColor.ink)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule().fill(selectedCount == 0
                                           ? MafiaColor.surface
                                           : MafiaColor.amber)
                        )
                }
                .buttonStyle(.plain)
                .disabled(selectedCount == 0)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 4)
        .padding(.bottom, 12)
        .background(MafiaColor.surface.opacity(0.6))
    }
}

// MARK: - Sub-row (review expansion checkbox row)

private struct SubRow: View {
    let sub: SubItem
    let isChecked: Bool
    let isLast: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(isChecked ? MafiaColor.ink : Color.white)
                        .frame(width: 16, height: 16)
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .strokeBorder(isChecked ? MafiaColor.ink : Color.black.opacity(0.2),
                                      lineWidth: 1)
                        .frame(width: 16, height: 16)
                    if isChecked {
                        Image(systemName: "checkmark")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Color.white)
                    }
                }
                Text(sub.label)
                    .font(MafiaFont.body(size: 12.5))
                    .foregroundStyle(MafiaColor.ink)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(sub.meta)
                    .font(MafiaFont.body(size: 10.5))
                    .monospacedDigit()
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .overlay(alignment: .bottom) {
                if !isLast {
                    Rectangle().fill(MafiaColor.ring).frame(height: 1)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Thumb

private struct Thumb: View {
    let item: VaultItem

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(item.thumbColor ?? MafiaColor.surface)
            if item.thumbColor == nil {
                // TODO(assets): replace kind glyphs with real thumbnails.
                Image(systemName: glyph)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(MafiaColor.inkSoft)
            }
        }
        .frame(width: 48, height: 48)
    }

    private var glyph: String {
        switch item.kind {
        case .email: return "envelope"
        case .file:  return "doc"
        case .photo: return "photo"
        }
    }
}

// `#Preview` macro plugin is Xcode-only; use PreviewProvider so CLI builds.
// Swap to `#Preview { VaultView() }` once opened in Xcode.
#if DEBUG
struct VaultView_Previews: PreviewProvider {
    static var previews: some View { VaultView() }
}
#endif
