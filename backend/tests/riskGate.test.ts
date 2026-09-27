import { describe, test, expect } from 'vitest';
import { computeRiskAssessment } from '../src/riskGate.js';
import type { SupervisorTaskState, AgentResult } from '../src/types/contracts.js';

// ---------------------------------------------------------------------------
// Minimal state builder — only the fields computeRiskAssessment reads.
// ---------------------------------------------------------------------------
function makeState(
  overrides: Partial<SupervisorTaskState> = {},
): SupervisorTaskState {
  return {
    taskId: 'test-id',
    goal: 'test goal',
    status: 'VERIFYING',
    history: [],
    agentStatus: [],
    agentResults: {},
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Partial AgentResult for CODE_INTELLIGENCE */
function ciResult(
  affectedFiles: string[],
  affectedFunctions: string[],
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH',
): Partial<AgentResult> {
  return {
    agent: 'CODE_INTELLIGENCE',
    status: 'SUCCESS',
    task: { taskId: 't', agent: 'CODE_INTELLIGENCE', goal: 'g', assignedAt: '' },
    findings: { affectedFiles, affectedFunctions, riskLevel, recommendation: '' },
    filesExamined: [],
    filesModified: [],
    confidence: 'HIGH',
    recommendedNextAction: '',
    completedAt: '',
  };
}

/** Partial AgentResult for TEST_QA */
function qaResult(totalTests: number): Partial<AgentResult> {
  return {
    agent: 'TEST_QA',
    status: 'SUCCESS',
    task: { taskId: 't', agent: 'TEST_QA', goal: 'g', assignedAt: '' },
    testResult: {
      totalTests,
      passed: totalTests,
      failed: 0,
      failures: [],
      executedAt: '',
    },
    filesExamined: [],
    filesModified: [],
    confidence: 'HIGH',
    recommendedNextAction: '',
    completedAt: '',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeRiskAssessment', () => {
  test('low-risk scenario: few files/functions, LOW dependency', () => {
    const state = makeState({
      agentResults: {
        CODE_INTELLIGENCE: ciResult(['a.ts'], ['fn1'], 'LOW') as AgentResult,
        TEST_QA: qaResult(10) as AgentResult,
      },
    });

    const result = computeRiskAssessment(state);

    // 1 file * 10 + 1 function * 5 + 0 (LOW) = 15
    expect(result.filesAffected).toBe(1);
    expect(result.functionsAffected).toBe(1);
    expect(result.testsCovered).toBe(10);
    expect(result.dependencyImpact).toBe('LOW');
    expect(result.riskPercent).toBe(15);
    expect(result.recommendation).toMatch(/low risk/i);
  });

  test('medium-risk scenario: moderate files/functions, MEDIUM dependency', () => {
    const state = makeState({
      agentResults: {
        CODE_INTELLIGENCE: ciResult(
          ['a.ts', 'b.ts'],
          ['fn1', 'fn2', 'fn3'],
          'MEDIUM',
        ) as AgentResult,
        TEST_QA: qaResult(20) as AgentResult,
      },
    });

    const result = computeRiskAssessment(state);

    // 2 * 10 + 3 * 5 + 15 (MEDIUM) = 50
    expect(result.filesAffected).toBe(2);
    expect(result.functionsAffected).toBe(3);
    expect(result.testsCovered).toBe(20);
    expect(result.dependencyImpact).toBe('MEDIUM');
    expect(result.riskPercent).toBe(50);
    expect(result.recommendation).toMatch(/medium risk/i);
  });

  test('high-risk scenario: many files/functions, HIGH dependency', () => {
    const state = makeState({
      agentResults: {
        CODE_INTELLIGENCE: ciResult(
          ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
          ['fn1', 'fn2', 'fn3', 'fn4', 'fn5', 'fn6'],
          'HIGH',
        ) as AgentResult,
        TEST_QA: qaResult(50) as AgentResult,
      },
    });

    const result = computeRiskAssessment(state);

    // 5 * 10 + 6 * 5 + 30 (HIGH) = 110 → capped at 100
    expect(result.filesAffected).toBe(5);
    expect(result.functionsAffected).toBe(6);
    expect(result.testsCovered).toBe(50);
    expect(result.dependencyImpact).toBe('HIGH');
    expect(result.riskPercent).toBe(100);
    expect(result.recommendation).toMatch(/high risk/i);
  });

  test('missing agentResults returns safe defaults without throwing', () => {
    const state = makeState(); // agentResults: {}

    let result;
    expect(() => {
      result = computeRiskAssessment(state);
    }).not.toThrow();

    expect(result!.filesAffected).toBe(0);
    expect(result!.functionsAffected).toBe(0);
    expect(result!.testsCovered).toBe(0);
    expect(result!.dependencyImpact).toBe('LOW');
    expect(result!.riskPercent).toBe(0);
    expect(result!.recommendation).toMatch(/low risk/i);
  });

  test('riskPercent is capped at 100 regardless of inputs', () => {
    // 10 files * 10 + 10 functions * 5 + 30 (HIGH) = 280 → 100
    const state = makeState({
      agentResults: {
        CODE_INTELLIGENCE: ciResult(
          Array.from({ length: 10 }, (_, i) => `file${i}.ts`),
          Array.from({ length: 10 }, (_, i) => `fn${i}`),
          'HIGH',
        ) as AgentResult,
      },
    });

    const result = computeRiskAssessment(state);
    expect(result.riskPercent).toBe(100);
  });
});
