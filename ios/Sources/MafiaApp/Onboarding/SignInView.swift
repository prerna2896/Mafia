//
//  SignInView.swift
//
//  Account sign-in + restore-from-device. Ported from
//  `vault-view/src/components/mafia/onboarding/SignIn.tsx` and mapped to
//  PRD §10 (Account / sign-in).
//
//  Two modes:
//    .signIn  — default. Apple + Google CTAs, plus a text link to .restore.
//    .restore — faux QR illustration + 6-digit OTP entry; Restore device CTA
//               is disabled until all six digits are filled.
//
//  All "happy path" CTAs (Apple / Google / Restore-device-when-filled)
//  invoke the parent `onDone` closure which flips
//  `@AppStorage("mafia.signedIn")` in ContentView. No real auth wiring yet —
//  Sign in with Apple, GIDSignIn, and the device-pairing handshake will be
//  added once the Xcode app target exists.
//
//  Image assets are TODO(assets) placeholders — solid `Color` shapes
//  stand in for the Mafia app icon and Google brand glyph.
//
import SwiftUI
import MafiaDesignSystem

struct SignInView: View {
    enum Mode { case signIn, restore }

    @State private var mode: Mode = .signIn

    let onDone: () -> Void

    init(onDone: @escaping () -> Void) {
        self.onDone = onDone
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            switch mode {
            case .signIn:
                SignInScreen(
                    onDone: onDone,
                    onRestore: { withAnimation { mode = .restore } }
                )
            case .restore:
                RestoreScreen(onDone: onDone)
            }
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }

    /// Top bar — Back (only in restore mode) on the left, mode-name pill on
    /// the right. Mirrors the prototype's minimal chrome.
    private var topBar: some View {
        HStack {
            if mode == .restore {
                Button(action: { withAnimation { mode = .signIn } }) {
                    HStack(spacing: 4) {
                        Text("←")
                        Text("Back")
                    }
                    .font(MafiaFont.body(size: 12))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                }
            } else {
                Spacer().frame(width: 1)
            }
            Spacer()
            Text(mode == .signIn ? "Sign in" : "Restore")
                .font(MafiaFont.body(size: 10.5, weight: .medium))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(Capsule().fill(Color.white))
                .overlay(Capsule().strokeBorder(MafiaColor.ring, lineWidth: 1))
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }
}

// MARK: - Sign-in screen

private struct SignInScreen: View {
    let onDone: () -> Void
    let onRestore: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            // Hero — faux icon, brand name, subtitle.
            VStack(spacing: 0) {
                // TODO(assets): swap solid amber circle for real Mafia app icon
                ZStack {
                    Circle()
                        .fill(MafiaColor.amberSoft)
                        .frame(width: 100, height: 100)
                        .blur(radius: 14)
                        .opacity(0.5)
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(MafiaColor.amber)
                        .frame(width: 80, height: 80)
                        .overlay(
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .strokeBorder(Color.black.opacity(0.06), lineWidth: 1)
                        )
                        .shadow(color: Color.black.opacity(0.18), radius: 8, x: 0, y: 4)
                }

                Text("Mafia")
                    .font(MafiaFont.serif(size: 44))
                    .foregroundStyle(MafiaColor.ink)
                    .padding(.top, 20)

                Text("Sign in to keep your vault in sync across devices.")
                    .font(MafiaFont.body(size: 12.5))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 280)
                    .padding(.top, 12)
            }

            Spacer(minLength: 24)

            // CTAs — Apple (primary ink), Google (secondary white).
            VStack(spacing: 10) {
                Button(action: onDone) {
                    HStack(spacing: 8) {
                        Image(systemName: "applelogo")
                            .font(.system(size: 14, weight: .regular))
                        Text("Continue with Apple")
                            .font(MafiaFont.body(size: 13.5, weight: .medium))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Capsule().fill(MafiaColor.ink))
                }
                .buttonStyle(.plain)

                Button(action: onDone) {
                    HStack(spacing: 8) {
                        GoogleGlyph()
                            .frame(width: 14, height: 14)
                        Text("Continue with Google")
                            .font(MafiaFont.body(size: 13.5, weight: .medium))
                    }
                    .foregroundStyle(MafiaColor.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Capsule().fill(Color.white))
                    .overlay(Capsule().strokeBorder(Color.black.opacity(0.08), lineWidth: 1))
                }
                .buttonStyle(.plain)

                Text("We use these to identify you across devices. We don't read your email or photos through them — those need separate, explicit permission per surface.")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8).padding(.top, 8)

