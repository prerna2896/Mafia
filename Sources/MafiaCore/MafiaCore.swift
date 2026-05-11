//
//  MafiaCore.swift
//
//  Public Swift API the Rust core will eventually provide via `cargo-lipo`
//  Swift Package binding (per ADR-0002 in /Users/prernaagarwal/wonder/Mafia/).
//
//  Currently STUBBED: every function returns a hardcoded value so the iOS
//  scaffold compiles and SwiftUI previews can be wired up. The actual
//  implementations live in the Rust crate at
//  `/Users/prernaagarwal/wonder/mafia-core-rust/core/` and will be exposed to
//  Swift through the `ffi-ios/` crate.
//
//  Migration order (ADR-0002 §"What gets ported, in order"):
//    1. state-machine                (this file's `nextState`)
//    2. reflog::canonical_json + verify_chain
//    3. snapshot::content_id
//    4. reflog::append   (touches SQLite via rusqlite)
//    5. outbox::commit_action
//
//  iOS can start consuming this API after step 3 is done (ADR-0002 §"iOS app
//  starts after step 3").
//
import Foundation

// MARK: - State machine

public enum VaultState: String, Sendable, CaseIterable {
    case flagged    // discovered but not acted upon
    case vaulted    // moved to vault, recoverable
    case restored   // user explicitly restored
    case purged     // 30 days elapsed, permanently gone
}

public enum Transition: String, Sendable {
    case vault          // flagged    -> vaulted
    case restore        // vaulted    -> restored
    case purge          // vaulted    -> purged (after 30d)
    case reFlag         // restored   -> flagged
}

public enum MafiaCoreError: Error, Sendable, Equatable {
    case illegalTransition(from: VaultState?, transition: Transition)
    case rustCoreUnavailable                 // placeholder while Rust core is stubbed
}

public enum MafiaCore {

    // TODO(rust-core): replace with FFI call to `mafia_core_next_state`.
    // See ADR-0002 commit 1 for the exact Rust signature.
    public static func nextState(from: VaultState?, transition t: Transition) throws -> VaultState {
        switch (from, t) {
        case (nil, .vault),           (.flagged?, .vault):    return .vaulted
        case (.vaulted?, .restore):                           return .restored
        case (.vaulted?, .purge):                             return .purged
        case (.restored?, .reFlag):                           return .flagged
        default:
            throw MafiaCoreError.illegalTransition(from: from, transition: t)
        }
    }

    // MARK: - Reflog (step 2 of ADR-0002 migration)

    public struct ReflogEntry: Sendable, Equatable {
        public let id: String
        public let parentHash: String?
        public let payload: String
        public init(id: String, parentHash: String?, payload: String) {
            self.id = id
            self.parentHash = parentHash
            self.payload = payload
        }
    }

    public enum VerifyResult: Sendable, Equatable {
        case ok
        case brokenAt(entryId: String)
    }

    // TODO(rust-core): replace with FFI call to `mafia_core_verify_chain`.
    public static func verifyChain(_ entries: [ReflogEntry]) -> VerifyResult {
        // Stub: assume well-formed.
        _ = entries
        return .ok
    }

    // MARK: - Snapshot content ID (step 3)

    // TODO(rust-core): replace with FFI call to `mafia_core_content_id`
    // (sha256 of `email_id|internal_date` per ADR-0002).
    public static func contentId(emailId: String, internalDate: Int64) -> String {
        return "stub-content-id-\(emailId)-\(internalDate)"
    }

    // MARK: - Stats placeholder

    public struct Stats: Sendable {
        public let vaultedCount: Int
        public let bytesRecovered: Int64
        public let restoreRate: Double
        public init(vaultedCount: Int, bytesRecovered: Int64, restoreRate: Double) {
            self.vaultedCount = vaultedCount
            self.bytesRecovered = bytesRecovered
            self.restoreRate = restoreRate
        }
    }

    // TODO(rust-core): backed by the reflog once steps 4-5 land.
    public static func stats() -> Stats {
        Stats(vaultedCount: 0, bytesRecovered: 0, restoreRate: 0)
    }
}
