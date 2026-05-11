//
//  SearchVaultView.swift — Port of
//  `vault-view/.../mafia/_sheets/SearchVault.tsx`.
//
//  Full-screen overlay (`.fullScreenCover`). Pinned search bar at top
//  (auto-focused), recent-searches chip row when query is empty, results
//  list when non-empty, and a "Nothing matched 'X'." empty result.
//
//  Each result row has an inline `Restore` button. The caller decides what
//  "restore" means; we just call back with the item.
//
//  See DESIGN.md §5.2 (Discover · SearchVault adds cross-surface lookup),
//  §5.4 (Vault), §4.2 (sheet system).
//

import SwiftUI
import MafiaDesignSystem

// MARK: - Models

public enum SearchVaultKind: String, CaseIterable {
    case photo, email, file
    var glyph: String {
        switch self {
        case .photo: return "🖼"
        case .email: return "✉"
        case .file:  return "📄"
        }
    }
}

/// Minimal vault item shape — keeps this sheet independent of the
/// `VaultItem` model that's currently private inside
/// `Tabs/VaultView.swift`. Caller maps its own item type into this when
/// presenting.
public struct SearchVaultItem: Identifiable, Hashable {
    public let id: String
    public let kind: SearchVaultKind
    public let title: String
    public let subtitle: String
    public let source: String
    public let daysLeft: Int

    public init(
        id: String,
        kind: SearchVaultKind,
        title: String,
        subtitle: String,
        source: String,
        daysLeft: Int
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.subtitle = subtitle
        self.source = source
        self.daysLeft = daysLeft
    }
}

/// Recent searches — matches the prototype constant.
private let recents = ["boarding pass", "doordash", "linkedin", "tokyo 2024"]

/// Default mock corpus, used when no items are supplied. Tracks the shape
/// of `vaultItems` in `vault-view/.../data.ts`.
public let mockSearchVaultItems: [SearchVaultItem] = [
    SearchVaultItem(id: "v1", kind: .photo, title: "Burst — Goa beach",
                    subtitle: "10 of 11 from burst", source: "iCloud Photos", daysLeft: 28),
    SearchVaultItem(id: "v2", kind: .email, title: "LinkedIn — 14 weekly digests",
                    subtitle: "Bundle of unread newsletters", source: "Gmail", daysLeft: 28),
    SearchVaultItem(id: "v3", kind: .file, title: "Boarding pass · IndiGo 6E-235",
                    subtitle: "BLR → GOI · Mar 2022", source: "Google Drive", daysLeft: 27),
    SearchVaultItem(id: "v4", kind: .photo, title: "Screenshot 2023-08-14",
                    subtitle: "Receipt scan, indexed", source: "Google Photos", daysLeft: 27),
    SearchVaultItem(id: "v5", kind: .email, title: "DoorDash receipts × 22",
                    subtitle: "Older than 1 year", source: "Gmail", daysLeft: 25),
    SearchVaultItem(id: "v6", kind: .photo, title: "Duplicate · Tokyo 2024",
                    subtitle: "Same photo, two surfaces", source: "Google Photos", daysLeft: 25),
    SearchVaultItem(id: "v7", kind: .file, title: "Old export — taxes_2019.zip",
                    subtitle: "Untouched 4 yrs", source: "Google Drive", daysLeft: 25),
]

// MARK: - SearchVaultView

public struct SearchVaultView: View {
    private let items: [SearchVaultItem]
    private let onClose: () -> Void
    private let onRestore: (SearchVaultItem) -> Void

    @State private var query: String = ""
    @FocusState private var searchFocused: Bool

    public init(
        items: [SearchVaultItem] = mockSearchVaultItems,
        onClose: @escaping () -> Void,
        onRestore: @escaping (SearchVaultItem) -> Void = { _ in }
    ) {
        self.items = items
        self.onClose = onClose
        self.onRestore = onRestore
    }

    private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var results: [SearchVaultItem] {
        let t = trimmed.lowercased()
        guard !t.isEmpty else { return [] }
        return items.filter { item in
            [item.title, item.subtitle, item.source, item.kind.rawValue]
                .contains { $0.lowercased().contains(t) }
        }
    }

    public var body: some View {
        ZStack {
            MafiaColor.paper.ignoresSafeArea()
            VStack(spacing: 0) {
                searchBar
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if trimmed.isEmpty {
                            emptyQueryState
                        } else if results.isEmpty {
                            noResultsState
                        } else {
                            resultsList
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                }
            }
        }
        .onAppear { searchFocused = true }
    }

