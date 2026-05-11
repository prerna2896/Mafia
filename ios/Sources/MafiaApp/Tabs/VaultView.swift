//
//  VaultView.swift
//
//  Stub for the Vault tab — DESIGN.md §3.1, §7. First-class trust surface.
//
import SwiftUI
import MafiaDesignSystem

public struct VaultView: View {
    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SectionLabel("Holding")
                Text("Vault")
                    .font(MafiaFont.displayL)
                    .foregroundStyle(MafiaColor.ink)
                Text("Recoverable for 30 days. Nothing here is gone.")
                    .font(MafiaFont.body)
                    .foregroundStyle(MafiaColor.inkSoft)

                // Purge warning banner placeholder.
                Card {
                    HStack(alignment: .top, spacing: 12) {
                        Text("3d")
                            .font(MafiaFont.eyebrow)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(MafiaColor.amberSoft))
                            .foregroundStyle(MafiaColor.ink)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("47 items purging in 3 days")
                                .font(MafiaFont.title)
                                .foregroundStyle(MafiaColor.ink)
                            Text("Anything you'd like to keep?")
                                .font(MafiaFont.body)
                                .foregroundStyle(MafiaColor.inkSoft)
                        }
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
            .padding(.bottom, 128)
        }
        .background(MafiaColor.paper.ignoresSafeArea())
    }
}
