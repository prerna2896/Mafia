//
//  SettingsView.swift — Settings tab (port of `vault-view/.../screens/Settings.tsx`).
//
//  DESIGN.md §3.1 + §5 (copy library) + §2 (vibes).
//  Renders title, Vibe toggle, Account, Privacy, Vault retention slider,
//  Subscription, About, and footer. Sub-views (Row, SectionGroup, VibeToggle)
//  are private structs below.
//
//  TODO(sheets): Paywall / cancel / email-preview / feedback bottom sheets
//  from the prototype are not wired yet — chevron rows are tap-no-op for now.
//
import SwiftUI
import MafiaDesignSystem

public struct SettingsView: View {
    @AppStorage("mafia.vibe") private var vibeRaw: String = Vibe.calm.rawValue
    @State private var retentionDays: Double = 30

    public init() {}

    private var currentVibe: Vibe { Vibe(rawValue: vibeRaw) ?? .calm }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header.padding(.top, 8)

                SectionLabel("Vibe").padding(.top, 28).padding(.leading, 4)
                vibeCard.padding(.top, 8)

                SectionLabel("Account").padding(.top, 28).padding(.leading, 4)
                SectionGroup {
                    SettingsRow(title: "Account", subtitle: "prerna@hey.com")
                    Divider().background(MafiaColor.ring)
                    SettingsRow(title: "Surfaces", subtitle: "4 connected · 1 available")
                }
                .padding(.top, 8)

                SectionLabel("Privacy").padding(.top, 28).padding(.leading, 4)
                SectionGroup {
                    SettingsRow(
                        title: "On-device by default",
                        subtitle: "Indexing happens on your phone. Cloud only when needed.",
                        pill: .init(label: "On", tone: .sage))
                    Divider().background(MafiaColor.ring)
                    SettingsRow(
                        title: "Telemetry",
                        subtitle: "Anonymous, opt-in",
                        pill: .init(label: "Off", tone: .muted))
                }
                .padding(.top, 8)

                SectionLabel("Vault retention").padding(.top, 28).padding(.leading, 4)
                retentionCard.padding(.top, 8)

                SectionLabel("Subscription").padding(.top, 28).padding(.leading, 4)
                SectionGroup {
                    SettingsRow(
                        title: "Mafia Plus",
                        subtitle: "$4 / month · renews May 22",
                        pill: .init(label: "Active", tone: .amber))
                    Divider().background(MafiaColor.ring)
                    SettingsRow(
                        title: "Cancel subscription",
                        subtitle: "Top-level. Always one tap away.",
                        titleColor: MafiaColor.clay)
                }
                .padding(.top, 8)

                SectionLabel("About").padding(.top, 28).padding(.leading, 4)
                SectionGroup {
                    SettingsRow(title: "Version", subtitle: "1.0.0 (build 412)")
                    Divider().background(MafiaColor.ring)
                    SettingsRow(title: "What's new")
                    Divider().background(MafiaColor.ring)
                    SettingsRow(title: "Help & feedback")
                }
                .padding(.top, 8)

