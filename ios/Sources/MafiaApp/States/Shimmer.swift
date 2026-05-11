//
//  Shimmer.swift — skeleton-loading primitive (port of
//  `vault-view/.../mafia/_state/Shimmer.tsx`).
//
//  Two pieces:
//    • `Shimmer` — a SwiftUI `ViewModifier` that overlays a sliding gradient
//      on any view. The gradient phase animates linearly forever, matching
//      the web prototype's `mafia-shimmer` keyframes.
//    • `ShimmerCard` — a convenience rounded rectangle with the modifier
//      already applied. Use it for card-shaped placeholders.
//
//  Light dependency footprint on purpose — no Combine, no timers, just an
//  `@State` phase driven by `withAnimation(...repeatForever)` on appear.
//
import SwiftUI
import MafiaDesignSystem

/// Overlays a sliding light-gradient on its content to suggest "loading."
public struct Shimmer: ViewModifier {
    /// Corner radius used to clip the overlay so it doesn't bleed outside the
    /// view's visual shape. Defaults to 12 to mirror the web prototype.
    public let radius: CGFloat
    @State private var phase: CGFloat = -1.0

    public init(radius: CGFloat = 12) {
        self.radius = radius
    }

    public func body(content: Content) -> some View {
        content
            .overlay(
                GeometryReader { geo in
                    LinearGradient(
                        gradient: Gradient(colors: [
                            Color.white.opacity(0.0),
                            Color.white.opacity(0.55),
                            Color.white.opacity(0.0),
                        ]),
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: geo.size.width * 0.6)
                    .offset(x: phase * geo.size.width * 1.6)
                    .blendMode(.plusLighter)
                }
                .mask(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                )
                .allowsHitTesting(false)
            )
            .onAppear {
                withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) {
                    phase = 1.0
                }
            }
    }
}

public extension View {
    /// Apply the shimmering gradient overlay.
    func shimmer(radius: CGFloat = 12) -> some View {
        modifier(Shimmer(radius: radius))
    }
}

/// Card-shaped placeholder with the shimmer modifier already applied.
public struct ShimmerCard: View {
    public let height: CGFloat
    public let cornerRadius: CGFloat

    public init(height: CGFloat = 120, cornerRadius: CGFloat = 20) {
        self.height = height
        self.cornerRadius = cornerRadius
    }

    public var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(MafiaColor.surface)
            .frame(height: height)
            .modifier(Shimmer(radius: cornerRadius))
    }
}

#if DEBUG
struct Shimmer_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 16) {
            ShimmerCard()
            ShimmerCard(height: 64, cornerRadius: 14)
        }
        .padding(24)
        .background(MafiaColor.paper)
    }
}
#endif
