//
//  OnboardingView.swift
//
//  The 7-rung onboarding ladder (PRD §5.0, UX-expert MF-2). Ported from
//  `vault-view/src/components/mafia/onboarding/Onboarding.tsx`. Each rung
//  earns the next: pick a surface → in-app priming → faux OS permission →
//  scan animation → first finding ("aha") → write-scope grant.
//
//  Persistence: when step 7's Allow is tapped, this view calls the parent
//  `onDone` closure which flips `@AppStorage("mafia.onboarded")` in
//  ContentView. The Skip button in the top bar is also wired to `onDone`.
//
//  Image assets are TODO(assets) placeholders — solid `Color` rectangles
//  in place of the Mafia app icon and surface artwork. PhotoKit / asset
//  catalog wiring is PRD §12.1 follow-up work.
//
import SwiftUI
import MafiaDesignSystem

// MARK: - Surface data (inlined from `vault-view/data.ts`)

/// Mirror of the `Surface` type from the web prototype. Inlined here so
/// the onboarding flow does not depend on a future `MafiaCore` data layer.
struct OnboardingSurface: Identifiable, Equatable {
    let id: String
    let name: String
    let initials: String
    let tint: Color
}

/// The five surfaces the user can pick from on step 2. Ordering matches
/// `surfaces` in `vault-view/src/components/mafia/data.ts`.
private let onboardingSurfaces: [OnboardingSurface] = [
    OnboardingSurface(id: "icloud",  name: "iCloud Photos",
                      initials: "iC",
                      tint: Color(.displayP3, red: 0.659, green: 0.780, blue: 0.980, opacity: 1.0)),  // #A8C7FA
    OnboardingSurface(id: "gphotos", name: "Google Photos",
                      initials: "GP",
                      tint: Color(.displayP3, red: 0.965, green: 0.718, blue: 0.690, opacity: 1.0)),  // #F6B7B0
    OnboardingSurface(id: "gdrive",  name: "Google Drive",
                      initials: "GD",
                      tint: Color(.displayP3, red: 1.000, green: 0.878, blue: 0.541, opacity: 1.0)),  // #FFE08A
    OnboardingSurface(id: "gmail",   name: "Gmail",
                      initials: "Gm",
                      tint: MafiaColor.amber),                                                       // #E89B3C
    OnboardingSurface(id: "dropbox", name: "Dropbox",
                      initials: "Db",
                      tint: MafiaColor.sage),                                                        // #B8C5A6
]

private let surfaceSubtext: [String: String] = [
    "gmail":   "Read your inbox · nothing changes",
    "gphotos": "Read your library · nothing changes",
    "icloud":  "Read your library · nothing changes",
    "gdrive":  "Read your files · nothing changes",
    "dropbox": "Read your files · nothing changes",
]

// MARK: - Sender data (inlined from `vault-view/data.ts` top 5)

private struct OnboardingSender: Identifiable {
    var id: String { name }
    let name: String
    let count: Int
    let color: Color
}

/// Top-5 senders used in the step-6 "first finding" stacked bar + list.
/// Counts + brand colors match `topSenders` in the web prototype.
private let onboardingTopSenders: [OnboardingSender] = [
    OnboardingSender(name: "LinkedIn",            count: 412,
                     color: Color(.displayP3, red: 0.039, green: 0.400, blue: 0.761, opacity: 1.0)), // #0A66C2
    OnboardingSender(name: "Substack",            count: 287,
                     color: Color(.displayP3, red: 1.000, green: 0.404, blue: 0.098, opacity: 1.0)), // #FF6719
    OnboardingSender(name: "DoorDash",            count: 198,
                     color: Color(.displayP3, red: 0.922, green: 0.090, blue: 0.000, opacity: 1.0)), // #EB1700
    OnboardingSender(name: "Airbnb",              count: 156,
                     color: Color(.displayP3, red: 1.000, green: 0.220, blue: 0.361, opacity: 1.0)), // #FF385C
    OnboardingSender(name: "Medium Daily Digest", count: 142,
                     color: MafiaColor.ink),                                                         // #1A1A1A
]

