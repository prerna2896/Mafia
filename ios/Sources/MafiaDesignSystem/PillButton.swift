//
//  PillButton.swift
//  MafiaDesignSystem
//
//  Fully-rounded pill button used throughout the prototype.
//  DESIGN.md §4.4:
//    primary    — bg-[var(--ink)]    text-white
//    secondary  — bg-[var(--surface)] text-[var(--ink)]
//    accent     — bg-[var(--amber)]   text-[var(--ink)]  (invitation copy)
//
import SwiftUI

public enum PillButtonStyle {
    case primary    // ink background, white text — default CTA
    case secondary  // surface background, ink text
    case accent     // amber background, ink text — invitations / nudges
    case destructive // clay background — Cancel subscription only

    var background: Color {
        switch self {
        case .primary:     return MafiaColor.ink
        case .secondary:   return MafiaColor.surface
        case .accent:      return MafiaColor.amber
        case .destructive: return MafiaColor.clay
        }
    }

    var foreground: Color {
        switch self {
        case .primary, .destructive: return .white
        case .secondary, .accent:    return MafiaColor.ink
        }
    }
}

public struct PillButton: View {
    private let title: String
    private let style: PillButtonStyle
    private let fullWidth: Bool
    private let action: () -> Void

    @Environment(\.vibe) private var vibe

    /// Default `fullWidth: true` matches the onboarding / sign-in CTAs.
    /// Pass `fullWidth: false` for the invitation card's inline pill, which
    /// is sized to its label rather than stretching the row.
    public init(
        _ title: String,
        style: PillButtonStyle = .primary,
        fullWidth: Bool = true,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.style = style
        self.fullWidth = fullWidth
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Text(title)
                .font(MafiaFont.button)
                .foregroundStyle(style.foreground)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .frame(maxWidth: fullWidth ? .infinity : nil)
                .background(
                    Capsule(style: .continuous)
                        .fill(style.background)
                )
        }
        .buttonStyle(PressableStyle(playful: vibe == .playful))
    }
}

/// Press feedback matching DESIGN.md §12.4:
///   `.scaleEffect(0.97)` on press; in playful vibe add `±2°` rotation.
private struct PressableStyle: ButtonStyle {
    let playful: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .rotationEffect(.degrees(playful && configuration.isPressed ? -2 : 0))
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// See note in `Card.swift` about `#Preview` macro availability.
#if DEBUG
struct PillButton_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 12) {
            PillButton("Primary",   style: .primary)   { }
            PillButton("Secondary", style: .secondary) { }
            PillButton("Accent",    style: .accent)    { }
        }
        .padding(24)
        .background(MafiaColor.paper)
    }
}
#endif
