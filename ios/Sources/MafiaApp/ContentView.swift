//
//  ContentView.swift
//
//  Top-level routing: SignIn → Onboarding → Tab shell.
//
//  Matches the gating in `vault-view/src/components/mafia/MafiaApp.tsx`:
//  three localStorage flags (here `@AppStorage`) decide what's shown.
//
import SwiftUI
import MafiaDesignSystem

public struct ContentView: View {
    @AppStorage("mafia.signedIn")  private var signedIn:  Bool = false
    @AppStorage("mafia.onboarded") private var onboarded: Bool = false

    public init() {}

    public var body: some View {
        ZStack {
            MafiaColor.paper.ignoresSafeArea()

            if !signedIn {
                SignInView(onDone: { signedIn = true })
            } else if !onboarded {
                OnboardingView(onDone: { onboarded = true })
            } else {
                MafiaTabShell()
            }
        }
    }
}

// MARK: - Tab shell

private struct MafiaTabShell: View {
    enum Tab: Hashable { case home, surfaces, vault, insights, settings }
    @State private var selected: Tab = .home

    var body: some View {
        TabView(selection: $selected) {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
                .tag(Tab.home)
            SurfacesView()
                .tabItem { Label("Surfaces", systemImage: "square.stack.3d.up") }
                .tag(Tab.surfaces)
            VaultView()
                .tabItem { Label("Vault", systemImage: "archivebox") }
                .tag(Tab.vault)
                .badge("•") // amber dot equivalent — DESIGN.md §3.1 ("star")
            InsightsView()
                .tabItem { Label("Insights", systemImage: "chart.bar") }
                .tag(Tab.insights)
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(Tab.settings)
        }
        .tint(MafiaColor.ink)
    }
}

// MARK: - Stub sign-in screen
//
// Real implementation will mirror `vault-view/src/components/mafia/onboarding/SignIn.tsx`:
// Apple + Google CTAs plus a "Restore from another device" QR + 6-digit OTP.
//
private struct SignInView: View {
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            SectionLabel("Welcome")
            Text("Take space.\nMake space.")
                .font(MafiaFont.displayM)
                .multilineTextAlignment(.center)
                .foregroundStyle(MafiaColor.ink)
            Spacer()
            PillButton("Continue with Apple", style: .primary, action: onDone)
            PillButton("Continue with Google", style: .secondary, action: onDone)
                .padding(.bottom, 40)
        }
        .padding(.horizontal, 24)
    }
}
