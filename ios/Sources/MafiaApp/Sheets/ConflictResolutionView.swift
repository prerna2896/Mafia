//
//  ConflictResolutionView.swift — Port of
//  `vault-view/.../mafia/_sheets/ConflictResolution.tsx`.
//
//  Full-screen overlay (presented via `.fullScreenCover`) for cross-surface
//  duplicate resolution. Shows N groups of "same photo, multiple homes."
//  Each group: 2–3 thumbnails + per-surface canonical-picker chips + a
//  counter footer. Sticky bottom CTA. Once committed, the view flips to a
//  success state with checkmark + Kept/Vaulted/Lost stats + Back-to-Surfaces
//  CTA.
//
//  See DESIGN.md §4.2 (sheet system), §9 §5.1 (cross-surface coherence),
//  §10 #2 (one photo across surfaces is one entity).
//

import SwiftUI
import MafiaDesignSystem

// MARK: - Models

/// One surface within a duplicate group.
public struct ConflictSurface: Identifiable, Hashable {
    public let id: String
    public let name: String
    /// Brand tint (used as the thumb placeholder bg until real thumbs land).
    public let color: Color

    public init(id: String, name: String, color: Color) {
        self.id = id
        self.name = name
        self.color = color
    }
}

/// One group of cross-surface duplicates the user picks a canonical for.
public struct ConflictGroup: Identifiable {
    public let id: String
    public let surfaces: [ConflictSurface]

    public init(id: String, surfaces: [ConflictSurface]) {
        self.id = id
        self.surfaces = surfaces
    }
}

/// Result of committing the picks — fed into the success state.
private struct AppliedResult: Equatable {
    let canonical: Int
    let vaulted: Int
}

// MARK: - Default mock data

/// Mirror of the three-group mock from the prototype. Promote to
/// `MafiaCore` when the conflict resolver actually drives this.
public let mockConflictGroups: [ConflictGroup] = [
    ConflictGroup(id: "g1", surfaces: [
        ConflictSurface(id: "icloud-g1", name: "iCloud",
                        color: Color(.displayP3, red: 0.659, green: 0.780, blue: 0.980, opacity: 1)),
        ConflictSurface(id: "gphotos-g1", name: "Google Photos",
                        color: Color(.displayP3, red: 0.965, green: 0.718, blue: 0.690, opacity: 1)),
    ]),
    ConflictGroup(id: "g2", surfaces: [
        ConflictSurface(id: "icloud-g2", name: "iCloud",
                        color: Color(.displayP3, red: 0.659, green: 0.780, blue: 0.980, opacity: 1)),
        ConflictSurface(id: "gphotos-g2", name: "Google Photos",
                        color: Color(.displayP3, red: 0.965, green: 0.718, blue: 0.690, opacity: 1)),
        ConflictSurface(id: "drive-g2", name: "Drive",
                        color: Color(.displayP3, red: 1.000, green: 0.878, blue: 0.541, opacity: 1)),
    ]),
    ConflictGroup(id: "g3", surfaces: [
        ConflictSurface(id: "gphotos-g3", name: "Google Photos",
                        color: Color(.displayP3, red: 0.965, green: 0.718, blue: 0.690, opacity: 1)),
        ConflictSurface(id: "drive-g3", name: "Drive",
                        color: Color(.displayP3, red: 1.000, green: 0.878, blue: 0.541, opacity: 1)),
    ]),
]

// MARK: - ConflictResolutionView

public struct ConflictResolutionView: View {
    private let groups: [ConflictGroup]
    private let onClose: () -> Void

    /// Surface name picked as canonical, keyed by group id.
    @State private var picks: [String: String] = [:]
    /// Non-nil once the user commits → flips to success state.
    @State private var applied: AppliedResult? = nil

    public init(
        groups: [ConflictGroup] = mockConflictGroups,
        onClose: @escaping () -> Void
    ) {
        self.groups = groups
        self.onClose = onClose
    }