/// Total used for the step-6 percentage label. Computed at file scope so
/// the `Text` view body stays simple.
private let onboardingSenderTotal: Int = onboardingTopSenders.reduce(0) { $0 + $1.count }

// MARK: - OnboardingView

public struct OnboardingView: View {
    private static let totalSteps = 8

    @State private var step: Int = 1
    @State private var pickedSurfaceID: String? = nil
    @State private var grantedRead: Bool = false
    @State private var extraSurfaceIDs: Set<String> = []

    let onDone: () -> Void

    public init(onDone: @escaping () -> Void) {
        self.onDone = onDone
    }

    /// The surface the user picked in step 2, or `nil` until then.
    private var pickedSurface: OnboardingSurface? {
        guard let id = pickedSurfaceID else { return nil }
        return onboardingSurfaces.first(where: { $0.id == id })
    }

    /// Back-nav guard — matches the `canGo` logic in `Onboarding.tsx`. The
    /// user cannot skip ahead past surface-pick or past the faux permission.
    private func canGo(to n: Int) -> Bool {
        switch n {
        case 1, 2:        return true
        case 3, 4:        return pickedSurface != nil
        case 5, 6, 7, 8:  return pickedSurface != nil && grantedRead
        default:          return false
        }
    }

    private func go(to n: Int) {
        if canGo(to: n) { step = n }
    }

