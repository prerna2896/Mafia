//
//  SettingsView.swift
//
//  Stub for Settings tab — DESIGN.md §3.1.
//  Vibe toggle, account, surfaces summary, privacy, vault retention,
//  subscription, about.
//
import SwiftUI
import MafiaDesignSystem

public struct SettingsView: View {
    @AppStorage("mafia.vibe")      private var vibeRaw: String = Vibe.calm.rawValue
    @AppStorage("mafia.onboarded") private var onboarded: Bool = false
    @AppStorage("mafia.signedIn")  private var signedIn:  Bool = false

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SectionLabel("Tune")
                Text("Settings")
                    .font(MafiaFont.displayL)
                    .foregroundStyle(MafiaColor.ink)
                Text("Quiet by design. On-device by default.")
                    .font(MafiaFont.body)
                    .foregroundStyle(MafiaColor.inkSoft)

                Card {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionLabel("Vibe")
                        Picker("Vibe", selection: $vibeRaw) {
                            Text("Calm").tag(Vibe.calm.rawValue)
                            Text("Playful").tag(Vibe.playful.rawValue)
                        }
                        .pickerStyle(.segmented)
                    }
                }

                Card {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionLabel("Debug")
                        PillButton("Replay onboarding", style: .secondary) {
                            onboarded = false
                            signedIn = false
                        }
                    }
                }

                Text("Mafia · cross-surface, reversible, quiet.")
                    .font(MafiaFont.caption)
                    .foregroundStyle(MafiaColor.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 24)
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 128)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }
}
