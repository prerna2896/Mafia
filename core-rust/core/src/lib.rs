//! Mafia core — cross-platform trust primitives.
//!
//! This crate is the shared source-of-truth for the state machine, reflog, and
//! snapshot logic used by both the Mafia Node MCP server (via napi-rs binding
//! in `../ffi-node`) and the future iOS app (via `cargo-lipo` Swift Package).
//!
//! ADR-0002 in the Mafia repo describes the staged port from TypeScript.
//!
//! V1 Commit 1 (this commit) ports the pure state machine. Later commits
//! will add the reflog (with hash chain verification) and the snapshot
//! store.

pub mod reflog;
pub mod state_machine;

pub use reflog::{
    canonical_json, compute_entry_hash, sha256_hex, verify_chain, ReflogEntry, VerifyResult,
};
pub use state_machine::{next_state, IllegalTransition, Intent, State, Transition};
