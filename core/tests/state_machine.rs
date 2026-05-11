//! Fixture tests mirroring `Mafia/tests/state-machine.test.ts`.
//! These MUST pass with identical semantics on both sides.

use mafia_core::state_machine::{is_in_flight, is_terminal};
use mafia_core::{next_state, IllegalTransition, State, Transition};

// ── Flag ─────────────────────────────────────────────────────────────────────

#[test]
fn flag_from_none_yields_flagged() {
    assert_eq!(next_state(None, Transition::Flag).unwrap(), State::Flagged);
}

#[test]
fn flag_from_any_non_none_state_is_illegal() {
    for s in [
        State::Flagged,
        State::Quarantining,
        State::Quarantined,
        State::Restoring,
        State::Kept,
        State::Restored,
        State::Purging,
        State::Purged,
        State::Failed,
    ] {
        assert!(
            next_state(Some(s), Transition::Flag).is_err(),
            "flag from {s:?} should be illegal"
        );
    }
}

// ── Keep / quarantine / restore / purge happy paths ──────────────────────────

#[test]
fn keep_flagged_to_kept() {
    assert_eq!(
        next_state(Some(State::Flagged), Transition::Keep).unwrap(),
        State::Kept
    );
}

#[test]
fn quarantine_flow() {
    assert_eq!(
        next_state(Some(State::Flagged), Transition::Quarantine).unwrap(),
        State::Quarantining
    );
    assert_eq!(
        next_state(Some(State::Quarantining), Transition::QuarantineComplete).unwrap(),
        State::Quarantined
    );
}

#[test]
fn restore_flow() {
    assert_eq!(
        next_state(Some(State::Quarantined), Transition::Restore).unwrap(),
        State::Restoring
    );
    assert_eq!(
        next_state(Some(State::Restoring), Transition::RestoreComplete).unwrap(),
        State::Restored
    );
}

#[test]
fn purge_flow() {
    assert_eq!(
        next_state(Some(State::Quarantined), Transition::Purge).unwrap(),
        State::Purging
    );
    assert_eq!(
        next_state(Some(State::Purging), Transition::PurgeComplete).unwrap(),
        State::Purged
    );
}

// ── Fail is only legal from in-flight states ─────────────────────────────────

#[test]
fn fail_legal_only_from_in_flight() {
    for s in [State::Quarantining, State::Restoring, State::Purging] {
        assert_eq!(
            next_state(Some(s), Transition::Fail).unwrap(),
            State::Failed,
            "fail should be legal from {s:?}"
        );
    }
    for s in [
        State::Flagged,
        State::Quarantined,
        State::Kept,
        State::Restored,
        State::Purged,
        State::Failed,
    ] {
        assert!(
            next_state(Some(s), Transition::Fail).is_err(),
            "fail should be illegal from {s:?}"
        );
    }
}

// ── Terminal states reject all transitions ───────────────────────────────────

#[test]
fn terminal_states_reject_all_transitions() {
    let terminals = [State::Kept, State::Restored, State::Purged, State::Failed];
    let transitions = [
        Transition::Keep,
        Transition::Quarantine,
        Transition::QuarantineComplete,
        Transition::Restore,
        Transition::RestoreComplete,
        Transition::Purge,
        Transition::PurgeComplete,
        Transition::Fail,
    ];
    for s in terminals {
        for t in transitions {
            assert!(
                next_state(Some(s), t).is_err(),
                "expected illegal: {s:?} --{t:?}-->"
            );
        }
    }
}

// ── No skipping the in-flight step ───────────────────────────────────────────

#[test]
fn cannot_skip_in_flight() {
    assert!(next_state(Some(State::Flagged), Transition::QuarantineComplete).is_err());
    assert!(next_state(Some(State::Quarantined), Transition::RestoreComplete).is_err());
    assert!(next_state(Some(State::Quarantined), Transition::PurgeComplete).is_err());
}

// ── Restore only from quarantined ────────────────────────────────────────────

#[test]
fn restore_only_from_quarantined() {
    assert!(next_state(Some(State::Flagged), Transition::Restore).is_err());
    assert!(next_state(Some(State::Kept), Transition::Restore).is_err());
    assert!(next_state(Some(State::Restored), Transition::Restore).is_err());
    assert!(next_state(Some(State::Failed), Transition::Restore).is_err());
    assert!(next_state(Some(State::Purged), Transition::Restore).is_err());
}

// ── Cannot re-quarantine ─────────────────────────────────────────────────────

#[test]
fn no_requarantine_from_terminal() {
    assert!(next_state(Some(State::Restored), Transition::Quarantine).is_err());
    assert!(next_state(Some(State::Kept), Transition::Quarantine).is_err());
}

// ── Genesis is reflog-only ───────────────────────────────────────────────────

#[test]
fn genesis_never_a_legal_state_transition() {
    assert!(next_state(None, Transition::Genesis).is_err());
    assert!(next_state(Some(State::Flagged), Transition::Genesis).is_err());
}

// ── Classifier helpers ───────────────────────────────────────────────────────

#[test]
fn is_terminal_classifier() {
    assert!(is_terminal(State::Kept));
    assert!(is_terminal(State::Restored));
    assert!(is_terminal(State::Purged));
    assert!(is_terminal(State::Failed));
    assert!(!is_terminal(State::Flagged));
    assert!(!is_terminal(State::Quarantined));
    assert!(!is_terminal(State::Quarantining));
}

#[test]
fn is_in_flight_classifier() {
    assert!(is_in_flight(State::Quarantining));
    assert!(is_in_flight(State::Restoring));
    assert!(is_in_flight(State::Purging));
    assert!(!is_in_flight(State::Flagged));
    assert!(!is_in_flight(State::Quarantined));
    assert!(!is_in_flight(State::Kept));
}

// ── String round-trip (used by napi-rs binding) ──────────────────────────────

#[test]
fn state_string_roundtrip() {
    for s in [
        State::Flagged,
        State::Quarantining,
        State::Quarantined,
        State::Restoring,
        State::Kept,
        State::Restored,
        State::Purging,
        State::Purged,
        State::Failed,
    ] {
        let str = s.to_string();
        let parsed: State = str.parse().unwrap();
        assert_eq!(parsed, s);
    }
}

#[test]
fn transition_string_roundtrip() {
    for t in [
        Transition::Flag,
        Transition::Quarantine,
        Transition::QuarantineComplete,
        Transition::Restore,
        Transition::RestoreComplete,
        Transition::Keep,
        Transition::Purge,
        Transition::PurgeComplete,
        Transition::Fail,
        Transition::Genesis,
    ] {
        let s = t.to_string();
        let parsed: Transition = s.parse().unwrap();
        assert_eq!(parsed, t);
    }
}

// ── Error shape ──────────────────────────────────────────────────────────────

#[test]
fn illegal_transition_carries_context() {
    let err = next_state(Some(State::Failed), Transition::Restore).unwrap_err();
    assert_eq!(err.from(), Some(State::Failed));
    assert_eq!(err.transition(), Transition::Restore);
    let msg = err.to_string();
    assert!(msg.contains("Failed"), "msg should name from state: {msg}");
    assert!(msg.contains("Restore"), "msg should name transition: {msg}");
    assert!(
        matches!(err, IllegalTransition::Invalid { .. }),
        "single variant"
    );
}
