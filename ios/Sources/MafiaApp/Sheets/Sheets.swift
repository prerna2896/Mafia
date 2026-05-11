//
//  Sheets.swift — Port of `vault-view/.../mafia/_sheets/Sheets.tsx`.
//
//  Bundles the seven sheet primitives the web prototype uses behind its
//  `<SheetShell>` overlay component:
//
//    • ConfirmSheet            — generic destructive confirmation
//    • PaywallSheet            — DESIGN.md §10 + §12 monetization
//    • CancelSubscriptionSheet — §12 anti-dark-pattern cancel flow
//    • EmailPreviewSheet       — §12 day-before-charge email preview
//    • FeedbackSheet           — §17 help / feedback
//    • WhyVaultedSheet         — §13 rule provenance
//    • ContextMenu helper      — long-press → action menu (per item)
//
//  SwiftUI native sheet semantics: callers present these via
//  `.sheet(isPresented:) { SomeSheet(...) }`. Each sheet picks its own
//  detent in `.presentationDetents([.medium])` or `[.medium, .large]`
//  (iOS 17 / macOS 14 — see Package.swift platforms).
//
//  No backdrop / drag-handle / paper-rounded-top is rendered here —
//  SwiftUI's sheet chrome already matches the prototype's intent.
//
//  See DESIGN.md §4.3 (Sheet system) for the full inventory.
//

import SwiftUI
import MafiaDesignSystem

// MARK: - Shared tone enum

/// Confirm-button tone for `ConfirmSheet`. Mirrors the web `tone?: "clay" | "ink"`.
public enum ConfirmTone {
    case clay   // destructive (default)
    case ink
}

// MARK: - 1. ConfirmSheet

/// Generic destructive confirmation primitive.
///
/// Layout: Fraunces 22pt title + ink-soft 12.5pt body + two-button row.
/// Left = Cancel (ink bg, white text). Right = Confirm (white bg, tone-colored
/// text + tone-colored ring).
public struct ConfirmSheet: View {
    private let title: String
    private let message: String
    private let confirmLabel: String
    private let cancelLabel: String
    private let tone: ConfirmTone
    private let onConfirm: () -> Void
    private let onCancel: () -> Void

    public init(
        title: String,
        body: String,
        confirmLabel: String,
        cancelLabel: String = "Cancel",
        tone: ConfirmTone = .clay,
        onConfirm: @escaping () -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.title = title
        self.message = body
        self.confirmLabel = confirmLabel
        self.cancelLabel = cancelLabel
        self.tone = tone
        self.onConfirm = onConfirm
        self.onCancel = onCancel
    }

