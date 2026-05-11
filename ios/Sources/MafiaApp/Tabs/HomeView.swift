//
//  HomeView.swift
//
//  Stub for Home tab (DESIGN.md §3.1, §6).
//  Greeting + invitation card (Spark/Facilitator/Just-in-time) + Discoveries.
//
import SwiftUI
import MafiaDesignSystem

public struct HomeView: View {
    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SectionLabel("This week")
                Text("Take space.\nMake space.")
                    .font(MafiaFont.displayM)
                    .foregroundStyle(MafiaColor.ink)

                Card {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Invitation")
                        Text("Want to see the 6 best shots from your Goa trip?")
                            .font(MafiaFont.title)
                            .foregroundStyle(MafiaColor.ink)
                        PillButton("Show me", style: .accent, action: {})
                            .padding(.top, 8)
                    }
                }

                Text("We never permanently delete without you.")
                    .font(MafiaFont.caption)
                    .foregroundStyle(MafiaColor.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 24)
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 128) // clearance for floating tab bar
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }
}
