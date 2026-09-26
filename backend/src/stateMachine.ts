/**
 * stateMachine.ts — Pure state-transition logic for the Supervisor Engine.
 *
 * DESIGN CONTRACT (enforced by the AGENTS.md workspace rules):
 *   • No I/O, no imports from store or emitter.
 *   • All invalid transitions throw — they are never silently no-ops.
 *   • Every caller must supply a human-readable reason; the state machine
 *     records it verbatim into the returned StateTransition.
 */

import type { SupervisorState, StateTransition } from './types/contracts.js';

// ---------------------------------------------------------------------------
// Allowed transition table
// ---------------------------------------------------------------------------

/**
 * Exhaustive map of which target states are reachable from each source state.
 * Keeping this as a plain object (rather than computed logic) makes the full
 * topology visible in one place and easy to diff in code review.
 */
const ALLOWED_TRANSITIONS: Record<SupervisorState, SupervisorState[]> = {
  RECEIVED:          ['PLANNING'],
  PLANNING:          ['ANALYZING'],
  ANALYZING:         ['IMPLEMENTING', 'FAILED'],
  IMPLEMENTING:      ['TESTING', 'FAILED'],
  TESTING:           ['VERIFYING', 'FAILED'],
  FAILED:            ['RECOVERING', 'FAILED'],   // second FAILED = terminal (retries exhausted)
  RECOVERING:        ['RETESTING', 'FAILED'],
  RETESTING:         ['VERIFYING', 'FAILED'],
  VERIFYING:         ['AWAITING_APPROVAL', 'FAILED'],
  AWAITING_APPROVAL: ['VERIFIED'],               // ONLY reachable via explicit approve call
  VERIFIED:          [],                         // terminal — no outbound edges
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates that `from → to` is a permitted edge in the state machine and
 * returns a new, fully-formed StateTransition entry.
 *
 * @throws {Error} if the transition is not allowed — callers must not swallow
 *   this error silently; it signals a programming error in the Supervisor.
 */
export function transition(
  from: SupervisorState,
  to: SupervisorState,
  reason: string,
): StateTransition {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid state transition: ${from} → ${to}. ` +
      `Allowed from ${from}: [${allowed.join(', ') || 'none'}]`,
    );
  }
  return {
    from,
    to,
    reason,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Returns true when a state has no valid outbound transitions — i.e. the task
 * has reached a permanent terminal state and the Supervisor must not attempt
 * to continue processing it.
 */
export function isTerminal(state: SupervisorState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}

/**
 * Returns true when the state represents a failure pathway (FAILED or
 * RECOVERING).  Callers use this to decide whether to route to the
 * DebugReview agent rather than the happy path.
 */
export function isFailurePath(state: SupervisorState): boolean {
  return state === 'FAILED' || state === 'RECOVERING';
}

/**
 * Returns every state that can be reached directly from `state` — useful for
 * testing and validation.
 */
export function allowedTransitionsFrom(state: SupervisorState): SupervisorState[] {
  return [...ALLOWED_TRANSITIONS[state]];
}