                Button(action: onRestore) {
                    Text("Already have an account? Restore from another device.")
                        .font(MafiaFont.body(size: 11.5))
                        .foregroundStyle(MafiaColor.inkSoft)
                        .underline()
                }
                .buttonStyle(.plain)
                .padding(.top, 16)
            }
            .padding(.bottom, 32)
        }
        .padding(.horizontal, 28)
    }
}

// MARK: - Restore screen

private struct RestoreScreen: View {
    let onDone: () -> Void

    /// One char per digit field. Always length 6.
    @State private var digits: [String] = Array(repeating: "", count: 6)

    /// True only when every slot has a digit. Drives the CTA enabled state.
    private var filled: Bool { digits.allSatisfy { !$0.isEmpty } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Restore from another device")
                    .font(MafiaFont.serif(size: 28))
                    .foregroundStyle(MafiaColor.ink)
                    .padding(.top, 12)

                Text("Open Mafia on your other device → Settings → Devices → Add this one.")
                    .font(MafiaFont.body(size: 12.5))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .padding(.top, 8)

                Card(cornerRadius: 20, padding: 20) {
                    VStack(spacing: 12) {
                        FauxQR()
                            .frame(width: 180, height: 180)
                        Text("Scan this code from your other device.")
                            .font(MafiaFont.body(size: 11))
                            .foregroundStyle(MafiaColor.inkSoft)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.top, 20)

                VStack(spacing: 12) {
                    Text("OR ENTER THE 6-DIGIT CODE")
                        .font(MafiaFont.body(size: 11, weight: .medium))
                        .tracking(1.4)
                        .foregroundStyle(MafiaColor.inkSoft)
                    OTPField(digits: $digits)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 20)

                // CTA is disabled until all six digits are present. The
                // disabled state uses the surface (muted) palette to make
                // the visual gradient extremely clear, per the web prototype.
                Button(action: { if filled { onDone() } }) {
                    Text("Restore device")
                        .font(MafiaFont.body(size: 13.5, weight: .medium))
                        .foregroundStyle(filled ? Color.white : MafiaColor.inkSoft)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Capsule().fill(filled ? MafiaColor.ink : MafiaColor.surface))
                }
                .buttonStyle(.plain)
                .disabled(!filled)
                .padding(.top, 24)
                .padding(.bottom, 32)
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
        }
    }
}

// MARK: - OTP field (6 single-digit inputs)

/// Six single-digit text fields that auto-advance focus on input and walk
/// backwards on backspace. SwiftUI doesn't expose UITextField's
/// `deleteBackward`, so we synthesize that by listening for a length
/// change from empty→empty after a paste/clear (i.e. on iOS the keyboard
/// backspace fires a value-change to "" — we hop focus on that).
private struct OTPField: View {
    @Binding var digits: [String]
    @FocusState private var focused: Int?

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<6, id: \.self) { i in
                TextField("", text: bindingFor(i))
                    .font(MafiaFont.serif(size: 22))
                    .monospacedDigit()
                    .foregroundStyle(MafiaColor.ink)
                    .multilineTextAlignment(.center)
                    #if os(iOS)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    #endif
                    .focused($focused, equals: i)
                    .frame(width: 40, height: 48)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.white)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(focused == i ? MafiaColor.ink : Color.black.opacity(0.08),
                                          lineWidth: focused == i ? 2 : 1)
                    )
            }
        }
        .onAppear { focused = 0 }
    }

    /// Per-slot binding that:
    ///   • strips non-digits
    ///   • keeps only the last typed char (so "12" overwrites to "2")
    ///   • auto-advances focus when a digit is entered
    ///   • walks back to the previous slot when the slot is cleared
    private func bindingFor(_ i: Int) -> Binding<String> {
        Binding(
            get: { digits[i] },
            set: { newValue in
                let cleaned = newValue.filter { $0.isNumber }
                let truncated = String(cleaned.suffix(1))
                let wasEmpty = digits[i].isEmpty
                digits[i] = truncated

                if !truncated.isEmpty {
                    // Forward focus on each digit entered.
                    if i < 5 {
                        focused = i + 1
                    } else {
                        focused = nil
                    }
                } else if wasEmpty == false {
                    // Slot just got cleared — step back.
                    if i > 0 { focused = i - 1 }
                }
            }
        )
    }
}

