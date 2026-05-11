//
//  ConnectionCeremonyView.swift — Port of
//  `vault-view/.../mafia/_sheets/ConnectionCeremony.tsx`.
//
//  Full-screen overlay (`.fullScreenCover`) for the add-a-surface flow.
//  Four steps; auto-advances from step 3 ("Reading …") to step 4 ("done")
//  after 1.4s, mirroring the prototype.
//
//    0  Intro                 — what this is + Continue
//    1  Permission preview    — "<surface> will ask next" + Open system dialog
//    2  Connecting…           — pulsing dot animation (button disabled)
//    3  Done                  — confirmation copy + Done
//
//  See DESIGN.md §5.1 (Connect), §6.2 (read-only-first), §4.2 (sheet system).
//
//  Lightweight surface descriptor decouples this sheet from
//  `SurfacesView.swift`'s private `Surface` model.
//

import SwiftUI
import MafiaDesignSystem

// MARK: - Surface descriptor

/// Minimal surface descriptor — name + initials + brand tint.
public struct CeremonySurface {
    public let id: String
    public let name: String
    public let initials: String
    public let color: Color

    public init(id: String, name: String, initials: String, color: Color) {
        self.id = id
        self.name = name
        self.initials = initials
        self.color = color
    }
}

// MARK: - ConnectionCeremonyView

public struct ConnectionCeremonyView: View {
    private let surface: CeremonySurface
    private let onClose: () -> Void

    @State private var step: Int = 0
    @State private var pulse: Bool = false

    public init(surface: CeremonySurface, onClose: @escaping () -> Void) {
        self.surface = surface
        self.onClose = onClose
    }

    public var body: some View {
        ZStack {
            MafiaColor.paper.ignoresSafeArea()
            VStack(spacing: 0) {
                topBar
                content
                bottomBar
            }
        }
        .onChange(of: step) { _, newStep in
            // Auto-advance step 2 → 3 after 1.4s.
            if newStep == 2 {
                pulse = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                    if step == 2 {
                        step = 3
                        pulse = false
                    }
                }
            }
        }
    }

    // MARK: top bar

    private var topBar: some View {
        HStack {
            Button {
                if step == 0 { onClose() } else { step = max(0, step - 1) }
            } label: {
                Text(step == 0 ? "Cancel" : "← Back")
                    .font(MafiaFont.body(size: 12.5, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
            }
            .buttonStyle(.plain)

            Spacer()

            Text("\(step + 1) of 4")
                .font(MafiaFont.eyebrow)
                .monospacedDigit()
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(Capsule().fill(MafiaColor.surface))

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

    // MARK: content

    private var content: some View {
        VStack(spacing: 0) {
            Spacer()
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(surface.color.opacity(0.33))
                Text(surface.initials)
                    .font(MafiaFont.body(size: 16, weight: .semibold))
                    .foregroundStyle(MafiaColor.ink)
            }
            .frame(width: 64, height: 64)

            Text(title)
                .font(MafiaFont.serif(size: 24))
                .foregroundStyle(MafiaColor.ink)
                .multilineTextAlignment(.center)
                .padding(.top, 20)
                .fixedSize(horizontal: false, vertical: true)

            stepBody.padding(.top, 12)
            Spacer()
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var title: String {
        switch step {
        case 0: return "Connect \(surface.name)"
        case 1: return "\(surface.name) will ask next"
        case 2: return "Reading \(surface.name)…"
        default: return "Mafia is now reading your \(surface.name)."
        }
    }

    @ViewBuilder
    private var stepBody: some View {
        switch step {
        case 0:
            Text("Mafia treats one item across surfaces as one entity. Adding \(surface.name) extends your unified library.")
                .font(MafiaFont.body(size: 12.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
                .fixedSize(horizontal: false, vertical: true)

        case 1:
            VStack(alignment: .leading, spacing: 8) {
                Text("\(surface.name.uppercased()) PERMISSION")
                    .font(MafiaFont.eyebrow)
                    .tracking(1.4)
                    .foregroundStyle(MafiaColor.inkSoft)
                Text("\"Allow Mafia to access your \(surface.name)?\"")
                    .font(MafiaFont.body(size: 12.5))
                    .foregroundStyle(MafiaColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 4) {
                    bullet("Read-only first. Always.")
                    bullet("You'll choose modify access later, per surface.")
                }
                .padding(.top, 2)
            }
            .frame(maxWidth: 360, alignment: .leading)
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Color.black.opacity(0.06), lineWidth: 1)
            )

        case 2:
            HStack(spacing: 8) {
                Circle()
                    .fill(MafiaColor.amber)
                    .frame(width: 8, height: 8)
                    .scaleEffect(pulse ? 1.4 : 1.0)
                    .opacity(pulse ? 0.4 : 1)
                    .animation(
                        .easeInOut(duration: 0.7).repeatForever(autoreverses: true),
                        value: pulse
                    )
                Text("Connecting…")
                    .font(MafiaFont.body(size: 12.5))
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            .padding(.top, 8)

        default:
            Text("First findings will appear on Home in a few minutes.")
                .font(MafiaFont.body(size: 12.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func bullet(_ text: String) -> some View {
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

    // MARK: bottom bar

    private var bottomBar: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Color.black.opacity(0.04)).frame(height: 1)
            Button {
                if step < 2 { step += 1 }
                else if step == 3 { onClose() }
                // step == 2 is the auto-advance state; button is disabled.
            } label: {
                Text(buttonLabel)
                    .font(MafiaFont.body(size: 13, weight: .medium))
                    .foregroundStyle(step == 2 ? MafiaColor.inkSoft : .white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        Capsule().fill(step == 2 ? MafiaColor.surface : MafiaColor.ink)
                    )
            }
            .buttonStyle(.plain)
            .disabled(step == 2)
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
        }
        .background(Color.white.opacity(0.85))
    }

    private var buttonLabel: String {
        switch step {
        case 0: return "Continue"
        case 1: return "Open system dialog"
        case 2: return "Connecting…"
        default: return "Done"
        }
    }
}

// MARK: - Previews

#if DEBUG
struct ConnectionCeremonyView_Previews: PreviewProvider {
    static var previews: some View {
        ConnectionCeremonyView(
            surface: CeremonySurface(
                id: "dropbox",
                name: "Dropbox",
                initials: "Db",
                color: Color(.displayP3, red: 0.722, green: 0.773, blue: 0.651, opacity: 1)
            ),
            onClose: {}
        )
        .previewDisplayName("ConnectionCeremony")
    }
}
#endif