    // MARK: search bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MafiaColor.inkSoft)
                TextField("Find anything you've vaulted", text: $query)
                    .font(MafiaFont.body(size: 13))
                    .foregroundStyle(MafiaColor.ink)
                    .textFieldStyle(.plain)
                    .focused($searchFocused)
                    .autocorrectionDisabled()
                if !query.isEmpty {
                    Button { query = "" } label: {
                        Text("Clear")
                            .font(MafiaFont.body(size: 12))
                            .foregroundStyle(MafiaColor.inkSoft)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(Color.white)
            )
            .overlay(
                Capsule().strokeBorder(Color.black.opacity(0.06), lineWidth: 1)
            )

            Button(action: onClose) {
                Text("Cancel")
                    .font(MafiaFont.body(size: 12.5, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 48)
        .padding(.bottom, 12)
        .overlay(
            Rectangle().fill(Color.black.opacity(0.04)).frame(height: 1),
            alignment: .bottom
        )
    }

    // MARK: empty query

    private var emptyQueryState: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("RECENT")
                .font(MafiaFont.eyebrow)
                .tracking(1.4)
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.horizontal, 4)
            RecentsFlow(items: recents) { r in
                query = r
            }
            .padding(.top, 8)
            Text("Search across email subjects, senders, photo metadata, filenames, and types.")
                .font(MafiaFont.body(size: 11.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 24)
                .padding(.horizontal, 4)
        }
    }

    // MARK: no results

    private var noResultsState: some View {
        VStack(spacing: 0) {
            Spacer().frame(height: 48)
            Text("Nothing matched \"\(trimmed)\".")
                .font(MafiaFont.serif(size: 22))
                .foregroundStyle(MafiaColor.ink)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
            Text("Maybe it's still in your inbox? Try searching there too.")
                .font(MafiaFont.body(size: 12.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
                .padding(.horizontal, 24)
        }
    }

    // MARK: results

    private var resultsList: some View {
        VStack(spacing: 0) {
            ForEach(Array(results.enumerated()), id: \.element.id) { idx, item in
                ResultRow(item: item) { onRestore(item) }
                if idx != results.count - 1 {
                    Rectangle().fill(Color.black.opacity(0.04)).frame(height: 1)
                }
            }
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

// MARK: - ResultRow

private struct ResultRow: View {
    let item: SearchVaultItem
    let onRestore: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(MafiaColor.surface)
                Text(item.kind.glyph)
                    .font(.system(size: 12))
            }
            .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(MafiaFont.body(size: 12.5, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(item.source.uppercased())
                        .font(MafiaFont.body(size: 9.5, weight: .medium))
                        .tracking(0.8)
                        .foregroundStyle(MafiaColor.inkSoft)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(MafiaColor.surface))
                    Text("· \(item.daysLeft)d left")
                        .font(MafiaFont.body(size: 10))
                        .monospacedDigit()
                        .foregroundStyle(MafiaColor.inkSoft)
                }
            }

            Spacer(minLength: 0)

            Button(action: onRestore) {
                Text("Restore")
                    .font(MafiaFont.body(size: 11.5, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(MafiaColor.ink))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }
}

// MARK: - RecentsFlow

/// Wrap-around chip flow for the recent search list. Custom `Layout`
/// (iOS 17+) — local copy because keeping this file standalone is part
/// of the brief.
private struct RecentsFlow: View {
    let items: [String]
    let onTap: (String) -> Void

    var body: some View {
        ChipFlowLayout(spacing: 6) {
            ForEach(items, id: \.self) { r in
                Button { onTap(r) } label: {
                    Text(r)
                        .font(MafiaFont.body(size: 11.5, weight: .medium))
                        .foregroundStyle(MafiaColor.ink)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(Color.white))
                        .overlay(
                            Capsule().strokeBorder(Color.black.opacity(0.06), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Small wrapping `Layout` — copied locally to keep this file self-contained
/// per the brief (one new file per sheet).
private struct ChipFlowLayout: Layout {
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
struct SearchVaultView_Previews: PreviewProvider {
    static var previews: some View {
        SearchVaultView(onClose: {}, onRestore: { _ in })
            .previewDisplayName("SearchVault")
    }
}
#endif
