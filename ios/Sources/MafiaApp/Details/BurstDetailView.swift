//
//  BurstDetailView.swift — drilled-into Burst screen (port of
//  `vault-view/src/components/mafia/screens/BurstDetail.tsx`).
//
//  Reached from Home → "Open burst" Discovery card (DESIGN.md §3.2).
//  Side-by-side: a single sage-ringed keeper + the other 10 frames slated
//  for the Vault. Sage-soft "we learn" insight panel + secondary "Keep all"
//  / primary "Move 10 to Vault" action row, with the trust footer.
//
//  Image placeholders are solid `Color` rectangles tagged `TODO(assets):`;
//  the real photos come from PhotoKit once that wiring lands (PRD §12.1).
//
//  Deviations vs. prototype (intentional):
//  - No `PhotoViewer` modal — the prototype's fullscreen viewer is not
//    needed for this static placeholder pass; it ports later alongside the
//    pinch/swipe gesture work.
//  - No `sonner` toast on Vault — the parent (`ContentView`) handles
//    routing back via `onBack` and the toast subsystem isn't wired yet.
//
import SwiftUI
import MafiaDesignSystem

public struct BurstDetailView: View {
    private let onBack: () -> Void

    /// Drives the fullscreen PhotoViewer when the keeper image is tapped.
    /// The viewer surfaces all 11 burst frames; the keeper is index 0.
    @State private var viewerOpen: Bool = false

    /// Placeholder identifiers for the 11 burst frames. `PhotoViewerView`'s
    /// placeholder logic hashes these for a deterministic colored tile, so
    /// the strings only matter as stable keys.
    /// TODO(assets): swap for real `PHAsset` identifiers (PRD §12.1).
    private static let burstPhotoNames: [String] =
        (1...11).map { "burst-\($0)" }

    public init(onBack: @escaping () -> Void) {
        self.onBack = onBack
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                backButton
                header.padding(.top, 8)
                grid.padding(.top, 20)
                learningPanel.padding(.top, 28)
                actionRow.padding(.top, 24)
                Text("We never permanently delete without you.")
                    .font(MafiaFont.body(size: 11))
                    .foregroundStyle(MafiaColor.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 12)
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
            .padding(.bottom, 128)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
        // `.fullScreenCover` is iOS-only; macOS falls back to `.sheet`.
        #if os(iOS)
        .fullScreenCover(isPresented: $viewerOpen) {
            PhotoViewerView(
                photoNames: Self.burstPhotoNames,
                startIndex: 0,
                onClose: { viewerOpen = false }
            )
        }
        #else
        .sheet(isPresented: $viewerOpen) {
            PhotoViewerView(
                photoNames: Self.burstPhotoNames,
                startIndex: 0,
                onClose: { viewerOpen = false }
            )
        }
        #endif
    }

    // MARK: - Sub-views

    private var backButton: some View {
        Button(action: onBack) {
            Text("← Back")
                .font(MafiaFont.body(size: 12))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
        .padding(.leading, -8)
        .accessibilityLabel("Back")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionLabel("Burst · 11 photos")
            Text("We picked this one — sharpest, eyes open.")
                .font(MafiaFont.serif(size: 28))
                .foregroundStyle(MafiaColor.ink)
                .lineSpacing(-2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
        }
    }

    private var grid: some View {
        HStack(alignment: .top, spacing: 12) {
            keeperColumn
            vaultColumn
        }
    }

    private var keeperColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("KEEPER")
                .font(MafiaFont.body(size: 10.5, weight: .medium))
                .tracking(1.0)
                // Approximation of the prototype's
                // `color-mix(in oklab, var(--sage) 60%, black)`.
                .foregroundStyle(MafiaColor.ink.opacity(0.75))
            // TODO(assets): replace solid Color with real keeper photo.
            Button(action: { viewerOpen = true }) {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(MafiaColor.amberSoft)
                    .aspectRatio(3.0 / 4.0, contentMode: .fit)
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .strokeBorder(MafiaColor.sage, lineWidth: 2)
                    )
                    .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open keeper photo")
            .accessibilityAddTraits(.isImage)
            .padding(.top, 6)
            HStack(spacing: 6) {
                Text("· 4032×3024")
                Text("· 3.2 MB")
            }
            .font(MafiaFont.body(size: 10.5))
            .foregroundStyle(MafiaColor.inkSoft)
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var vaultColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("VAULT OTHER 10")
                .font(MafiaFont.body(size: 10.5, weight: .medium))
                .tracking(1.0)
                .foregroundStyle(MafiaColor.amber)
            // 2-col grid of 10 small square placeholders at 50% opacity.
            // TODO(assets): swap solid Color tiles for real burst thumbs.
            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 4),
                    GridItem(.flexible(), spacing: 4)
                ],
                spacing: 4
            ) {
                ForEach(0..<10, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(MafiaColor.surface)
                        .aspectRatio(1, contentMode: .fit)
                        .opacity(0.5)
                }
            }
            .padding(.top, 6)
            Text("Frees ~28 MB · recoverable 30 days")
                .font(MafiaFont.body(size: 10.5))
                .foregroundStyle(MafiaColor.inkSoft)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var learningPanel: some View {
        Text("We compared sharpness, eye-openness, and exposure across all 11 frames. You usually keep the sharpest. Let us know if we got it wrong — we learn.")
            .font(MafiaFont.body(size: 12))
            .foregroundStyle(MafiaColor.ink)
            .fixedSize(horizontal: false, vertical: true)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(MafiaColor.sageSoft)
            )
    }

    private var actionRow: some View {
        // Layout matches the web: secondary (1x) + primary (1.5x) flex.
        HStack(spacing: 8) {
            PillButton("Keep all", style: .secondary, fullWidth: true, action: onBack)
                .layoutPriority(1)
            PillButton("Move 10 to Vault", style: .accent, fullWidth: true, action: onBack)
                .layoutPriority(1.5)
        }
    }
}

// `#Preview` macro plugin is Xcode-only; use PreviewProvider so CLI builds.
// Swap to `#Preview { BurstDetailView(onBack: {}) }` once opened in Xcode.
#if DEBUG
struct BurstDetailView_Previews: PreviewProvider {
    static var previews: some View {
        BurstDetailView(onBack: {})
    }
}
#endif
