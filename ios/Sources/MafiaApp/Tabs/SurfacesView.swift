//
//  SurfacesView.swift
//
//  Stub for Surfaces tab — DESIGN.md §3.1.
//
import SwiftUI
import MafiaDesignSystem

public struct SurfacesView: View {
    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SectionLabel("Sources")
                Text("Surfaces")
                    .font(MafiaFont.displayL)
                    .foregroundStyle(MafiaColor.ink)
                Text("One library, many places. Sync stays read-only unless you say otherwise.")
                    .font(MafiaFont.body)
                    .foregroundStyle(MafiaColor.inkSoft)

                Card {
                    Text("Connected surfaces appear here. iCloud Photos, Google Photos, Drive, Gmail, Dropbox.")
                        .font(MafiaFont.body)
                        .foregroundStyle(MafiaColor.inkSoft)
                }
                .padding(.top, 8)

                Text("Mafia treats one photo across surfaces as one entity.")
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
