/**
 * stateMachine.test.ts — Unit tests for stateMachine.ts.
 *
 * Tests cover:
 *   • Every valid state transition (happy path)
 *   • Every invalid/disallowed transition (must throw)
 *   • isTerminal() correctness
 *   • isFailurePath() correctness
 *   • allowedTransitionsFrom() shape
 *   • reason and timestamp fields on returned StateTransition
 */

import { describe, it, expect } from 'vitest';
import {
  transition,
  isTerminal,
  isFailurePath,
  allowedTransitionsFrom,
} from '../src/stateMachine.js';
import type { SupervisorState } from '../src/types/contracts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function iso(s: string): boolean {
  return !isNaN(Date.parse(s));
}

// ---------------------------------------------------------------------------
// Valid transitions
// ---------------------------------------------------------------------------

describe('transition — valid edges', () => {
  const validEdges: [SupervisorState, SupervisorState][] = [
    ['RECEIVED',          'PLANNING'],
    ['PLANNING',          'ANALYZING'],
    ['ANALYZING',         'IMPLEMENTING'],
    ['ANALYZING',         'FAILED'],
    ['IMPLEMENTING',      'TESTING'],
    ['IMPLEMENTING',      'FAILED'],
    ['TESTING',           'VERIFYING'],
    ['TESTING',           'FAILED'],
    ['FAILED',            'RECOVERING'],
    ['FAILED',            'FAILED'],       // terminal FAILED self-loop (retries exhausted)
    ['RECOVERING',        'RETESTING'],
    ['RECOVERING',        'FAILED'],
    ['RETESTING',         'VERIFYING'],
    ['RETESTING',         'FAILED'],
    ['VERIFYING',         'AWAITING_APPROVAL'],
    ['VERIFYING',         'FAILED'],
    ['AWAITING_APPROVAL', 'VERIFIED'],
  ];

  it.each(validEdges)('%s → %s does not throw', (from, to) => {
    expect(() => transition(from, to, 'test reason')).not.toThrow();
  });

  it('returns a StateTransition with correct fields', () => {
    const tx = transition('RECEIVED', 'PLANNING', 'starting');
    expect(tx.from).toBe('RECEIVED');
    expect(tx.to).toBe('PLANNING');
    expect(tx.reason).toBe('starting');
    expect(iso(tx.timestamp)).toBe(true);
  });

  it('preserves the exact reason string verbatim', () => {
    const reason = 'Task decomposed into 3 subtasks: CI, QA, DEBUG.';
    const tx = transition('PLANNING', 'ANALYZING', reason);
    expect(tx.reason).toBe(reason);
  });
});

// ---------------------------------------------------------------------------
// Invalid transitions (must throw)
// ---------------------------------------------------------------------------

describe('transition — invalid edges throw', () => {
  const invalidEdges: [SupervisorState, SupervisorState][] = [
    ['RECEIVED',          'VERIFIED'],
    ['RECEIVED',          'TESTING'],
    ['PLANNING',          'VERIFIED'],
    ['ANALYZING',         'RECEIVED'],
    ['IMPLEMENTING',      'PLANNING'],
    ['TESTING',           'RECEIVED'],
    ['FAILED',            'PLANNING'],
    ['FAILED',            'VERIFIED'],
    ['VERIFIED',          'PLANNING'],    // terminal state → anything
    ['VERIFIED',          'FAILED'],      // terminal state → anything
    ['VERIFIED',          'VERIFIED'],    // terminal state → self
    ['AWAITING_APPROVAL', 'PLANNING'],    // cannot skip approval
    ['AWAITING_APPROVAL', 'FAILED'],      // cannot skip approval
  ];

  it.each(invalidEdges)('%s → %s throws', (from, to) => {
    expect(() => transition(from, to, 'should throw')).toThrow();
  });

  it('error message contains both states', () => {
    let msg = '';
    try {
      transition('VERIFIED', 'PLANNING', 'bad');
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('VERIFIED');
    expect(msg).toContain('PLANNING');
  });
});

// ---------------------------------------------------------------------------
// isTerminal()
// ---------------------------------------------------------------------------

describe('isTerminal()', () => {
  it('VERIFIED is terminal', () => {
    expect(isTerminal('VERIFIED')).toBe(true);
  });

  it('all non-terminal states return false', () => {
    const nonTerminal: SupervisorState[] = [
      'RECEIVED', 'PLANNING', 'ANALYZING', 'IMPLEMENTING',
      'TESTING', 'FAILED', 'RECOVERING', 'RETESTING',
      'VERIFYING', 'AWAITING_APPROVAL',
    ];
    for (const s of nonTerminal) {
      expect(isTerminal(s), `${s} should not be terminal`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// isFailurePath()
// ---------------------------------------------------------------------------

describe('isFailurePath()', () => {
  it('FAILED is a failure path', () => {
    expect(isFailurePath('FAILED')).toBe(true);
  });

  it('RECOVERING is a failure path', () => {
    expect(isFailurePath('RECOVERING')).toBe(true);
  });

  it('non-failure states return false', () => {
    const normal: SupervisorState[] = [
      'RECEIVED', 'PLANNING', 'ANALYZING', 'IMPLEMENTING',
      'TESTING', 'RETESTING', 'VERIFYING', 'AWAITING_APPROVAL', 'VERIFIED',
    ];
    for (const s of normal) {
      expect(isFailurePath(s), `${s} should not be failure path`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// allowedTransitionsFrom()
// ---------------------------------------------------------------------------

describe('allowedTransitionsFrom()', () => {
  it('returns a copy (mutation does not affect the state machine)', () => {
    const result = allowedTransitionsFrom('TESTING');
    const original = [...result];
    result.push('RECEIVED'); // mutate the returned copy
    expect(allowedTransitionsFrom('TESTING')).toEqual(original);
  });

  it('VERIFIED has no outbound transitions', () => {
    expect(allowedTransitionsFrom('VERIFIED')).toHaveLength(0);
  });

  it('AWAITING_APPROVAL only allows VERIFIED', () => {
    expect(allowedTransitionsFrom('AWAITING_APPROVAL')).toEqual(['VERIFIED']);
  });
});
