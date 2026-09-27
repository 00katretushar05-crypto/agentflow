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
 *   riskPercent = min(100,
 *     filesAffected * 10
 *     + functionsAffected * 5
 *     + (dependencyImpact === 'HIGH' ? 30 : dependencyImpact === 'MEDIUM' ? 15 : 0)
 *   )
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

  const riskPercent = Math.min(
    100,
    filesAffected * 10 + functionsAffected * 5 + impactScore,
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