    public var body: some View {
        ZStack {
            MafiaColor.paper.ignoresSafeArea()
            if let applied {
                successState(applied)
            } else {
                pickerState
            }
        }
    }

    // MARK: picker state

    private var pickerState: some View {
        VStack(spacing: 0) {
            pickerHeader
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Same photo, multiple homes.")
                        .font(MafiaFont.serif(size: 26))
                        .foregroundStyle(MafiaColor.ink)
                    Text("Pick a canonical surface for each group. Others move to Vault.")
                        .font(MafiaFont.body(size: 12))
                        .foregroundStyle(MafiaColor.inkSoft)
                        .padding(.top, 4)
                    VStack(spacing: 16) {
                        ForEach(groups) { g in
                            GroupCard(group: g, picked: picks[g.id]) { picks[g.id] = $0 }
                        }
                    }
                    .padding(.top, 20)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
                .padding(.bottom, 96)
            }
            pickerFooter
        }
    }

    private var pickerHeader: some View {
        HStack {
            Button(action: onClose) {
                Text("← Back")
                    .font(MafiaFont.body(size: 12.5, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
            }
            .buttonStyle(.plain)
            Spacer()
            Text("COHERENCE")
                .font(MafiaFont.eyebrow)
                .tracking(1.4)
                .foregroundStyle(MafiaColor.inkSoft)
            Spacer()
            Text("\(groups.count) groups")
                .font(MafiaFont.body(size: 12))
                .monospacedDigit()
                .foregroundStyle(MafiaColor.inkSoft)
        }
        .padding(.horizontal, 16)
        .padding(.top, 48)
        .padding(.bottom, 12)
        .overlay(
            Rectangle().fill(Color.black.opacity(0.04)).frame(height: 1),
            alignment: .bottom
        )
    }

    private var pickerFooter: some View {
        let allPicked = groups.allSatisfy { picks[$0.id] != nil }
        let totalCanonical = picks.count
        let totalVaulted = groups.reduce(0) { acc, g in
            picks[g.id] != nil ? acc + (g.surfaces.count - 1) : acc
        }
        let remaining = groups.count - totalCanonical
        let label: String = allPicked
            ? "Vault \(totalVaulted) duplicate\(totalVaulted == 1 ? "" : "s")"
            : "Pick canonical for \(remaining) more"

        return VStack(spacing: 0) {
            Rectangle().fill(Color.black.opacity(0.04)).frame(height: 1)
            Button {
                guard allPicked else { return }
                applied = AppliedResult(canonical: totalCanonical, vaulted: totalVaulted)
            } label: {
                Text(label)
                    .font(MafiaFont.body(size: 13, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        Capsule().fill(MafiaColor.ink.opacity(allPicked ? 1 : 0.4))
                    )
            }
            .buttonStyle(.plain)
            .disabled(!allPicked)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(Color.white.opacity(0.85))
    }

    // MARK: success state

    private func successState(_ a: AppliedResult) -> some View {
        VStack(spacing: 0) {
            successHeader
            VStack(spacing: 0) {
                Spacer()
                ZStack {
                    Circle()
                        .fill(MafiaColor.sageSoft)
                        .frame(width: 64, height: 64)
                    Image(systemName: "checkmark")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundStyle(MafiaColor.ink)
                }
                Text("Coherence applied.")
                    .font(MafiaFont.serif(size: 28))
                    .foregroundStyle(MafiaColor.ink)
                    .padding(.top, 20)
                Text(successCopy(a))
                    .font(MafiaFont.body(size: 12.5))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 300)
                    .padding(.top, 8)
                statsPanel(a).padding(.top, 24)
                Button(action: onClose) {
                    Text("Back to Surfaces")
                        .font(MafiaFont.body(size: 12.5, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(Capsule().fill(MafiaColor.ink))
                }
                .buttonStyle(.plain)
                .padding(.top, 32)
                Spacer()
            }
            .padding(.horizontal, 24)
        }
    }

    private var successHeader: some View {
        HStack {
            Spacer().frame(width: 48)
            Spacer()
            Text("COHERENCE")
                .font(MafiaFont.eyebrow)
                .tracking(1.4)
                .foregroundStyle(MafiaColor.inkSoft)
            Spacer()
            Button(action: onClose) {
                Text("Done")
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

    private func successCopy(_ a: AppliedResult) -> String {
        let v1 = "\(a.canonical) canonical \(a.canonical == 1 ? "version" : "versions") kept across surfaces."
        let v2 = "\(a.vaulted) duplicate \(a.vaulted == 1 ? "copy moved" : "copies moved") to Vault — restorable for 30 days."
        return v1 + " " + v2
    }

    private func statsPanel(_ a: AppliedResult) -> some View {
        HStack(spacing: 8) {
            StatCell(n: "\(a.canonical)", label: "Kept", tone: false)
            StatCell(n: "\(a.vaulted)", label: "Vaulted", tone: false)
            StatCell(n: "0", label: "Lost", tone: true)
        }
        .frame(maxWidth: 280)
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
}

// MARK: - GroupCard

private struct GroupCard: View {
    let group: ConflictGroup
    let picked: String?
    let onPick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                ForEach(group.surfaces) { s in
                    ZStack {
                        // TODO(assets): real duplicate thumbnail for `s`
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(s.color.opacity(0.35))
                            .aspectRatio(1, contentMode: .fit)
                        if picked == s.name {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .strokeBorder(MafiaColor.ink, lineWidth: 2)
                        }
                    }
                }
            }
            HStack(spacing: 6) {
                ForEach(group.surfaces) { s in
                    Button { onPick(s.name) } label: {
                        Text("Keep \(s.name)")
                            .font(MafiaFont.body(size: 11, weight: .medium))
                            .foregroundStyle(picked == s.name ? .white : MafiaColor.ink)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                Capsule().fill(picked == s.name ? MafiaColor.ink : Color.white)
                            )
                            .overlay(
                                Capsule().strokeBorder(
                                    picked == s.name ? MafiaColor.ink : Color.black.opacity(0.1),
                                    lineWidth: 1
                                )
                            )
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 0)
            }
            .padding(.top, 12)
            if picked != nil {
                let n = group.surfaces.count - 1
                Text("Other \(n) cop\(n == 1 ? "y" : "ies") will move to Vault on commit.")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .padding(.top, 8)
            }
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
}

// MARK: - StatCell

private struct StatCell: View {
    let n: String
    let label: String
    /// `true` = "Lost" stat — uses a sage-tinted ink. Prototype uses
    /// `color-mix(in oklab, var(--sage) 70%, black)`. We approximate by
    /// blending sage with ink at 70/30.
    let tone: Bool

    var body: some View {
        VStack(spacing: 2) {
            Text(n)
                .font(MafiaFont.serif(size: 20))
                .monospacedDigit()
                .foregroundStyle(tone ? sageInk : MafiaColor.ink)
            Text(label)
                .font(MafiaFont.body(size: 10))
                .foregroundStyle(MafiaColor.inkSoft)
        }
        .frame(maxWidth: .infinity)
    }

    /// 70% sage + 30% ink — matches prototype `color-mix(...)`.
    private var sageInk: Color {
        Color(
            .displayP3,
            red: 0.722 * 0.7 + 0.102 * 0.3,
            green: 0.773 * 0.7 + 0.102 * 0.3,
            blue: 0.651 * 0.7 + 0.102 * 0.3,
            opacity: 1
        )
    }
}

// MARK: - Previews

#if DEBUG
struct ConflictResolutionView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ConflictResolutionView(onClose: {})
                .previewDisplayName("ConflictResolution · picker")
        }
    }
}
#endif
