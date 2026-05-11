//
//  InsightsView.swift
//
//  Stub for Insights tab — DESIGN.md §3.1, §8.
//
import SwiftUI
import MafiaDesignSystem

public struct InsightsView: View {
    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SectionLabel("Cumulative")
                Text("Insights")
                    .font(MafiaFont.displayL)
                    .foregroundStyle(MafiaColor.ink)
                Text("Cumulative, not streaks. We learn from what you keep.")
                    .font(MafiaFont.body)
                    .foregroundStyle(MafiaColor.inkSoft)

                Card(padding: 24) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("0")
                            .font(MafiaFont.hero)
                            .foregroundStyle(MafiaColor.ink)
                        Text("GB recovered")
                            .font(MafiaFont.body)
                            .foregroundStyle(MafiaColor.inkSoft)
                    }
                }

                Text("No streaks. No pressure. Just signal.")
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
