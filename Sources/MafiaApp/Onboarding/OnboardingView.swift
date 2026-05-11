//
//  OnboardingView.swift
//
//  Stub of the 7-rung onboarding ladder (PRD §5.0, mirrors
//  `vault-view/src/components/mafia/onboarding/Onboarding.tsx`).
//
//  This is a *placeholder* — Next / Back navigation only. Real per-step
//  content (surface pick, OS-permission faux dialog, scan animation, first
//  finding, write-scope grant) will land in subsequent commits.
//
import SwiftUI
import MafiaDesignSystem

private struct Rung: Identifiable {
    let id: Int
    let title: String
    let body: String
}

/// PRD §5.0 — read-only-first ladder. Each rung earns the next.
private let rungs: [Rung] = [
    Rung(id: 1, title: "Take space.\nMake space.",
         body: "Mafia keeps a copy of everything before it touches your inbox or library."),
    Rung(id: 2, title: "Where should we start?",
         body: "Pick one surface. You can connect more later."),
    Rung(id: 3, title: "Mafia will read first.\nNothing moves until you say so.",
         body: "Read-only · no changes possible."),
    Rung(id: 4, title: "Tap Allow above\nto continue.",
         body: "This is what your phone will ask next."),
    Rung(id: 5, title: "Reading your library…",
         body: "We're not deleting or moving anything."),
    Rung(id: 6, title: "First finding",
         body: "18 senders are responsible for 73% of your unread."),
    Rung(id: 7, title: "Let Mafia move things\nto Vault for you?",
         body: "Vault is a 30-day holding area. Nothing leaves your account."),
]

public struct OnboardingView: View {
    @State private var step: Int = 1
    let onDone: () -> Void

    public init(onDone: @escaping () -> Void) {
        self.onDone = onDone
    }

    private var current: Rung { rungs[step - 1] }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // Top bar — Back / step pill / Skip
            HStack {
                Button(action: { if step > 1 { step -= 1 } }) {
                    Text("← Back")
                        .font(MafiaFont.caption)
                        .foregroundStyle(MafiaColor.inkSoft)
                        .opacity(step == 1 ? 0 : 1)
                }
                Spacer()
                Text("\(step) of \(rungs.count)")
                    .font(MafiaFont.caption)
                    .foregroundStyle(MafiaColor.inkSoft)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color.white))
                    .overlay(Capsule().strokeBorder(MafiaColor.ring, lineWidth: 1))
                Spacer()
                Button("Skip", action: onDone)
                    .font(MafiaFont.caption)
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)

            // Progress bar
            ProgressView(value: Double(step), total: Double(rungs.count))
                .progressViewStyle(.linear)
                .tint(MafiaColor.ink)
                .padding(.horizontal, 20)
                .padding(.top, 12)

            // Rung content
            VStack(alignment: .leading, spacing: 12) {
                SectionLabel("Step \(step)")
                Text(current.title)
                    .font(MafiaFont.displayS)
                    .foregroundStyle(MafiaColor.ink)
                Text(current.body)
                    .font(MafiaFont.body)
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)

            Spacer()

            // Next / Done
            VStack(spacing: 8) {
                PillButton(step == rungs.count ? "Allow Vault access" : "Continue") {
                    if step == rungs.count { onDone() } else { step += 1 }
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }
}