    public var body: some View {
        VStack(spacing: 0) {
            topBar
            progressBar
            content
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }

    // MARK: Chrome

    /// Top row: Back (hidden on step 1) · "N of 7" pill · Skip.
    private var topBar: some View {
        HStack {
            Button(action: { go(to: max(1, step - 1)) }) {
                HStack(spacing: 4) {
                    Text("←")
                    Text("Back")
                }
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.horizontal, 8).padding(.vertical, 4)
            }
            .opacity(step == 1 ? 0 : 1)
            .disabled(step == 1)

            Spacer()

            HStack(spacing: 4) {
                Text("\(step)").monospacedDigit()
                Text("of").foregroundStyle(MafiaColor.inkSoft.opacity(0.5))
                Text("\(Self.totalSteps)").monospacedDigit()
            }
            .font(MafiaFont.body(size: 10.5, weight: .medium))
            .foregroundStyle(MafiaColor.inkSoft)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(Capsule().fill(Color.white))
            .overlay(Capsule().strokeBorder(MafiaColor.ring, lineWidth: 1))

            Spacer()

            Button("Skip", action: onDone)
                .font(MafiaFont.body(size: 11))
                .foregroundStyle(MafiaColor.inkSoft)
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }

    /// `(step / total)`-width fill on a 1pt black/5% track.
    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.black.opacity(0.05))
                Capsule().fill(MafiaColor.ink)
                    .frame(width: geo.size.width * CGFloat(step) / CGFloat(Self.totalSteps))
                    .animation(.easeInOut(duration: 0.45), value: step)
            }
        }
        .frame(height: 4)
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    /// Per-step body. `ScrollView` so the priming / write-scope cards never
    /// overflow short devices, but we mostly compose with `Spacer()` for the
    /// bottom-anchored CTAs to match the web layout.
    @ViewBuilder private var content: some View {
        ScrollView {
            Group {
                switch step {
                case 1:
                    StepWelcome(onNext: { go(to: 2) })
                case 2:
                    StepPickSurface(onPick: { id in
                        pickedSurfaceID = id
                        grantedRead = false
                        go(to: 3)
                    })
                case 3:
                    if let surface = pickedSurface {
                        StepPrePrompt(
                            surface: surface,
                            onContinue: { go(to: 4) },
                            onChange:   { go(to: 2) }
                        )
                    }
                case 4:
                    if let surface = pickedSurface {
                        StepOSPermission(surface: surface, onAllow: {
                            grantedRead = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                                go(to: 5)
                            }
                        })
                    }
                case 5:
                    if let surface = pickedSurface {
                        StepScanning(surface: surface, onDone: { go(to: 6) })
                    }
                case 6:
                    if let surface = pickedSurface {
                        StepAha(surface: surface, onAct: { go(to: 7) })
                    }
                case 7:
                    if let surface = pickedSurface {
                        StepWriteScope(surface: surface, onAllow: { go(to: 8) })
                    }
                case 8:
                    if let surface = pickedSurface {
                        StepConnectMore(
                            primaryID: surface.id,
                            selected: extraSurfaceIDs,
                            onToggle: { id in
                                if extraSurfaceIDs.contains(id) {
                                    extraSurfaceIDs.remove(id)
                                } else {
                                    extraSurfaceIDs.insert(id)
                                }
                            },
                            onFinish: onDone
                        )
                    }
                default:
                    EmptyView()
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Step 1: Welcome

/// Centered hero — faux app icon + "Take space. Make space." + Start pill.
private struct StepWelcome: View {
    let onNext: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 40)

            // TODO(assets): swap solid amber circle for real Mafia app icon
            ZStack {
                Circle()
                    .fill(MafiaColor.amberSoft)
                    .frame(width: 96, height: 96)
                    .blur(radius: 18)
                    .opacity(0.6)
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(MafiaColor.amber)
                    .frame(width: 80, height: 80)
                    .overlay(
                        Text("Mafia")
                            .font(MafiaFont.serif(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .strokeBorder(Color.black.opacity(0.06), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.35), radius: 12, x: 0, y: 12)
            }
            .padding(.bottom, 32)

            // Two-line headline with mixed sizes — matches prototype:
            //   small "Takes space" (ink-soft) over large "Creates space" (ink).
            VStack(spacing: 0) {
                Text("Takes space")
                    .font(MafiaFont.serif(size: 20))
                    .foregroundStyle(MafiaColor.inkSoft)
                Text("Creates space")
                    .font(MafiaFont.serif(size: 36))
                    .foregroundStyle(MafiaColor.ink)
            }
            .multilineTextAlignment(.center)

            Text("Mafia keeps a copy of everything before it touches your inbox or library.")
                .font(MafiaFont.body(size: 12.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 260)
                .padding(.top, 16)

            PillButton("Start", style: .primary, fullWidth: false, action: onNext)
                .padding(.top, 40)

            Text("No permission asked yet.")
                .font(MafiaFont.body(size: 10.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 12)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Step 2: Pick a surface

private struct StepPickSurface: View {
    let onPick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Where should we start?")
                .font(MafiaFont.serif(size: 28))
                .foregroundStyle(MafiaColor.ink)
            Text("Pick one surface. You can connect more later.")
                .font(MafiaFont.body(size: 12.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 6)

            VStack(spacing: 10) {
                ForEach(onboardingSurfaces) { surface in
                    Button(action: { onPick(surface.id) }) {
                        SurfaceRow(surface: surface)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 20)
        }
    }
}

/// One row in the surface-picker list. Initials chip + name + read-only
/// subline + trailing "Start" capsule (just visual — the entire row taps).
private struct SurfaceRow: View {
    let surface: OnboardingSurface

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(surface.tint.opacity(0.4))
                .frame(width: 48, height: 48)
                .overlay(
                    Text(surface.initials)
                        .font(MafiaFont.body(size: 13, weight: .semibold))
                        .foregroundStyle(MafiaColor.ink)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(surface.name)
                    .font(MafiaFont.body(size: 14, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
                Text(surfaceSubtext[surface.id] ?? "Read-only access")
                    .font(MafiaFont.body(size: 11.5))
                    .foregroundStyle(MafiaColor.inkSoft)
            }

            Spacer(minLength: 0)

            Text("Start")
                .font(MafiaFont.body(size: 11, weight: .medium))
                .foregroundStyle(MafiaColor.ink)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Capsule().fill(MafiaColor.surface))
        }
        .padding(14)
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

// MARK: - Step 3: Pre-prompt (in-app priming)

private struct StepPrePrompt: View {
    let surface: OnboardingSurface
    let onContinue: () -> Void
    let onChange:   () -> Void

    /// Verb tense matches the web prototype — Gmail says "inbox", everything
    /// else says "library" (including Drive/Dropbox to keep copy tight).
    private var verb: String {
        surface.id == "gmail" ? "read your inbox" : "read your library"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel("Before we ask")
            Text("Mafia will \(verb) first.\nNothing moves anywhere\nuntil you say so.")
                .font(MafiaFont.serif(size: 26))
                .lineSpacing(-2)
                .foregroundStyle(MafiaColor.ink)
                .padding(.top, 8)

            Card(cornerRadius: 20, padding: 16) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(surface.tint.opacity(0.4))
                            .frame(width: 40, height: 40)
                            .overlay(
                                Text(surface.initials)
                                    .font(MafiaFont.body(size: 12, weight: .semibold))
                                    .foregroundStyle(MafiaColor.ink)
                            )
                        VStack(alignment: .leading, spacing: 2) {
                            Text(surface.name)
                                .font(MafiaFont.body(size: 13, weight: .medium))
                                .foregroundStyle(MafiaColor.ink)
                            Text("Read-only · no changes possible")
                                .font(MafiaFont.body(size: 11))
                                .foregroundStyle(MafiaColor.inkSoft)
                        }
                        Spacer(minLength: 0)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        BulletRow(kind: .check, text: "Looks for patterns and noise")
                        BulletRow(kind: .check, text: "Builds your first finding")
                        BulletRow(kind: .cross, text: "Cannot delete or move anything")
                    }
                    .padding(.top, 16)
                }
            }
            .padding(.top, 24)

            VStack(spacing: 8) {
                PillButton("Continue", style: .primary, action: onContinue)
                Button("Pick a different surface", action: onChange)
                    .font(MafiaFont.body(size: 12, weight: .medium))
                    .foregroundStyle(MafiaColor.inkSoft)
            }
            .padding(.top, 32)
        }
    }
}

/// Tiny check/cross glyph + label, used in step 3 + step 7.
private struct BulletRow: View {
    enum Kind { case check, cross }
    let kind: Kind
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            glyph
                .frame(width: 14, height: 14)
                .padding(.top, 2)
            Text(text)
                .font(MafiaFont.body(size: 12.5))
                .foregroundStyle(MafiaColor.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder private var glyph: some View {
        switch kind {
        case .check:
            // Stroked checkmark in sage.
            Path { p in
                p.move(to: CGPoint(x: 2.5, y: 7.5))
                p.addLine(to: CGPoint(x: 5.5, y: 10.5))
                p.addLine(to: CGPoint(x: 11.5, y: 3.5))
            }
            .stroke(MafiaColor.sage,
                    style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
        case .cross:
            // Stroked X in ink-soft.
            Path { p in
                p.move(to: CGPoint(x: 3, y: 3))
                p.addLine(to: CGPoint(x: 11, y: 11))
                p.move(to: CGPoint(x: 11, y: 3))
                p.addLine(to: CGPoint(x: 3, y: 11))
            }
            .stroke(MafiaColor.inkSoft,
                    style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
        }
    }
}

// MARK: - Step 4: Faux OS permission

private struct StepOSPermission: View {
    let surface: OnboardingSurface
    let onAllow: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Tap Allow above\nto continue.")
                .font(MafiaFont.serif(size: 22))
                .foregroundStyle(MafiaColor.ink)
            Text("This is what your phone will ask next.")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 6)

            // Faux iOS alert sheet — #F3F3F3 bg, blue (#007aff) buttons.
            FauxIOSAlert(surface: surface, onAllow: onAllow)
                .padding(.top, 24)
                .frame(maxWidth: .infinity)

            Text("Read-only · \(surface.name)")
                .font(MafiaFont.body(size: 11))
                .foregroundStyle(MafiaColor.inkSoft)
                .frame(maxWidth: .infinity)
                .padding(.top, 24)
        }
    }
}

/// Styled fake iOS alert. Only the "Allow" button is wired — Don't Allow
/// is decorative. Real system dialogs come from PhotoKit / GIDSignIn etc.
/// once the Xcode app target requests them.
private struct FauxIOSAlert: View {
    let surface: OnboardingSurface
    let onAllow: () -> Void

    /// #007AFF — iOS system blue (button tint in standard alerts).
    private let iosBlue = Color(.displayP3, red: 0.0, green: 0.478, blue: 1.0, opacity: 1.0)
    /// #F3F3F3 — iOS alert sheet background tint.
    private let alertBG = Color(.displayP3, red: 0.953, green: 0.953, blue: 0.953, opacity: 0.95)
    /// #1C1C1E — iOS primary alert title color.
    private let alertTitle = Color(.displayP3, red: 0.11, green: 0.11, blue: 0.118, opacity: 1.0)
    /// #3C3C43 @ 80% — iOS body color in alerts.
    private let alertBody = Color(.displayP3, red: 0.235, green: 0.235, blue: 0.263, opacity: 0.8)

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 6) {
                Text("\"Mafia\" Would Like to Access \(surface.name)")
                    .font(MafiaFont.body(size: 14, weight: .semibold))
                    .foregroundStyle(alertTitle)
                    .multilineTextAlignment(.center)
                Text("Mafia uses read-only access to find noise and duplicates. It cannot delete or modify anything.")
                    .font(MafiaFont.body(size: 12))
                    .foregroundStyle(alertBody)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16).padding(.bottom, 12)

            Divider().background(Color.black.opacity(0.12))

            // "Don't Allow" — visual only, no action wired.
            Button(action: {}) {
                Text("Don't Allow")
                    .font(MafiaFont.body(size: 14))
                    .foregroundStyle(iosBlue)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.plain)

            Divider().background(Color.black.opacity(0.12))

            Button(action: onAllow) {
                Text("Allow")
                    .font(MafiaFont.body(size: 14, weight: .semibold))
                    .foregroundStyle(iosBlue)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.plain)
        }
        .frame(width: 270)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(alertBG)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.black.opacity(0.06), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.4), radius: 30, x: 0, y: 20)
    }
}