    public var body: some View {
        SheetContainer {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(MafiaFont.serif(size: 22))
                    .foregroundStyle(MafiaColor.ink)
                Text(message)
                    .font(MafiaFont.body(size: 12.5))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    InkPill(label: cancelLabel, action: onCancel)
                    RingedPill(label: confirmLabel,
                               tint: tone == .clay ? MafiaColor.clay : MafiaColor.ink,
                               action: {
                                   onConfirm()
                                   onCancel() // matches web: confirm closes too
                               })
                }
                .padding(.top, 12)
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - 2. PaywallSheet

/// DESIGN.md §10 + §12 — paywall with comparison table + plan picker.
public struct PaywallSheet: View {
    public enum Plan { case monthly, yearly }

    private let reason: String?
    private let onStart: () -> Void
    private let onClose: () -> Void
    @State private var plan: Plan = .yearly

    private struct Row { let label: String; let free: String; let plus: String }

    private let rows: [Row] = [
        Row(label: "Vault retention",          free: "30 days",   plus: "Up to 1 year"),
        Row(label: "Surfaces connected",       free: "2",         plus: "Unlimited"),
        Row(label: "Restores per month",       free: "20",        plus: "Unlimited"),
        Row(label: "Deep restore (snapshots)", free: "—",         plus: "✓"),
        Row(label: "Cross-surface coherence",  free: "Read-only", plus: "Resolve duplicates"),
    ]

    public init(
        reason: String? = nil,
        onStart: @escaping () -> Void,
        onClose: @escaping () -> Void
    ) {
        self.reason = reason
        self.onStart = onStart
        self.onClose = onClose
    }

    public var body: some View {
        SheetContainer {
            VStack(alignment: .leading, spacing: 0) {
                if let reason {
                    Text(reason.uppercased())
                        .font(MafiaFont.eyebrow)
                        .tracking(1.4)
                        .foregroundStyle(MafiaColor.amber)
                        .padding(.bottom, 8)
                }
                Text("Mafia Plus extends your Vault.")
                    .font(MafiaFont.serif(size: 24))
                    .foregroundStyle(MafiaColor.ink)

                comparisonTable.padding(.top, 16)

                HStack(spacing: 8) {
                    PlanPill(active: plan == .monthly,
                             title: "Monthly",
                             price: "$4 / mo") { plan = .monthly }
                    PlanPill(active: plan == .yearly,
                             title: "Yearly · 8% off",
                             price: "$36 / yr") { plan = .yearly }
                }
                .padding(.top, 16)

                PillButton("Try free for 7 days", style: .primary) {
                    onStart()
                    onClose()
                }
                .padding(.top, 16)

                Text("Cancel anytime in 2 taps. We'll email you the day of any charge with a 1-tap refund link.")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
            }
        }
        .presentationDetents([.large])
    }

    private var comparisonTable: some View {
        Card(cornerRadius: 16, padding: 0) {
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    Text("").frame(maxWidth: .infinity, alignment: .leading)
                    Text("FREE")
                        .frame(maxWidth: .infinity)
                    Text("PLUS")
                        .frame(maxWidth: .infinity)
                }
                .font(MafiaFont.eyebrow)
                .tracking(1.0)
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(MafiaColor.surface)

                ForEach(Array(rows.enumerated()), id: \.offset) { idx, r in
                    if idx > 0 {
                        Rectangle()
                            .fill(Color.black.opacity(0.04))
                            .frame(height: 1)
                    }
                    HStack(spacing: 0) {
                        Text(r.label)
                            .font(MafiaFont.body(size: 11.5))
                            .foregroundStyle(MafiaColor.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(r.free)
                            .font(MafiaFont.body(size: 11.5))
                            .foregroundStyle(MafiaColor.inkSoft)
                            .frame(maxWidth: .infinity)
                        Text(r.plus)
                            .font(MafiaFont.body(size: 11.5, weight: .medium))
                            .foregroundStyle(MafiaColor.ink)
                            .frame(maxWidth: .infinity)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                }
            }
        }
    }
}

private struct PlanPill: View {
    let active: Bool
    let title: String
    let price: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title.uppercased())
                    .font(MafiaFont.eyebrow)
                    .tracking(1.0)
                    .foregroundStyle(MafiaColor.inkSoft)
                Text(price)
                    .font(MafiaFont.serif(size: 18))
                    .monospacedDigit()
                    .foregroundStyle(MafiaColor.ink)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(active ? MafiaColor.ink : MafiaColor.ring,
                                  lineWidth: active ? 1.5 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - 3. CancelSubscriptionSheet

public struct CancelSubscriptionSheet: View {
    private let onConfirmCancel: () -> Void
    private let onClose: () -> Void

    public init(onConfirmCancel: @escaping () -> Void, onClose: @escaping () -> Void) {
        self.onConfirmCancel = onConfirmCancel
        self.onClose = onClose
    }

    public var body: some View {
        SheetContainer {
            VStack(alignment: .leading, spacing: 8) {
                Text("Cancel Mafia Plus?")
                    .font(MafiaFont.serif(size: 22))
                    .foregroundStyle(MafiaColor.ink)
                Text("Your vault retention drops to 7 days. Items already past 7 days will be marked for purge in 24 hours — we'll email a list first.")
                    .font(MafiaFont.body(size: 12.5))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    // Left: destructive but de-emphasised (white bg, clay text)
                    RingedPill(label: "Cancel subscription",
                               tint: MafiaColor.clay,
                               action: {
                                   onConfirmCancel()
                                   onClose()
                               })
                    // Right: ink-filled "Keep Plus" is the recommended path
                    InkPill(label: "Keep Plus", action: onClose)
                }
                .padding(.top, 12)
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - 4. EmailPreviewSheet

public struct EmailPreviewSheet: View {
    private let onClose: () -> Void

    public init(onClose: @escaping () -> Void) {
        self.onClose = onClose
    }

    public var body: some View {
        SheetContainer {
            VStack(alignment: .leading, spacing: 0) {
                Text("SUBSCRIPTION EMAILS")
                    .font(MafiaFont.eyebrow)
                    .tracking(1.4)
                    .foregroundStyle(MafiaColor.inkSoft)
                Text("What you'll receive the day before any charge.")
                    .font(MafiaFont.serif(size: 20))
                    .foregroundStyle(MafiaColor.ink)
                    .padding(.top, 4)

                emailPreviewCard.padding(.top, 16)

                PillButton("Close", style: .primary, action: onClose)
                    .padding(.top, 20)
            }
        }
        .presentationDetents([.large])
    }

    private var emailPreviewCard: some View {
        Card(cornerRadius: 16, padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 4) {
                    HeaderRow(label: "From",    value: "Mafia <hello@mafia.app>")
                    HeaderRow(label: "Subject", value: "Your Mafia Plus renews tomorrow — $4.00")
                    HeaderRow(label: "Date",    value: "Tomorrow · 9:00 AM")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

                Rectangle()
                    .fill(Color.black.opacity(0.04))
                    .frame(height: 1)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Hi Prerna,")
                        .font(MafiaFont.body(size: 12.5))
                        .foregroundStyle(MafiaColor.ink)
                    Text("Your Mafia Plus subscription renews tomorrow. We'll charge $4.00 to your card ending in 4242.")
                        .font(MafiaFont.body(size: 12.5))
                        .foregroundStyle(MafiaColor.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("If you don't want this charge, one tap below cancels and refunds in full.")
                        .font(MafiaFont.body(size: 12.5))
                        .foregroundStyle(MafiaColor.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)

                    // Faux email CTA — not wired.
                    Text("Refund + cancel")
                        .font(MafiaFont.body(size: 12.5, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(MafiaColor.ink))
                        .padding(.top, 8)

                    Text("Mafia · cross-surface, reversible, quiet.")
                        .font(MafiaFont.body(size: 10.5))
                        .foregroundStyle(MafiaColor.inkSoft)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 20)
            }
        }
    }
}

private struct HeaderRow: View {
    let label: String
    let value: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label.uppercased())
                .font(MafiaFont.eyebrow)
                .tracking(1.0)
                .foregroundStyle(MafiaColor.inkSoft)
                .frame(width: 60, alignment: .leading)
            Text(value)
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.ink)
        }
    }
}

// MARK: - 5. FeedbackSheet

public struct FeedbackSheet: View {
    private let onSend: (String) -> Void
    private let onClose: () -> Void

    @State private var text: String = ""
    @State private var includeState: Bool = true
    @State private var showPayload: Bool = false

    public init(onSend: @escaping (String) -> Void = { _ in }, onClose: @escaping () -> Void) {
        self.onSend = onSend
        self.onClose = onClose
    }

    private var payload: String {
        let message = text.isEmpty ? "<your message>" : text
        var lines: [String] = []
        lines.append("{")
        lines.append("  \"app\": \"Mafia\",")
        lines.append("  \"version\": \"1.0.0 (412)\",")
        lines.append("  \"message\": \"\(message)\",")
        if includeState {
            lines.append("  \"vaultCounts\": {")
            lines.append("    \"total\": 312,")
            lines.append("    \"photos\": 184,")
            lines.append("    \"emails\": 91,")
            lines.append("    \"files\": 37")
            lines.append("  },")
            lines.append("  \"surfacesConnected\": 4,")
        }
        lines.append("  \"anonymousId\": \"u_a3f9e7c2\"")
        lines.append("}")
        return lines.joined(separator: "\n")
    }

    public var body: some View {
        SheetContainer {
            VStack(alignment: .leading, spacing: 0) {
                Text("What's on your mind?")
                    .font(MafiaFont.serif(size: 22))
                    .foregroundStyle(MafiaColor.ink)

                ZStack(alignment: .topLeading) {
                    TextEditor(text: $text)
                        .font(MafiaFont.body(size: 12.5))
                        .foregroundStyle(MafiaColor.ink)
                        .scrollContentBackground(.hidden)
                        .padding(10)
                        .frame(minHeight: 120)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color.white)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .strokeBorder(MafiaColor.ring, lineWidth: 1)
                        )
                        .onChange(of: text) { _, newValue in
                            if newValue.count > 1000 {
                                text = String(newValue.prefix(1000))
                            }
                        }
                    if text.isEmpty {
                        Text("Bug, idea, or just a hello…")
                            .font(MafiaFont.body(size: 12.5))
                            .foregroundStyle(MafiaColor.inkSoft)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 18)
                            .allowsHitTesting(false)
                    }
                }
                .padding(.top, 12)

                Button {
                    includeState.toggle()
                } label: {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: includeState ? "checkmark.square.fill" : "square")
                            .font(.system(size: 16))
                            .foregroundStyle(includeState ? MafiaColor.ink : MafiaColor.inkSoft)
                        Text("Include current vault state (anonymized counts only — no content)")
                            .font(MafiaFont.body(size: 11.5))
                            .foregroundStyle(MafiaColor.inkSoft)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
                .buttonStyle(.plain)
                .padding(.top, 12)

                Button {
                    showPayload.toggle()
                } label: {
                    Text(showPayload ? "Hide what we'd send" : "View what we'd send")
                        .font(MafiaFont.body(size: 11, weight: .medium))
                        .foregroundStyle(MafiaColor.ink)
                        .underline()
                }
                .buttonStyle(.plain)
                .padding(.top, 8)

                if showPayload {
                    ScrollView {
                        Text(payload)
                            .font(.system(size: 10.5, design: .monospaced))
                            .foregroundStyle(MafiaColor.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                    }
                    .frame(maxHeight: 160)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(MafiaColor.surface)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(MafiaColor.ring, lineWidth: 1)
                    )
                    .padding(.top, 8)
                }

                sendButton.padding(.top, 16)

                Text("Can't find an answer? help@mafia.app")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)

                VStack(alignment: .leading, spacing: 6) {
                    docLink("How Vault retention works")
                    docLink("Why Mafia is read-only by default")
                    docLink("Restore something after 30 days")
                }
                .padding(.top, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .presentationDetents([.large])
    }

    private var sendButton: some View {
        let enabled = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return Button {
            guard enabled else { return }
            onSend(text)
            onClose()
        } label: {
            Text("Send")
                .font(MafiaFont.button)
                .foregroundStyle(enabled ? .white : MafiaColor.inkSoft)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(
                    Capsule(style: .continuous)
                        .fill(enabled ? MafiaColor.ink : MafiaColor.surface)
                )
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    private func docLink(_ label: String) -> some View {
        // TODO(sheets): wire actual help URLs when docs site is up.
        Text(label)
            .font(MafiaFont.body(size: 11))
            .foregroundStyle(MafiaColor.inkSoft)
            .underline()
    }
}

// MARK: - 6. WhyVaultedSheet

public struct WhyVaultedSheet: View {
    private let title: String
    private let source: String
    private let onClose: () -> Void

    public init(title: String, source: String, onClose: @escaping () -> Void) {
        self.title = title
        self.source = source
        self.onClose = onClose
    }

    public var body: some View {
        SheetContainer {
            VStack(alignment: .leading, spacing: 0) {
                Text("WHY IT'S HERE")
                    .font(MafiaFont.eyebrow)
                    .tracking(1.4)
                    .foregroundStyle(MafiaColor.inkSoft)
                Text(title)
                    .font(MafiaFont.serif(size: 20))
                    .foregroundStyle(MafiaColor.ink)
                    .padding(.top, 4)
                    .fixedSize(horizontal: false, vertical: true)

                Card(cornerRadius: 16, padding: 0) {
                    VStack(spacing: 0) {
                        WhyRow(label: "Rule applied",
                               value: "Sender pattern · \"weekly newsletter from \(source)\"")
                        Rectangle().fill(Color.black.opacity(0.04)).frame(height: 1)
                        WhyRow(label: "Triggered",
                               value: "2 days ago, after weekly batch")
                        Rectangle().fill(Color.black.opacity(0.04)).frame(height: 1)
                        WhyRow(label: "Reversible until",
                               value: "28 more days")
                    }
                }
                .padding(.top, 16)

                PillButton("Close", style: .primary, action: onClose)
                    .padding(.top, 20)
            }
        }
        .presentationDetents([.medium])
    }
}

private struct WhyRow: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(MafiaFont.eyebrow)
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

// MARK: - 7. Long-press context menu

public enum ContextAction {
    case restore
    case why
    case similar
    case share
    case purge
}

/// Wraps SwiftUI's native `.contextMenu { }` modifier so callers can attach
/// the Mafia item action list with a single call. Native long-press is
/// already the trigger semantics — no custom gesture required.
public extension View {
    func mafiaContextMenu(
        canPurge: Bool,
        onAction: @escaping (ContextAction) -> Void
    ) -> some View {
        self.modifier(MafiaContextMenu(canPurge: canPurge, onAction: onAction))
    }
}

private struct MafiaContextMenu: ViewModifier {
    let canPurge: Bool
    let onAction: (ContextAction) -> Void

    func body(content: Content) -> some View {
        content.contextMenu {
            Button {
                onAction(.restore)
            } label: {
                Label("Restore", systemImage: "arrow.uturn.backward")
            }
            Button {
                onAction(.why)
            } label: {
                Label("Why is this in Vault?", systemImage: "questionmark.circle")
            }
            Button {
                onAction(.similar)
            } label: {
                Label("Find similar", systemImage: "rectangle.stack")
            }
            Button {
                onAction(.share)
            } label: {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            if canPurge {
                // Last item: destructive role renders in system red; the
                // web prototype uses the Mafia clay token. SwiftUI's menu
                // does not allow custom tinting per item, so we accept the
                // platform-native destructive color here.
                // TODO(sheets): explore a custom long-press popover if the
                // clay tint becomes load-bearing.
                Button(role: .destructive) {
                    onAction(.purge)
                } label: {
                    Label("Move out of Vault permanently",
                          systemImage: "trash")
                }
            }
        }
    }
}

// MARK: - Private layout primitives

/// Padded paper-colored container used inside `.sheet { }`. SwiftUI already
/// renders the sheet card / drag handle around us — we just need padding
/// and a wrapping ScrollView so tall content (Paywall, Feedback) doesn't
/// overflow the detent.
private struct SheetContainer<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        ScrollView {
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 24)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }
}

/// Ink-background pill (white text). Two-button row's left/cancel slot.
private struct InkPill: View {
    let label: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(label)
                .font(MafiaFont.body(size: 13, weight: .medium))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Capsule().fill(MafiaColor.ink))
        }
        .buttonStyle(.plain)
    }
}

