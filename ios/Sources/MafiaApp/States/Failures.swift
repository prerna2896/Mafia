//
//  Failures.swift — Failure-state sheets (port of
//  `vault-view/.../mafia/_state/Failures.tsx`).
//
//  Three sheet views, each intended to be presented via `.sheet(...)`:
//    • SnapshotSheetView    — A. Restore failed; show local header snapshot
//                             because the upstream source purged the body.
//    • ReconnectSheetView   — B. Sync failed; offer to reconnect the surface.
//    • ScopeSheetView       — C. Insufficient scope; ask to upgrade to a
//                             write scope, with clear "what this grants /
//                             doesn't" bullets.
//
//  All three follow the same shell: drag handle, eyebrow, Fraunces headline,
//  body content, 1-or-2 button row. They render directly into the sheet's
//  presentation context; no internal overlay/dim layer needed since SwiftUI
//  manages presentation chrome.
//
//  See DESIGN.md §4.3 (Sheet system), §5 (microcopy), UX-expert SF-3.
//
import SwiftUI
import MafiaDesignSystem

// MARK: - Common chrome

/// Tiny grey drag handle at the top of the sheet. SwiftUI's native sheet
/// detents render their own handle on iOS 16+ — this is a fallback that
/// matches the web prototype exactly when previewing in macOS / Catalyst.
private struct SheetDragHandle: View {
    var body: some View {
        Capsule()
            .fill(Color.black.opacity(0.15))
            .frame(width: 40, height: 4)
            .frame(maxWidth: .infinity)
            .padding(.top, 12)
    }
}

private struct SheetEyebrow: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(MafiaFont.body(size: 10, weight: .medium))
            .tracking(1.4)
            .foregroundStyle(MafiaColor.inkSoft)
    }
}

// MARK: - SnapshotSheetView

public struct SnapshotSheetView: View {
    public let title: String
    public let from: String
    public let subject: String
    public let date: String
    public let source: String
    public let onClose: () -> Void

    public init(
        title: String,
        from: String,
        subject: String,
        date: String,
        source: String,
        onClose: @escaping () -> Void
    ) {
        self.title = title
        self.from = from
        self.subject = subject
        self.date = date
        self.source = source
        self.onClose = onClose
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SheetDragHandle()
            SheetEyebrow(text: "Local snapshot")
                .padding(.top, 12)
            Text("Headers only. The body is gone upstream.")
                .font(MafiaFont.serif(size: 20))
                .foregroundStyle(MafiaColor.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
            SnapshotRowsCard(from: from, subject: subject.isEmpty ? title : subject, date: date)
                .padding(.top, 16)
            Text("Mafia stored these headers before \(source) purged the message. We can't reconstruct the body — that data left \(source) earlier.")
                .font(MafiaFont.body(size: 11.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
            PillButton("Close", style: .primary) { onClose() }
                .padding(.top, 20)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MafiaColor.paper.ignoresSafeArea())
    }
}

private struct SnapshotRowsCard: View {
    let from: String
    let subject: String
    let date: String

    var body: some View {
        VStack(spacing: 0) {
            SnapshotRow(label: "From", value: from)
            Divider().background(Color.black.opacity(0.04))
            SnapshotRow(label: "Subject", value: subject)
            Divider().background(Color.black.opacity(0.04))
            SnapshotRow(label: "Date", value: date)
        }
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.black.opacity(0.05), lineWidth: 1)
        )
    }
}

