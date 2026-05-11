//
//  PhotoViewerView.swift — Port of `vault-view/.../mafia/PhotoViewer.tsx`.
//
//  Fullscreen photo viewer with pinch-zoom (1×-4×), pan when zoomed,
//  swipe L/R to navigate when not zoomed, swipe-down to dismiss,
//  double-tap toggle 1×↔2×. Top-right 3-dot menu with Restore /
//  Move to Vault permanently / Share. Bottom filmstrip for direct
//  photo selection.
//
//  This is the placeholder-asset version: we don't yet have real
//  thumbnails on iOS, so the "image" is rendered as a deterministic
//  colored rectangle keyed off the photo index. When PhotoKit / the
//  Rust core lands, the `photoNames` array becomes `[PHAsset]` (or
//  similar) and the placeholder Rectangle becomes an `Image` view.
//
//  Gesture notes (where SwiftUI semantics differ from React touch events):
//    • SwiftUI's `MagnificationGesture` reports a multiplicative scale
//      delta from the start of the gesture (not raw finger distance).
//      We multiply against the scale that was live when the gesture began.
//    • Pan + magnification cannot share a single gesture recogniser
//      cleanly, so we use `.simultaneously(with:)` to compose them.
//      When zoomed, the DragGesture pans the image; when not zoomed,
//      the same DragGesture's translation drives swipe-navigation /
//      swipe-down-to-dismiss at gesture end.
//    • Double-tap must be declared *before* single-tap so SwiftUI gives
//      it priority. We declare both as `.onTapGesture` with explicit
//      `count:` values — and `count: 2` is listed first.
//
//  See DESIGN.md §4.2 (PhotoViewer row) for the spec.
//

import SwiftUI
import MafiaDesignSystem

public struct PhotoViewerView: View {
    // MARK: Inputs

    public let photoNames: [String]
    public let startIndex: Int
    public let onClose: () -> Void

    // MARK: State

    @State private var index: Int
    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var menuOpen: Bool = false

    // Gesture baselines — captured at gesture start so deltas compose correctly.
    @GestureState private var pinchDelta: CGFloat = 1.0
    @GestureState private var dragDelta: CGSize = .zero

    // MARK: Init

    public init(photoNames: [String], startIndex: Int = 0, onClose: @escaping () -> Void) {
        self.photoNames = photoNames
        self.startIndex = startIndex
        self.onClose = onClose
        _index = State(initialValue: max(0, min(startIndex, max(0, photoNames.count - 1))))
    }

    // MARK: Derived

    private var photoCount: Int { photoNames.count }
    private var liveScale: CGFloat { min(4, max(1, scale * pinchDelta)) }
    private var isZoomed: Bool { liveScale > 1.01 }

    /// Pan offset clamped to a reasonable rectangle so the image can't be
    /// dragged offscreen. Matches the web prototype's `max = 200 * scale`.
    private func clampedOffset(_ base: CGSize, drag: CGSize) -> CGSize {
        let max = 200 * scale
        let nx = min(max, Swift.max(-max, base.width  + drag.width))
        let ny = min(max, Swift.max(-max, base.height + drag.height))
        return CGSize(width: nx, height: ny)
    }