// MARK: - Step 5: Scanning animation

private struct StepScanning: View {
    let surface: OnboardingSurface
    let onDone: () -> Void

    /// Target count + noun depend on which surface was picked. Gmail
    /// reads emails, Photos surfaces read photos, Drive/Dropbox read files.
    private var target: Int {
        switch surface.id {
        case "gmail":              return 8247
        case "gphotos", "icloud":  return 12480
        default:                   return 3120
        }
    }
    private var noun: String {
        switch surface.id {
        case "gmail":              return "emails"
        case "gdrive", "dropbox":  return "files"
        default:                   return "photos"
        }
    }

    @State private var count: Int = 0
    @State private var startTime: Date = .now

    /// Phase index 0..3 based on count progress — drives the dot indicator.
    private var phase: Int {
        let target = Double(target)
        let c = Double(count)
        if c < target * 0.33 { return 0 }
        if c < target * 0.66 { return 1 }
        if c < target        { return 2 }
        return 3
    }

    private let phaseLabels = ["Connecting", "Reading", "Finding patterns", "Ready"]

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 40)

            // Surface chip with soft glow.
            ZStack {
                Circle()
                    .fill(surface.tint)
                    .frame(width: 64, height: 64)
                    .blur(radius: 14)
                    .opacity(0.3)
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(surface.tint.opacity(0.53))
                    .frame(width: 64, height: 64)
                    .overlay(
                        Text(surface.initials)
                            .font(MafiaFont.body(size: 14, weight: .semibold))
                            .foregroundStyle(MafiaColor.ink)
                    )
            }
            .padding(.bottom, 32)

            TimelineView(.animation(minimumInterval: 1.0 / 60.0)) { context in
                Text("Reading \(formattedCount(at: context.date)) \(noun)…")
                    .font(MafiaFont.serif(size: 32))
                    .monospacedDigit()
                    .foregroundStyle(MafiaColor.ink)
                    .multilineTextAlignment(.center)
            }

            Text("We're not deleting or moving anything.")
                .font(MafiaFont.body(size: 12.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 12)

            HStack(spacing: 12) {
                ForEach(phaseLabels.indices, id: \.self) { i in
                    HStack(spacing: 8) {
                        Circle()
                            .fill(dotColor(for: i))
                            .frame(width: 8, height: 8)
                        Text(phaseLabels[i])
                            .font(MafiaFont.body(size: 10.5,
                                                 weight: i == phase ? .medium : .regular))
                            .foregroundStyle(i == phase ? MafiaColor.ink : MafiaColor.inkSoft)
                    }
                }
            }
            .padding(.top, 40)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .onAppear { startTime = .now }
    }

    /// Render the count for the given frame timestamp, easing in over
    /// ~2.2s, then auto-advance after a short pause.
    private func formattedCount(at date: Date) -> String {
        let elapsed = date.timeIntervalSince(startTime)
        let duration: TimeInterval = 2.2
        let p = min(1.0, elapsed / duration)
        let eased = 1.0 - pow(1.0 - p, 2)
        let next = Int((eased * Double(target)).rounded(.down))

        if next != count {
            DispatchQueue.main.async { self.count = next }
        }

        if p >= 1.0 {
            // Fire onDone once, ~0.4s after reaching the target.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                self.fireDoneOnce()
            }
        }
        return next.formatted(.number)
    }

    @State private var doneCalled = false
    private func fireDoneOnce() {
        guard !doneCalled else { return }
        doneCalled = true
        onDone()
    }

    private func dotColor(for i: Int) -> Color {
        if i < phase { return MafiaColor.sage }
        if i == phase { return MafiaColor.ink }
        return Color.black.opacity(0.15)
    }
}