                Text("Mafia · cross-surface, reversible, quiet.")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 24)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 128)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Settings")
                .font(MafiaFont.serif(size: 34))
                .foregroundStyle(MafiaColor.ink)
            Text("Quiet by design. On-device by default.")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
        }
    }

    // MARK: - Vibe card (amber-soft → white gradient)

    private var vibeCard: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("App vibe")
                    .font(MafiaFont.body(size: 13.5, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
                Text(currentVibe == .playful
                     ? "Soft, warm, a little fun."
                     : "Clean, focused, minimal.")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            Spacer(minLength: 8)
            VibeToggle(vibe: currentVibe) { next in
                withAnimation(.spring(response: 0.30, dampingFraction: 0.85)) {
                    vibeRaw = next.rawValue
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(LinearGradient(
                    colors: [MafiaColor.amberSoft, .white],
                    startPoint: .topLeading, endPoint: .bottomTrailing))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(MafiaColor.ring, lineWidth: 1)
        )
    }

    // MARK: - Vault retention card (white → sage-soft gradient)

    private var retentionCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(Int(retentionDays))")
                        .font(MafiaFont.serif(size: 28))
                        .monospacedDigit()
                        .foregroundStyle(MafiaColor.ink)
                    Text("days")
                        .font(MafiaFont.body(size: 14))
                        .foregroundStyle(MafiaColor.inkSoft)
                }
                Spacer()
                Text("Recoverable window")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            Slider(value: $retentionDays, in: 7...90, step: 1)
                .tint(MafiaColor.amber)
                .padding(.top, 16)
            HStack {
                Text("7"); Spacer(); Text("30"); Spacer(); Text("60"); Spacer(); Text("90")
            }
            .font(MafiaFont.body(size: 10))
            .monospacedDigit()
            .foregroundStyle(MafiaColor.inkSoft)
            .padding(.top, 4)
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(LinearGradient(
                    colors: [.white, MafiaColor.sageSoft],
                    startPoint: .topLeading, endPoint: .bottomTrailing))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(MafiaColor.ring, lineWidth: 1)
        )
    }
}

// MARK: - VibeToggle (pill-shaped two-segment)

private struct VibeToggle: View {
    let vibe: Vibe
    let onChange: (Vibe) -> Void

    var body: some View {
        HStack(spacing: 0) {
            segment(.calm)
            segment(.playful)
        }
        .padding(2)
        .background(
            Capsule(style: .continuous).fill(Color.white)
        )
        .overlay(
            Capsule(style: .continuous).strokeBorder(Color.black.opacity(0.06), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
    }

    private func segment(_ target: Vibe) -> some View {
        let active = vibe == target
        return Button {
            onChange(target)
        } label: {
            Text(target.label)
                .font(MafiaFont.body(size: 11, weight: .medium))
                .foregroundStyle(active ? Color.white : MafiaColor.inkSoft)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    Capsule(style: .continuous)
                        .fill(active ? MafiaColor.ink : Color.clear)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(target.label)
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}

// MARK: - SectionGroup (white card wrapping rows)

private struct SectionGroup<Content: View>: View {
    private let content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View {
        VStack(spacing: 0) { content() }
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(MafiaColor.ring, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

// MARK: - SettingsRow

private struct SettingsRow: View {
    enum PillTone { case amber, sage, muted }
    struct Pill { let label: String; let tone: PillTone }

    let title: String
    let subtitle: String?
    let pill: Pill?
    let titleColor: Color

    init(title: String,
         subtitle: String? = nil,
         pill: Pill? = nil,
         titleColor: Color = MafiaColor.ink)
    {
        self.title = title
        self.subtitle = subtitle
        self.pill = pill
        self.titleColor = titleColor
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(MafiaFont.body(size: 13.5, weight: .medium))
                    .foregroundStyle(titleColor)
                if let subtitle {
                    Text(subtitle)
                        .font(MafiaFont.body(size: 11))
                        .foregroundStyle(MafiaColor.inkSoft)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            HStack(spacing: 8) {
                if let pill {
                    Text(pill.label)
                        .font(MafiaFont.body(size: 10, weight: .medium))
                        .foregroundStyle(pillForeground(pill.tone))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(
                            Capsule(style: .continuous).fill(pillBackground(pill.tone))
                        )
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MafiaColor.inkSoft)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }

    private func pillBackground(_ tone: PillTone) -> Color {
        switch tone {
        case .amber: return MafiaColor.amberSoft
        case .sage:  return MafiaColor.sageSoft
        case .muted: return MafiaColor.surface
        }
    }

    private func pillForeground(_ tone: PillTone) -> Color {
        switch tone {
        case .amber: return MafiaColor.clay
        case .sage:  return MafiaColor.ink
        case .muted: return MafiaColor.inkSoft
        }
    }
}

// `#Preview` macro plugin is Xcode-only; use PreviewProvider so CLI builds.
// Swap to `#Preview { SettingsView() }` once opened in Xcode.
#if DEBUG
struct SettingsView_Previews: PreviewProvider {
    static var previews: some View { SettingsView() }
}
#endif
