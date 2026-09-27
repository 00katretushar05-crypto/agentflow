/**
 * riskGate.ts — Additive risk assessment computed from existing agent results.
 *
 * This module is PURE: no side effects, no store access, no SSE.
 * It reads only data already present on SupervisorTaskState and returns a
 * RiskAssessment.  The caller (supervisor.ts) is responsible for storing it.
 */

import type { SupervisorTaskState, RiskAssessment } from './types/contracts.js';

/**
 * Compute a RiskAssessment from already-collected agent results.
 *
 * Formula (deterministic, no randomness):
 *
 *   structuralScore = filesAffected * 10
 *                   + functionsAffected * 5
 *                   + impactScore          (HIGH=30, MEDIUM=15, LOW=0)
 *
 *   testMultiplier  = when tests have run:
 *                       failRate = failed / totalTests
 *                       multiplier = 0.25 + 0.75 * failRate
 *                       (0 failures → 0.25x  ·  all failures → 1.0x)
 *                   = 1.0 when no test result is present
 *
 *   failurePenalty  = min(40, failed * 8)   — directly penalises failing tests
 *
 *   riskPercent = min(100, structuralScore * testMultiplier + failurePenalty)
 *
 * A fully-passing run (failed=0) reduces the structural score to 25 % of its
 * raw value and adds zero penalty, so static factors like file/function counts
 * and dependency impact still inform the score without dominating it when tests
 * actually confirm the change is safe.
 *
 * Thresholds:
 *   < 30  → low risk, safe to proceed
 *   30-70 → medium risk, review recommended
 *   > 70  → high risk, manual review required
 *
 * All inputs default to 0 / 'LOW' when absent — never throws.
 */
export function computeRiskAssessment(state: SupervisorTaskState): RiskAssessment {
  const ciFindings = state.agentResults?.CODE_INTELLIGENCE?.findings;
  const testResult = state.agentResults?.TEST_QA?.testResult;

  const filesAffected      = ciFindings?.affectedFiles?.length      ?? 0;
  const functionsAffected  = ciFindings?.affectedFunctions?.length  ?? 0;
  const testsCovered       = testResult?.totalTests                 ?? 0;
  const dependencyImpact   = ciFindings?.riskLevel                  ?? 'LOW';

  const impactScore =
    dependencyImpact === 'HIGH'   ? 30 :
    dependencyImpact === 'MEDIUM' ? 15 : 0;

  const structuralScore = filesAffected * 10 + functionsAffected * 5 + impactScore;

  // When a test result is available, scale the structural score by how many
  // tests failed.  A fully-passing run caps the multiplier at 0.25, meaning
  // structural factors can only contribute 25 % of their raw weight.
  // Without any test result we conservatively leave the multiplier at 1.0.
  let testMultiplier = 1.0;
  let failurePenalty = 0;
  if (testResult && testResult.totalTests > 0) {
    const failRate = testResult.failed / testResult.totalTests;
    testMultiplier = 0.25 + 0.75 * failRate;
    // Each failing test adds a direct penalty (capped so 5 failures = 40 pts).
    failurePenalty = Math.min(40, testResult.failed * 8);
  }

  const riskPercent = Math.min(
    100,
    Math.round(structuralScore * testMultiplier + failurePenalty),
  );

  const recommendation =
    riskPercent > 70
      ? 'High risk: manual review required before proceeding.'
      : riskPercent >= 30
        ? 'Medium risk: review changes with a second engineer before merging.'
        : 'Low risk: changes look safe to proceed.';

  return {
    filesAffected,
    functionsAffected,
    testsCovered,
    dependencyImpact,
    riskPercent,
    recommendation,
  };
}
