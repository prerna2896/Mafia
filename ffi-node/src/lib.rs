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