/// White-background pill with a tinted text+ring (used for ConfirmSheet's
/// destructive slot and CancelSubscriptionSheet's left button).
private struct RingedPill: View {
    let label: String
    let tint: Color
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(label)
                .font(MafiaFont.body(size: 13, weight: .medium))
                .foregroundStyle(tint)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Capsule().fill(Color.white))
                .overlay(
                    Capsule().strokeBorder(tint.opacity(0.3), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Previews
//
// `#Preview` macro requires the PreviewsMacros plugin (Xcode-only). Stick
// with `PreviewProvider` so `swift build` keeps working from the CLI.

#if DEBUG
struct Sheets_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ConfirmSheet(
                title: "Purge 47 items?",
                body: "These have been in your Vault for 30+ days. This is the only step Mafia can't reverse.",
                confirmLabel: "Purge",
                onConfirm: {},
                onCancel: {}
            )
            .previewDisplayName("ConfirmSheet")

            PaywallSheet(reason: "Vault almost full",
                         onStart: {},
                         onClose: {})
                .previewDisplayName("PaywallSheet")

            CancelSubscriptionSheet(onConfirmCancel: {}, onClose: {})
                .previewDisplayName("CancelSubscriptionSheet")

            EmailPreviewSheet(onClose: {})
                .previewDisplayName("EmailPreviewSheet")

            FeedbackSheet(onClose: {})
                .previewDisplayName("FeedbackSheet")

            WhyVaultedSheet(title: "Cleaning Tuesday — week 18",
                            source: "Cleaning Tuesday",
                            onClose: {})
                .previewDisplayName("WhyVaultedSheet")

            // Context-menu helper preview — host on a simple Card.
            Card {
                Text("Long-press me")
                    .font(MafiaFont.body)
                    .padding()
            }
            .mafiaContextMenu(canPurge: true) { _ in }
            .padding()
            .background(MafiaColor.paper)
            .previewDisplayName("ContextMenu host")
        }
    }
}
#endif
