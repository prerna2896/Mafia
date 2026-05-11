// Pure state-transition functions. No I/O, no side effects.
// Single source of truth for what transitions are legal.
//
// Dual-backend: TypeScript by default (V0), or Rust via the @mafia/core-node
// FFI binding when MAFIA_CORE_BACKEND=rust. Same observable behavior; the
// matrix test (`npm run test:matrix`) runs the full suite against both.
//
// State diagram:
//
//   flagged ──quarantine──▶ quarantining ──quarantine_complete──▶ quarantined
//      │                          │                                     │
//      └──keep──▶ kept             └──fail──▶ failed                    │
//                                                                       │
//                                          ┌──restore──▶ restoring ─────┤
//                                          │              │             │
//                                          │              ├─restore_complete──▶ restored
//                                          │              └─fail──▶ failed
//                                          │                            │
//                                          └──purge──▶ purging ◀────────┘
//                                                       │
//                                                       ├─purge_complete──▶ purged
//                                                       └─fail──▶ failed

import type { State, Transition } from './types.js';
import * as rustCore from '@mafia/core-node';

const BACKEND = (process.env.MAFIA_CORE_BACKEND ?? 'typescript').toLowerCase();
const USE_RUST = BACKEND === 'rust';

/** Which backend is active. Exposed for diagnostics + eval reporting. */
export function activeBackend(): 'rust' | 'typescript' {
  return USE_RUST ? 'rust' : 'typescript';
}

interface TransitionRule {
  from: State[];
  to: State;
}

const RULES: Record<Exclude<Transition, 'genesis'>, TransitionRule> = {
  // Initial flagging is a row creation, not a transition between existing
  // states; flag is treated as transition into 'flagged' from a notional
  // 'pre' state.
  flag: { from: [], to: 'flagged' },

  keep: { from: ['flagged'], to: 'kept' },

  quarantine: { from: ['flagged'], to: 'quarantining' },
  quarantine_complete: { from: ['quarantining'], to: 'quarantined' },

  restore: { from: ['quarantined'], to: 'restoring' },
  restore_complete: { from: ['restoring'], to: 'restored' },

  purge: { from: ['quarantined'], to: 'purging' },
  purge_complete: { from: ['purging'], to: 'purged' },

  // Any *-ing state may transition to failed if the upstream call errors.
  fail: { from: ['quarantining', 'restoring', 'purging'], to: 'failed' },
};

export class IllegalTransition extends Error {
  constructor(
    public readonly from: State | null,
    public readonly transition: Transition,
  ) {
    super(`Illegal transition: ${from ?? '<new>'} --${transition}--> ?`);
    this.name = 'IllegalTransition';
  }
}

/**
 * Validate that a transition is legal from the current state.
 * Returns the resulting state, or throws IllegalTransition.
 */
export function nextState(from: State | null, transition: Transition): State {
  return USE_RUST ? nextStateRust(from, transition) : nextStateTs(from, transition);
}

function nextStateTs(from: State | null, transition: Transition): State {
  if (transition === 'genesis') {
    throw new IllegalTransition(from, transition); // genesis is reflog-only
  }
  const rule = RULES[transition];
  if (transition === 'flag') {
    if (from !== null) throw new IllegalTransition(from, transition);
    return rule.to;
  }
  if (from === null) throw new IllegalTransition(from, transition);
  if (!rule.from.includes(from)) throw new IllegalTransition(from, transition);
  return rule.to;
}

function nextStateRust(from: State | null, transition: Transition): State {
  try {
    return rustCore.nextState(from, transition) as State;
  } catch {
    // Re-wrap so callers still see our IllegalTransition class.
    throw new IllegalTransition(from, transition);
  }
}

/**
 * Convenience: is the given state terminal? Terminal states never transition further.
 */
export function isTerminal(state: State): boolean {
  if (USE_RUST) return rustCore.isTerminal(state);
  return state === 'kept' || state === 'restored' || state === 'purged' || state === 'failed';
}

/**
 * Convenience: is the given state in-flight? In-flight states are recovered
 * on startup by the outbox reconcile pass.
 */
export function isInFlight(state: State): boolean {
  if (USE_RUST) return rustCore.isInFlight(state);
  return state === 'quarantining' || state === 'restoring' || state === 'purging';
}

/**
 * Reflog-relevant transitions, in canonical order. Useful for tests.
 */
export const ALL_TRANSITIONS: Transition[] = [
  'flag',
  'keep',
  'quarantine',
  'quarantine_complete',
  'restore',
  'restore_complete',
  'purge',
  'purge_complete',
  'fail',
];
