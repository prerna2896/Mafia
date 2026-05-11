//! Pure state-transition functions. No I/O.
//!
//! Mirror of `Mafia/src/quarantine/state-machine.ts` — the Rust side of the
//! TS↔Rust parity that V1 enforces. Every change here MUST also land in the
//! TS file (and vice versa) until the TS implementation is retired.
//!
//! ```text
//!   flagged ──quarantine──▶ quarantining ──quarantine_complete──▶ quarantined
//!      │                          │                                     │
//!      └──keep──▶ kept             └──fail──▶ failed                    │
//!                                                                       │
//!                                          ┌──restore──▶ restoring ─────┤
//!                                          │              │             │
//!                                          │              ├─restore_complete──▶ restored
//!                                          │              └─fail──▶ failed
//!                                          │                            │
//!                                          └──purge──▶ purging ◀────────┘
//!                                                       │
//!                                                       ├─purge_complete──▶ purged
//!                                                       └─fail──▶ failed
//! ```

use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Intent {
    Keep,
    Archive,
    Delete,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Flagged,
    Quarantining,
    Quarantined,
    Restoring,
    Kept,
    Restored,
    Purging,
    Purged,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Transition {
    Flag,
    Quarantine,
    QuarantineComplete,
    Restore,
    RestoreComplete,
    Keep,
    Purge,
    PurgeComplete,
    Fail,
    Genesis,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum IllegalTransition {
    #[error("Illegal transition: {from:?} --{transition:?}--> ?")]
    Invalid {
        from: Option<State>,
        transition: Transition,
    },
}

impl IllegalTransition {
    pub fn from(&self) -> Option<State> {
        match self {
            IllegalTransition::Invalid { from, .. } => *from,
        }
    }
    pub fn transition(&self) -> Transition {
        match self {
            IllegalTransition::Invalid { transition, .. } => *transition,
        }
    }
}

/// Validate that a transition is legal from the current state.
/// Returns the resulting state, or `IllegalTransition`.
///
/// `from == None` means "no prior state" — only valid for the `Flag` transition,
/// which is row creation rather than a true transition.
///
/// `Transition::Genesis` is reflog-only and never legal here.
pub fn next_state(
    from: Option<State>,
    transition: Transition,
) -> Result<State, IllegalTransition> {
    use State::*;
    use Transition::*;

    let invalid = || {
        Err(IllegalTransition::Invalid {
            from,
            transition,
        })
    };

    match transition {
        Genesis => invalid(),
        Flag => match from {
            None => Ok(Flagged),
            _ => invalid(),
        },
        Keep => match from {
            Some(Flagged) => Ok(Kept),
            _ => invalid(),
        },
        Quarantine => match from {
            Some(Flagged) => Ok(Quarantining),
            _ => invalid(),
        },
        QuarantineComplete => match from {
            Some(Quarantining) => Ok(Quarantined),
            _ => invalid(),
        },
        Restore => match from {
            Some(Quarantined) => Ok(Restoring),
            _ => invalid(),
        },
        RestoreComplete => match from {
            Some(Restoring) => Ok(Restored),
            _ => invalid(),
        },
        Purge => match from {
            Some(Quarantined) => Ok(Purging),
            _ => invalid(),
        },
        PurgeComplete => match from {
            Some(Purging) => Ok(Purged),
            _ => invalid(),
        },
        Fail => match from {
            Some(Quarantining | Restoring | Purging) => Ok(Failed),
            _ => invalid(),
        },
    }
}

/// Terminal states never transition further.
#[must_use]
pub fn is_terminal(state: State) -> bool {
    matches!(state, State::Kept | State::Restored | State::Purged | State::Failed)
}

/// In-flight states are recovered on startup by the outbox reconcile pass.
#[must_use]
pub fn is_in_flight(state: State) -> bool {
    matches!(state, State::Quarantining | State::Restoring | State::Purging)
}

// ── String round-trip (used by the napi-rs binding) ────────────────────────

impl fmt::Display for State {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            State::Flagged => "flagged",
            State::Quarantining => "quarantining",
            State::Quarantined => "quarantined",
            State::Restoring => "restoring",
            State::Kept => "kept",
            State::Restored => "restored",
            State::Purging => "purging",
            State::Purged => "purged",
            State::Failed => "failed",
        };
        f.write_str(s)
    }
}

impl std::str::FromStr for State {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match s {
            "flagged" => State::Flagged,
            "quarantining" => State::Quarantining,
            "quarantined" => State::Quarantined,
            "restoring" => State::Restoring,
            "kept" => State::Kept,
            "restored" => State::Restored,
            "purging" => State::Purging,
            "purged" => State::Purged,
            "failed" => State::Failed,
            other => return Err(format!("unknown state: {other}")),
        })
    }
}

impl fmt::Display for Transition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Transition::Flag => "flag",
            Transition::Quarantine => "quarantine",
            Transition::QuarantineComplete => "quarantine_complete",
            Transition::Restore => "restore",
            Transition::RestoreComplete => "restore_complete",
            Transition::Keep => "keep",
            Transition::Purge => "purge",
            Transition::PurgeComplete => "purge_complete",
            Transition::Fail => "fail",
            Transition::Genesis => "genesis",
        };
        f.write_str(s)
    }
}

impl std::str::FromStr for Transition {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match s {
            "flag" => Transition::Flag,
            "quarantine" => Transition::Quarantine,
            "quarantine_complete" => Transition::QuarantineComplete,
            "restore" => Transition::Restore,
            "restore_complete" => Transition::RestoreComplete,
            "keep" => Transition::Keep,
            "purge" => Transition::Purge,
            "purge_complete" => Transition::PurgeComplete,
            "fail" => Transition::Fail,
            "genesis" => Transition::Genesis,
            other => return Err(format!("unknown transition: {other}")),
        })
    }
}