    // MARK: Body

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            imageStage
            topChrome
            zoomBadge
            sideArrows
            filmstrip
        }
        .foregroundStyle(.white)
        .onChange(of: index) { _, _ in
            // Reset transform when photo changes — matches web `useEffect([i])`.
            withAnimation(.easeOut(duration: 0.15)) {
                scale = 1; offset = .zero
            }
        }
        // Keyboard nav (iOS 17+ — desktop / iPad with hardware keyboard).
        .focusable()
        .onKeyPressArrows(
            onLeft: { goPrev() },
            onRight: { goNext() },
            onEscape: onClose
        )
    }

    // MARK: - Image stage (the zoomable / pannable layer)

    private var imageStage: some View {
        let panOffset = isZoomed ? clampedOffset(offset, drag: dragDelta) : offset

        // Composite pinch + pan into a single simultaneous gesture so a
        // two-finger pinch and a single-finger pan can both originate from
        // the image surface.
        let pinch = MagnificationGesture()
            .updating($pinchDelta) { value, state, _ in
                state = value
            }
            .onEnded { value in
                scale = min(4, Swift.max(1, scale * value))
                if scale <= 1.01 {
                    scale = 1
                    offset = .zero
                }
            }

        let pan = DragGesture(minimumDistance: 4)
            .updating($dragDelta) { value, state, _ in
                state = value.translation
            }
            .onEnded { value in
                if isZoomed {
                    offset = clampedOffset(offset, drag: value.translation)
                } else {
                    handleSwipeEnd(translation: value.translation)
                }
            }

        return placeholderImage(for: index)
            .scaleEffect(liveScale)
            .offset(panOffset)
            .animation(.easeOut(duration: 0.1), value: scale)
            // Order matters: count: 2 declared first so SwiftUI gives it priority.
            .onTapGesture(count: 2) { handleDoubleTap() }
            .onTapGesture(count: 1) {
                // Inert for now — future: toggle chrome visibility.
                // TODO(photo-viewer): hide top/bottom chrome on single tap.
            }
            .gesture(pinch.simultaneously(with: pan))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
            .contentShape(Rectangle())
    }

    /// Deterministic colored rectangle keyed off the photo index.
    /// Replace with a real `Image(...)` view when assets are available.
    @ViewBuilder
    private func placeholderImage(for i: Int) -> some View {
        let hue = photoCount > 0 ? Double(i) / Double(photoCount) : 0
        let color = Color(hue: hue, saturation: 0.4, brightness: 0.7)
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(color)
            .overlay(
                Text(photoNames.indices.contains(i) ? photoNames[i] : "Photo \(i + 1)")
                    .font(MafiaFont.serif(size: 28))
                    .foregroundStyle(.white.opacity(0.85))
            )
            .padding(24)
    }

    // MARK: - Top chrome (close + index pill + 3-dot menu)

    private var topChrome: some View {
        VStack {
            HStack(alignment: .center) {
                closeButton
                Spacer()
                indexPill
                Spacer()
                menuButton
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            Spacer()
        }
        .allowsHitTesting(true)
    }

    private var closeButton: some View {
        Button(action: onClose) {
            Image(systemName: "xmark")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(
                    Circle().fill(.white.opacity(0.10))
                )
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityLabel("Close")
    }

    private var indexPill: some View {
        Text("\(index + 1) of \(photoCount)")
            .font(.system(size: 11, weight: .medium, design: .default))
            .monospacedDigit()
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule().fill(.white.opacity(0.10))
            )
    }

    private var menuButton: some View {
        Menu {
            Button("Restore") { menuOpen = false /* TODO(photo-viewer): emit restore */ }
            Button("Move to Vault permanently") {
                // Web behaviour: this action also closes the viewer.
                onClose()
            }
            Button("Share") { /* TODO(photo-viewer): emit share */ }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 16, weight: .semibold))
                .rotationEffect(.degrees(90))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(
                    Circle().fill(.white.opacity(0.10))
                )
        }
        .menuStyle(.borderlessButton)
        .accessibilityLabel("More")
    }

    // MARK: - Zoom badge (only when scale > 1)

    @ViewBuilder
    private var zoomBadge: some View {
        if isZoomed {
            VStack {
                Spacer().frame(height: 64)
                Text(String(format: "%.1f×", liveScale))
                    .font(.system(size: 10, weight: .medium, design: .default))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(.white.opacity(0.10)))
                Spacer()
            }
        }
    }

    // MARK: - Prev/Next side arrows

    @ViewBuilder
    private var sideArrows: some View {
        if photoCount > 1 {
            HStack {
                ArrowButton(systemName: "chevron.left", action: goPrev)
                    .accessibilityLabel("Previous")
                Spacer()
                ArrowButton(systemName: "chevron.right", action: goNext)
                    .accessibilityLabel("Next")
            }
            .padding(.horizontal, 8)
        }
    }

    // MARK: - Filmstrip

    @ViewBuilder
    private var filmstrip: some View {
        if photoCount > 1 {
            VStack {
                Spacer()
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(Array(photoNames.enumerated()), id: \.offset) { i, _ in
                            FilmstripThumb(
                                index: i,
                                total: photoCount,
                                isCurrent: i == index
                            ) {
                                index = i
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .padding(.bottom, 24)
                .padding(.top, 12)
            }
        }
    }

    // MARK: - Gesture handlers

    private func handleDoubleTap() {
        withAnimation(.spring(response: 0.25, dampingFraction: 0.85)) {
            if scale > 1.01 {
                scale = 1; offset = .zero
            } else {
                scale = 2
            }
        }
    }

    private func handleSwipeEnd(translation: CGSize) {
        let dx = translation.width
        let dy = translation.height
        // Swipe down to dismiss (only when not zoomed — handled by caller via isZoomed branch).
        if abs(dy) > 80 && abs(dy) > abs(dx) {
            if dy > 0 { onClose() }
            return
        }
        if abs(dx) > 60 {
            if dx < 0 { goNext() } else { goPrev() }
        }
    }

    private func goNext() {
        guard photoCount > 0 else { return }
        index = (index + 1) % photoCount
    }

    private func goPrev() {
        guard photoCount > 0 else { return }
        index = (index - 1 + photoCount) % photoCount
    }
}

// MARK: - Filmstrip thumb

private struct FilmstripThumb: View {
    let index: Int
    let total: Int
    let isCurrent: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            let hue = total > 0 ? Double(index) / Double(total) : 0
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color(hue: hue, saturation: 0.4, brightness: 0.7))
                .frame(width: 50, height: 50)
                .opacity(isCurrent ? 1.0 : 0.55)
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(.white, lineWidth: isCurrent ? 2 : 0)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Photo \(index + 1)")
    }
}