// MARK: - Step 6: Aha (first finding)

private struct StepAha: View {
    let surface: OnboardingSurface
    let onAct: () -> Void

    private var isGmail: Bool { surface.id == "gmail" }

    /// `false` until the user taps "Show me first"; once true the sender
    /// list reveals per-row skip toggles and the CTA flips to "Vault N
    /// chunks · M items".
    @State private var showPreview: Bool = false

    /// Set of sender names the user has chosen to exclude from the queue.
    /// Skipped rows fade to 40% opacity and don't count toward the total.
    @State private var skipped: Set<String> = []

    /// Senders not in `skipped` — drives the queued-count CTA copy.
    private var queued: [OnboardingSender] {
        onboardingTopSenders.filter { !skipped.contains($0.name) }
    }

    private var queuedTotal: Int {
        queued.reduce(0) { $0 + $1.count }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel("First finding")

            // Headline — amber inline for the key number.
            (
                Text(isGmail ? "18 senders are responsible for " : "")
                + Text(isGmail ? "73%" : "2,140")
                    .foregroundColor(MafiaColor.amber)
                + Text(isGmail
                       ? " of your unread."
                       : " near-duplicates take up most of your library.")
            )
            .font(MafiaFont.serif(size: 26))
            .lineSpacing(-2)
            .foregroundStyle(MafiaColor.ink)
            .padding(.top, 8)

            Text(isGmail
                 ? "\(onboardingSenderTotal.formatted(.number)) unread emails analyzed across \(surface.name)."
                 : "Looked through \(surface.name) for repeats, bursts, and screenshots.")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 8)

