//! Node.js binding for `mafia-core` via napi-rs.
//!
//! Exposes a small, JS-friendly surface: strings in, strings out. The Rust
//! crate keeps its strongly-typed enums; the binding does the parse/format.
//!
//! Build with `@napi-rs/cli`:
//!     npm install -g @napi-rs/cli
//!     napi build --release
//! Produces `index.node` consumable by Mafia (V1 Commit 2).

#![deny(clippy::all)]

use mafia_core::reflog::{
    canonical_json as core_canonical_json, verify_chain as core_verify_chain,
    ReflogEntry as CoreReflogEntry,
};
use mafia_core::{next_state as core_next_state, State, Transition};
use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Compute the next state for a given transition.
///
/// JS signature: `nextState(from: string | null, transition: string) -> string`
///
/// Throws if `transition` is unknown OR if the transition is illegal from `from`.
/// The error message includes both `from` and `transition` so the caller can
/// surface it directly.
#[napi]
pub fn next_state(from: Option<String>, transition: String) -> Result<String> {
    let from_state: Option<State> = match from {
        None => None,
        Some(s) => Some(
            s.parse::<State>()
                .map_err(|e| Error::new(Status::InvalidArg, e))?,
        ),
    };
    let trans: Transition = transition
        .parse::<Transition>()
        .map_err(|e| Error::new(Status::InvalidArg, e))?;

    core_next_state(from_state, trans)
        .map(|s| s.to_string())
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))
}

/// Classifier — is the given state terminal (no outgoing transitions)?
#[napi]
pub fn is_terminal(state: String) -> Result<bool> {
    let s: State = state
        .parse()
        .map_err(|e: String| Error::new(Status::InvalidArg, e))?;
    Ok(mafia_core::state_machine::is_terminal(s))
}

/// Classifier — is the given state in-flight (mid-transition; subject to crash recovery)?
#[napi]
pub fn is_in_flight(state: String) -> Result<bool> {
    let s: State = state
        .parse()
        .map_err(|e: String| Error::new(Status::InvalidArg, e))?;
    Ok(mafia_core::state_machine::is_in_flight(s))
}

/// Crate version — handy for debugging which binding is loaded.
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ── Reflog ───────────────────────────────────────────────────────────────────

/// Canonical JSON: keys sorted alphabetically at every depth. Input is a
/// JSON-encoded string (caller does `JSON.stringify(obj)` first), output
/// is the canonical form.
///
/// Produces byte-identical output to `canonicalJson` in
/// `Mafia/src/quarantine/reflog.ts`.
#[napi(js_name = "canonicalJson")]
pub fn canonical_json(value_json: String) -> Result<String> {
    let value: serde_json::Value = serde_json::from_str(&value_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid JSON: {e}")))?;
    Ok(core_canonical_json(&value))
}

/// One reflog entry. Shape mirrors `Mafia/src/quarantine/types.ts`
/// `ReflogEntry`. Snake_case names match the SQLite columns + TS interface.
///
/// Note: napi exposes `seq` and `ts` as JS `number` (f64) — this fits all
/// realistic values (seq < 2^53, ts in seconds also < 2^53). At the FFI
/// boundary we cast to i64 for the core crate.
#[napi(object)]
pub struct JsReflogEntry {
    pub seq: f64,
    pub prev_hash: String,
    pub entry_hash: String,
    pub ts: f64,
    pub user_id: String,
    pub action_id: String,
    pub transition: String,
    pub payload_json: String,
}

/// Result of `verifyChain`. `ok=true` means the chain is intact.
/// On failure, `brokenAt` is the `seq` of the first invalid entry and
/// `reason` describes why.
#[napi(object)]
pub struct JsVerifyResult {
    pub ok: bool,
    pub broken_at: Option<f64>,
    pub reason: Option<String>,
}

/// Verify a reflog chain. Entries MUST be in ascending `seq` order.
/// The TS caller does `SELECT * FROM reflog ORDER BY seq ASC` then passes
/// the rows here.
#[napi(js_name = "verifyChain")]
pub fn verify_chain(entries: Vec<JsReflogEntry>) -> JsVerifyResult {
    let core_entries: Vec<CoreReflogEntry> = entries
        .into_iter()
        .map(|e| CoreReflogEntry {
            seq: e.seq as i64,
            prev_hash: e.prev_hash,
            entry_hash: e.entry_hash,
            ts: e.ts as i64,
            user_id: e.user_id,
            action_id: e.action_id,
            transition: e.transition,
            payload_json: e.payload_json,
        })
        .collect();
    let result = core_verify_chain(&core_entries);
    JsVerifyResult {
        ok: result.ok,
        broken_at: result.broken_at.map(|n| n as f64),
        reason: result.reason,
    }
}