// MARK: - Side arrow button

private struct ArrowButton: View {
    let systemName: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(Circle().fill(.white.opacity(0.10)))
        }
        .buttonStyle(PressScaleButtonStyle(pressed: 1.08))
        .opacity(0.5)
    }
}

// MARK: - Button style: press feedback (scale up on press for arrow buttons)

private struct PressScaleButtonStyle: ButtonStyle {
    var pressed: CGFloat = 0.95
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? pressed : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.7),
                       value: configuration.isPressed)
    }
}

// MARK: - Keyboard arrow support (iOS 17+ / macOS 14+)

private extension View {
    /// Hooks ← / → / Escape if `.onKeyPress` is available; otherwise no-op.
    /// We branch with `#available` so older deployment targets still compile.
    @ViewBuilder
    func onKeyPressArrows(
        onLeft: @escaping () -> Void,
        onRight: @escaping () -> Void,
        onEscape: @escaping () -> Void
    ) -> some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            self
                .onKeyPress(.leftArrow) {
                    onLeft(); return .handled
                }
                .onKeyPress(.rightArrow) {
                    onRight(); return .handled
                }
                .onKeyPress(.escape) {
                    onEscape(); return .handled
                }
        } else {
            self
        }
    }
}

// MARK: - Previews

#if DEBUG
struct PhotoViewerView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            PhotoViewerView(
                photoNames: (1...8).map { "IMG_\($0).jpg" },
                startIndex: 0,
                onClose: {}
            )
            .previewDisplayName("PhotoViewer · 8 photos")

            PhotoViewerView(
                photoNames: ["IMG_1.jpg"],
                startIndex: 0,
                onClose: {}
            )
            .previewDisplayName("PhotoViewer · single photo (no arrows/strip)")
        }
    }
}
#endif