            stackedBar
                .padding(.top, 20)

            senderList
                .padding(.top, 16)

            if showPreview {
                Text("Vaulting in \(queued.count) chunks · \(queuedTotal.formatted(.number)) items queued · recoverable 30 days")
                    .font(MafiaFont.body(size: 10.5))
                    .monospacedDigit()
                    .foregroundStyle(MafiaColor.inkSoft)
                    .padding(.top, 8)
            }

            ctas
                .padding(.top, 20)
        }
    }

    @ViewBuilder private var ctas: some View {
        if !showPreview {
            VStack(spacing: 8) {
                Button(action: onAct) {
                    HStack(spacing: 6) {
                        Text("Continue")
                        Text("· nothing vaulted yet").opacity(0.6)
                    }
                    .font(MafiaFont.button)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(MafiaColor.ink))
                }
                .buttonStyle(.plain)

                Button(action: { showPreview = true }) {
                    Text("Show me first")
                        .font(MafiaFont.button)
                        .foregroundStyle(MafiaColor.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Capsule().fill(Color.white))
                        .overlay(Capsule().strokeBorder(MafiaColor.ring, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        } else {
            VStack(spacing: 8) {
                Button(action: onAct) {
                    HStack(spacing: 6) {
                        Text("Vault \(queued.count) chunk\(queued.count == 1 ? "" : "s")")
                        Text("· \(queuedTotal.formatted(.number)) items").opacity(0.6)
                    }
                    .font(MafiaFont.button)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(MafiaColor.ink.opacity(queued.isEmpty ? 0.4 : 1.0)))
                }
                .buttonStyle(.plain)
                .disabled(queued.isEmpty)

                Button(action: onAct) {
                    Text("Skip — just keep the stats")
                        .font(MafiaFont.body(size: 12))
                        .foregroundStyle(MafiaColor.inkSoft)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// 12pt-tall stacked horizontal bar — width per sender = count / total.
    private var stackedBar: some View {
        HStack(spacing: 0) {
            ForEach(onboardingTopSenders) { s in
                Rectangle()
                    .fill(s.color)
                    .frame(maxWidth: .infinity)
                    .layoutPriority(Double(s.count))
            }
        }
        .frame(height: 12)
        .clipShape(Capsule())
    }

    private var senderList: some View {
        VStack(spacing: 0) {
            ForEach(Array(onboardingTopSenders.enumerated()), id: \.element.id) { idx, s in
                let isSkipped = skipped.contains(s.name)
                HStack(spacing: 12) {
                    Circle()
                        .fill(s.color)
                        .frame(width: 32, height: 32)
                        .overlay(
                            Text(String(s.name.prefix(1)))
                                .font(MafiaFont.body(size: 10.5, weight: .semibold))
                                .foregroundStyle(.white)
                        )
                    VStack(alignment: .leading, spacing: 1) {
                        Text(s.name)
                            .font(MafiaFont.body(size: 12.5, weight: .medium))
                            .foregroundStyle(MafiaColor.ink)
                            .lineLimit(1)
                        Text("\(s.count) unread · \(percent(of: s))%")
                            .font(MafiaFont.body(size: 10.5))
                            .monospacedDigit()
                            .foregroundStyle(MafiaColor.inkSoft)
                    }
                    Spacer(minLength: 0)

                    if showPreview {
                        Button(action: {
                            if isSkipped {
                                skipped.remove(s.name)
                            } else {
                                skipped.insert(s.name)
                            }
                        }) {
                            Text(isSkipped ? "Include" : "Skip")
                                .font(MafiaFont.body(size: 10.5, weight: .medium))
                                .foregroundStyle(MafiaColor.ink)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(Capsule().fill(MafiaColor.surface))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .opacity(isSkipped ? 0.4 : 1.0)
                if idx != onboardingTopSenders.count - 1 {
                    Divider().background(Color.black.opacity(0.04))
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(MafiaColor.ring, lineWidth: 1)
        )
    }

    private func percent(of s: OnboardingSender) -> Int {
        Int((Double(s.count) / Double(onboardingSenderTotal) * 100.0).rounded())
    }
}

// MARK: - Step 7: Write scope grant

private struct StepWriteScope: View {
    let surface: OnboardingSurface
    let onAllow: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel("One last thing")

            Text("Let Mafia move things\nto Vault for you?")
                .font(MafiaFont.serif(size: 26))
                .lineSpacing(-2)
                .foregroundStyle(MafiaColor.ink)
                .padding(.top, 8)

            Text("Vault is a 30-day holding area. Nothing leaves your account.")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 8)

            Card(cornerRadius: 20, padding: 16) {
                VStack(alignment: .leading, spacing: 0) {
                    eyebrow("This grants", color: MafiaColor.sage)
                    VStack(alignment: .leading, spacing: 8) {
                        BulletRow(kind: .check, text: "Move items into Vault")
                        BulletRow(kind: .check, text: "Restore them back to \(surface.name)")
                        BulletRow(kind: .check, text: "Permanently remove after 30 days")
                    }
                    .padding(.top, 8)

                    eyebrow("This does NOT", color: MafiaColor.inkSoft)
                        .padding(.top, 16)
                    VStack(alignment: .leading, spacing: 8) {
                        BulletRow(kind: .cross, text: "Send anything outside your account")
                        BulletRow(kind: .cross, text: "Modify originals")
                        BulletRow(kind: .cross, text: "Share data with anyone")
                    }
                    .padding(.top, 8)
                }
            }
            .padding(.top, 20)

            VStack(spacing: 8) {
                PillButton("Allow Vault access", style: .primary, action: onAllow)
                Button("Not now", action: onAllow)
                    .font(MafiaFont.body(size: 12))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .padding(.top, 4)
            }
            .padding(.top, 24)
        }
    }

    /// Tiny uppercase tracked label without the amber dot — used inside the
    /// step-7 card where SectionLabel's leading dot would be too loud.
    private func eyebrow(_ text: String, color: Color) -> some View {
        Text(text.uppercased())
            .font(MafiaFont.body(size: 10.5, weight: .medium))
            .tracking(1.4)
            .foregroundStyle(color)
    }
}

// MARK: - Step 8: Connect more surfaces

/// Optional cross-surface dedup invitation. Lists the four surfaces the
/// user did NOT pick in step 2, each as a multi-select toggle card. The
/// primary CTA always finishes — selections are advisory and skipping
/// is fine.
private struct StepConnectMore: View {
    let primaryID: String
    let selected: Set<String>
    let onToggle: (String) -> Void
    let onFinish: () -> Void

    /// Other surfaces (the four the user did not pick in step 2).
    private var remaining: [OnboardingSurface] {
        onboardingSurfaces.filter { $0.id != primaryID }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel("Almost done")

            Text("Connect more surfaces?")
                .font(MafiaFont.serif(size: 26))
                .lineSpacing(-2)
                .foregroundStyle(MafiaColor.ink)
                .padding(.top, 8)

            Text("Mafia treats one item across surfaces as one entity. Connect more for cross-surface dedup.")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 8)

            VStack(spacing: 8) {
                ForEach(remaining) { surface in
                    Button(action: { onToggle(surface.id) }) {
                        ConnectMoreRow(
                            surface: surface,
                            selected: selected.contains(surface.id)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 20)

            VStack(spacing: 8) {
                Button(action: onFinish) {
                    Text(selected.isEmpty
                         ? "Finish setup"
                         : "Connect \(selected.count) more · Finish")
                        .font(MafiaFont.button)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Capsule().fill(MafiaColor.ink))
                }
                .buttonStyle(.plain)

                Button("Add later", action: onFinish)
                    .font(MafiaFont.body(size: 12))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .padding(.top, 4)
            }
            .padding(.top, 24)
        }
    }
}

/// One toggle card in the step-8 list. Ring darkens to `ink` when on,
/// trailing circle flips from neutral surface to filled `ink` with a
/// checkmark.
private struct ConnectMoreRow: View {
    let surface: OnboardingSurface
    let selected: Bool

    var body: some View {
        HStack(spacing: 12) {
            // TODO(assets): swap the solid color chip for the real surface icon.
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(surface.tint.opacity(0.4))
                .frame(width: 40, height: 40)
                .overlay(
                    Text(surface.initials)
                        .font(MafiaFont.body(size: 12, weight: .semibold))
                        .foregroundStyle(MafiaColor.ink)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(surface.name)
                    .font(MafiaFont.body(size: 13, weight: .medium))
                    .foregroundStyle(MafiaColor.ink)
                Text(surfaceSubtext[surface.id] ?? "Read-only access")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
            }

            Spacer(minLength: 0)

            ZStack {
                Circle()
                    .fill(selected ? MafiaColor.ink : MafiaColor.surface)
                    .frame(width: 20, height: 20)
                if selected {
                    Path { p in
                        p.move(to: CGPoint(x: 5.5, y: 10.5))
                        p.addLine(to: CGPoint(x: 8.5, y: 13.5))
                        p.addLine(to: CGPoint(x: 14.5, y: 6.5))
                    }
                    .stroke(Color.white,
                            style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                    .frame(width: 20, height: 20)
                } else {
                    Image(systemName: "plus")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(MafiaColor.inkSoft)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(selected ? MafiaColor.ink : MafiaColor.ring,
                              lineWidth: selected ? 1.5 : 1)
        )
    }
}

// MARK: - Preview

#if DEBUG
struct OnboardingView_Previews: PreviewProvider {
    static var previews: some View {
        OnboardingView(onDone: {})
            .background(MafiaColor.paper)
    }
}
#endif
