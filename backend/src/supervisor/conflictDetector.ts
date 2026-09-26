/**
 * conflictDetector.ts
 *
 * Supervisor utility — detects conflicts between agent outputs:
 *
 *   If CODE_INTELLIGENCE recommends modifying a file that TEST_QA has flagged
 *   as "do not modify" (due to fragile existing test coverage), the Supervisor
 *   MUST NOT proceed.  Instead it calls `detectConflict`, which returns a
 *   ConflictReport so the Supervisor can request additional analysis.
 *
 * Usage:
 *   const report = detectConflict(codeIntelResult, testQAResult);
 *   if (report !== null) {
 *     // conflict detected — request additional analysis, do not proceed
 *   }
 */

import type { AgentResult, ConflictReport } from '../types/contracts';

/**
 * Compare the `proposedModifications` list from the CODE_INTELLIGENCE result
 * against the `doNotModify` list from the TEST_QA result.
 *
 * Returns a `ConflictReport` when at least one file appears in both lists,
 * or `null` when there is no conflict.
 *
 * Both lists are compared case-insensitively and with normalised separators so
 * that Windows backslash paths do not produce false negatives.
 */
export function detectConflict(
  codeIntelResult: AgentResult,
  testQAResult: AgentResult,
): ConflictReport | null {
  const proposed = (codeIntelResult.proposedModifications ?? []).map(normalise);
  const blocked = (testQAResult.doNotModify ?? []).map(normalise);

  if (proposed.length === 0 || blocked.length === 0) return null;

  const blockedSet = new Set(blocked);
  const conflictingNormalised = proposed.filter(f => blockedSet.has(f));

  if (conflictingNormalised.length === 0) return null;

  // Map normalised paths back to their original form from proposedModifications
  // so the report contains the same strings the caller supplied.
  const originalProposed = codeIntelResult.proposedModifications ?? [];
  const conflictingFiles = originalProposed.filter(f =>
    conflictingNormalised.includes(normalise(f)),
  );

  const fileList = conflictingFiles.map(f => `"${f}"`).join(', ');

  return {
    conflictingFiles,
    codeIntelligenceResult: codeIntelResult,
    testQAResult,
    reason:
      `CODE_INTELLIGENCE proposes modifying ${fileList}, but TEST_QA has flagged ` +
      `${fileList === conflictingFiles[0] ? 'that file' : 'those files'} as "do not modify" ` +
      `due to fragile existing test coverage (${testQAResult.testResult?.failed ?? 0} ` +
      `test(s) currently failing in the affected suite). ` +
      `Additional analysis is required before proceeding.`,
    detectedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Normalise a file path to lower-case forward-slash form for comparison. */
function normalise(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}