// MARK: - Faux QR

/// 25×25 pseudo-random QR illustration. Cells deterministic from index so
/// each render is stable; corner finder patterns drawn manually so the
/// illustration reads as a QR code rather than salt-and-pepper.
private struct FauxQR: View {
    private let size: Int = 25

    var body: some View {
        GeometryReader { geo in
            let cellSize = floor(geo.size.width / CGFloat(size))
            let totalSide = cellSize * CGFloat(size)
            VStack(spacing: 1) {
                ForEach(0..<size, id: \.self) { y in
                    HStack(spacing: 1) {
                        ForEach(0..<size, id: \.self) { x in
                            Rectangle()
                                .fill(isOn(x: x, y: y) ? MafiaColor.ink : Color.clear)
                                .frame(width: cellSize - 1, height: cellSize - 1)
                        }
                    }
                }
            }
            .frame(width: totalSide, height: totalSide)
            .frame(maxWidth: .infinity)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    /// Whether the cell at (x, y) is filled. Logic mirrors `FauxQR` in
    /// `SignIn.tsx`: three 7×7 finder patterns (top-left, top-right,
    /// bottom-left) plus deterministic noise everywhere else.
    private func isOn(x: Int, y: Int) -> Bool {
        let inTL = x < 7 && y < 7
        let inTR = x > 17 && y < 7
        let inBL = x < 7 && y > 17

        if inTL || inTR || inBL {
            // Finder pattern: outer ring + filled inner 3×3 core.
            let onEdgeTL = inTL && (x == 0 || x == 6 || y == 0 || y == 6)
            let onEdgeTR = inTR && (x == 18 || x == 24 || y == 0 || y == 6)
            let onEdgeBL = inBL && (x == 0 || x == 6 || y == 18 || y == 24)
            let innerTL = (x > 1 && x < 5 && y > 1 && y < 5)
            let innerTR = (x > 19 && x < 23 && y > 1 && y < 5)
            let innerBL = (x > 1 && x < 5 && y > 19 && y < 23)
            return onEdgeTL || onEdgeTR || onEdgeBL || innerTL || innerTR || innerBL
        }
        // Deterministic noise, ~40% density. Matches the JS expression
        // `((x*31 + y*17 + (x^y)*7) % 5) < 2`.
        let hash = (x * 31 + y * 17 + (x ^ y) * 7) % 5
        return hash < 2
    }
}

// MARK: - Google "G" glyph (simplified)

/// Simplified Google "G" rendered as a colored disc with the letter "G".
/// We don't ship the official multi-color logo here — replace once the
/// brand-asset bundle is wired in. TODO(assets).
private struct GoogleGlyph: View {
    var body: some View {
        ZStack {
            Circle()
                .fill(Color.white)
            Text("G")
                .font(.system(size: 11, weight: .bold, design: .default))
                .foregroundStyle(
                    LinearGradient(
                        colors: [
                            Color(.displayP3, red: 0.259, green: 0.522, blue: 0.957, opacity: 1.0), // #4285F4 blue
                            Color(.displayP3, red: 0.204, green: 0.659, blue: 0.325, opacity: 1.0), // #34A853 green
                            Color(.displayP3, red: 0.984, green: 0.737, blue: 0.020, opacity: 1.0), // #FBBC05 yellow
                            Color(.displayP3, red: 0.918, green: 0.263, blue: 0.208, opacity: 1.0), // #EA4335 red
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        }
        .overlay(
            Circle().strokeBorder(Color.black.opacity(0.06), lineWidth: 0.5)
        )
    }
}

// MARK: - Preview

#if DEBUG
struct SignInView_Previews: PreviewProvider {
    static var previews: some View {
        SignInView(onDone: {})
            .background(MafiaColor.paper)
    }
}
#endif
