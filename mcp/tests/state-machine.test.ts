import { describe, it, expect } from 'vitest';
import {
  nextState,
  isTerminal,
  isInFlight,
  IllegalTransition,
  ALL_TRANSITIONS,
} from '../src/quarantine/state-machine.js';
import type { State, Transition } from '../src/quarantine/types.js';

describe('state-machine: nextState', () => {
  it('flag from null → flagged', () => {
    expect(nextState(null, 'flag')).toBe('flagged');
  });

  it('rejects flag from any non-null state', () => {
    const states: State[] = ['flagged', 'quarantining', 'quarantined', 'restoring', 'kept', 'restored', 'purging', 'purged', 'failed'];
    for (const s of states) {
      expect(() => nextState(s, 'flag')).toThrow(IllegalTransition);
    }
  });

  it('keep: flagged → kept', () => {
    expect(nextState('flagged', 'keep')).toBe('kept');
  });

  it('quarantine: flagged → quarantining → quarantined', () => {
    expect(nextState('flagged', 'quarantine')).toBe('quarantining');
    expect(nextState('quarantining', 'quarantine_complete')).toBe('quarantined');
  });

  it('restore: quarantined → restoring → restored', () => {
    expect(nextState('quarantined', 'restore')).toBe('restoring');
    expect(nextState('restoring', 'restore_complete')).toBe('restored');
  });

  it('purge: quarantined → purging → purged', () => {
    expect(nextState('quarantined', 'purge')).toBe('purging');
    expect(nextState('purging', 'purge_complete')).toBe('purged');
  });

  it('fail allowed only from in-flight states', () => {
    expect(nextState('quarantining', 'fail')).toBe('failed');
    expect(nextState('restoring', 'fail')).toBe('failed');
    expect(nextState('purging', 'fail')).toBe('failed');

    // Not from terminal or other states
    const illegalFromForFail: State[] = ['flagged', 'quarantined', 'kept', 'restored', 'purged', 'failed'];
    for (const s of illegalFromForFail) {
      expect(() => nextState(s, 'fail')).toThrow(IllegalTransition);
    }
  });

  it('rejects all transitions out of terminal states', () => {
    const terminals: State[] = ['kept', 'restored', 'purged', 'failed'];
    for (const s of terminals) {
      for (const t of ALL_TRANSITIONS) {
        if (t === 'flag') continue; // flag requires from === null and is already covered
        expect(() => nextState(s, t)).toThrow(IllegalTransition);
      }
    }
  });

  it('rejects skipping the in-flight step (flagged → quarantined)', () => {
    expect(() => nextState('flagged', 'quarantine_complete')).toThrow(IllegalTransition);
    expect(() => nextState('quarantined', 'restore_complete')).toThrow(IllegalTransition);
    expect(() => nextState('quarantined', 'purge_complete')).toThrow(IllegalTransition);
  });

  it('rejects restoring an item not yet quarantined', () => {
    expect(() => nextState('flagged', 'restore')).toThrow(IllegalTransition);
    expect(() => nextState('kept', 'restore')).toThrow(IllegalTransition);
  });

  it('rejects re-quarantining a restored or kept item', () => {
    expect(() => nextState('restored', 'quarantine')).toThrow(IllegalTransition);
    expect(() => nextState('kept', 'quarantine')).toThrow(IllegalTransition);
  });

  it('rejects genesis as a regular transition', () => {
    expect(() => nextState(null, 'genesis')).toThrow(IllegalTransition);
    expect(() => nextState('flagged', 'genesis' as Transition)).toThrow(IllegalTransition);
  });
});

describe('state-machine: classifiers', () => {
  it('isTerminal', () => {
    expect(isTerminal('kept')).toBe(true);
    expect(isTerminal('restored')).toBe(true);
    expect(isTerminal('purged')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('flagged')).toBe(false);
    expect(isTerminal('quarantined')).toBe(false);
    expect(isTerminal('quarantining')).toBe(false);
  });

  it('isInFlight', () => {
    expect(isInFlight('quarantining')).toBe(true);
    expect(isInFlight('restoring')).toBe(true);
    expect(isInFlight('purging')).toBe(true);
    expect(isInFlight('flagged')).toBe(false);
    expect(isInFlight('quarantined')).toBe(false);
    expect(isInFlight('kept')).toBe(false);
  });
});