private struct SnapshotRow: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(MafiaFont.body(size: 10, weight: .medium))
                .tracking(1.0)
                .foregroundStyle(MafiaColor.inkSoft)
            Text(value)
                .font(MafiaFont.body(size: 12.5))
                .foregroundStyle(MafiaColor.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - ReconnectSheetView

public struct ReconnectSheetView: View {
    public let surfaceName: String
    public let surfaceColor: Color
    public let surfaceInitials: String
    public let lastSync: String
    public let onReconnect: () -> Void
    public let onClose: () -> Void

    public init(
        surfaceName: String,
        surfaceColor: Color,
        surfaceInitials: String,
        lastSync: String,
        onReconnect: @escaping () -> Void,
        onClose: @escaping () -> Void
    ) {
        self.surfaceName = surfaceName
        self.surfaceColor = surfaceColor
        self.surfaceInitials = surfaceInitials
        self.lastSync = lastSync
        self.onReconnect = onReconnect
        self.onClose = onClose
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SheetDragHandle()
            SheetEyebrow(text: "Connection lost")
                .padding(.top, 12)
            Text("Reconnect \(surfaceName)?")
                .font(MafiaFont.serif(size: 20))
                .foregroundStyle(MafiaColor.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
            surfaceChip
                .padding(.top, 16)
            Text("Your vault items are safe. New scans are paused until \(surfaceName) is reconnected.")
                .font(MafiaFont.body(size: 11.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
            HStack(spacing: 8) {
                PillButton("Not now", style: .secondary) { onClose() }
                PillButton("Reconnect", style: .primary) { onReconnect() }
            }
            .padding(.top, 20)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MafiaColor.paper.ignoresSafeArea())
    }

    private var surfaceChip: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(surfaceColor.opacity(0.33))
                .frame(width: 40, height: 40)
                .overlay(
                    Text(surfaceInitials)
                        .font(MafiaFont.body(size: 12, weight: .semibold))
                        .foregroundStyle(MafiaColor.ink)
                )
            VStack(alignment: .leading, spacing: 2) {
                Text(surfaceName)
                    .font(MafiaFont.body(size: 13, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
                Text("Last synced \(lastSync)")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            Spacer(minLength: 0)
            Circle()
                .fill(MafiaColor.clay)
                .frame(width: 6, height: 6)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.black.opacity(0.05), lineWidth: 1)
        )
    }
}

// MARK: - ScopeSheetView

public struct ScopeSheetView: View {
    public let surface: String
    public let onGrant: () -> Void
    public let onClose: () -> Void

    public init(
        surface: String,
        onGrant: @escaping () -> Void,
        onClose: @escaping () -> Void
    ) {
        self.surface = surface
        self.onGrant = onGrant
        self.onClose = onClose
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SheetDragHandle()
            SheetEyebrow(text: "Permission needed")
                .padding(.top, 12)
            Text("We need one more thing.")
                .font(MafiaFont.serif(size: 22))
                .foregroundStyle(MafiaColor.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
            (Text("To move this item to Vault, Mafia needs permission to modify ")
                .foregroundColor(MafiaColor.inkSoft)
            + Text(surface)
                .foregroundColor(MafiaColor.ink)
                .fontWeight(.medium)
            + Text(". Right now we have read-only.")
                .foregroundColor(MafiaColor.inkSoft))
                .font(MafiaFont.body(size: 12.5))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
            permissionCard
                .padding(.top, 16)
            HStack(spacing: 8) {
                PillButton("Keep read-only", style: .secondary) { onClose() }
                PillButton("Grant access", style: .primary) { onGrant() }
            }
            .padding(.top, 20)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MafiaColor.paper.ignoresSafeArea())
    }

    private var permissionCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("What this grants")
                .font(MafiaFont.body(size: 11, weight: .medium))
                .foregroundStyle(MafiaColor.ink)
            VStack(alignment: .leading, spacing: 4) {
                ScopeBullet(text: "Move items you choose to Vault")
                ScopeBullet(text: "Restore items back when you ask")
            }
            .padding(.top, 6)
            Text("What it doesn't")
                .font(MafiaFont.body(size: 11, weight: .medium))
                .foregroundStyle(MafiaColor.ink)
                .padding(.top, 12)
            VStack(alignment: .leading, spacing: 4) {
                ScopeBullet(text: "No automatic deletion, ever")
                ScopeBullet(text: "No reading or sharing outside Mafia")
            }
            .padding(.top, 6)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.black.opacity(0.05), lineWidth: 1)
        )
    }
}

private struct ScopeBullet: View {
    let text: String
    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            Text("·")
                .font(MafiaFont.body(size: 11.5))
                .foregroundStyle(MafiaColor.inkSoft)
            Text(text)
                .font(MafiaFont.body(size: 11.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Previews

#if DEBUG
struct Failures_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            SnapshotSheetView(
                title: "LinkedIn weekly digest",
                from: "newsletter@linkedin.com",
                subject: "Your weekly summary",
                date: "Mar 14, 2024",
                source: "Gmail",
                onClose: {}
            )
            .previewDisplayName("Snapshot")

            ReconnectSheetView(
                surfaceName: "Dropbox",
                surfaceColor: MafiaColor.sage,
                surfaceInitials: "Db",
                lastSync: "3 days ago",
                onReconnect: {},
                onClose: {}
            )
            .previewDisplayName("Reconnect")

            ScopeSheetView(
                surface: "iCloud Photos",
                onGrant: {},
                onClose: {}
            )
            .previewDisplayName("Scope")
        }
    }
}
#endif
