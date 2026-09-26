/**
 * testQA.ts
 *
 * TEST_QA agent — inspects ecommerce-demo/tests/, identifies relevant and
 * missing tests for the task goal, then executes the Jest suite and captures
 * structured pass/fail results.
 *
 * Steps:
 *   1. Scan tests/ for existing test files
 *   2. Identify which tests are relevant to the goal (keyword match)
 *   3. Run Jest (child_process) and parse JSON output into TestResult
 *   4. Detect missing test coverage areas
 *   5. Return AgentResult with populated testResult
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { AgentTask, AgentResult, TestResult } from '../types/contracts';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', 'ecommerce-demo');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Collect all .test.js files under `dir`. */
function collectTestFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTestFiles(fullPath));
    } else if (entry.isFile() && /\.test\.[jt]s$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Score relevance of a file to the task goal (same heuristic as codeIntelligence). */
function relevanceScore(source: string, goal: string): number {
  const goalWords = goal.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const lowerSource = source.toLowerCase();
  return goalWords.reduce((acc, word) => acc + (lowerSource.includes(word) ? 1 : 0), 0);
}

/** Run Jest in the ecommerce-demo directory, returning raw JSON output. */
function runJest(): string {
  // Jest --json writes structured results to stdout
  const jestBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'jest');
  const cmd = `"${jestBin}" --json --no-coverage 2>/dev/null`;

  try {
    // Jest exits non-zero on test failures; we still want the stdout JSON
    return execSync(cmd, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 30_000,
    });
  } catch (err: unknown) {
    // execSync throws on non-zero exit; stdout is on err.stdout
    if (err && typeof err === 'object' && 'stdout' in err) {
      return (err as { stdout: string }).stdout ?? '';
    }
    return '';
  }
}

// ---------------------------------------------------------------------------
// Jest JSON result shape (subset we need)
// ---------------------------------------------------------------------------
interface JestAssertionResult {
  title: string;
  fullName: string;
  status: 'passed' | 'failed' | 'pending';
  failureMessages: string[];
}

interface JestTestSuiteResult {
  testFilePath: string;
  /** Jest uses "assertionResults" in --json output (not "testResults") */
  assertionResults: JestAssertionResult[];
}

interface JestJsonOutput {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: JestTestSuiteResult[];
}

// ---------------------------------------------------------------------------
// Public agent entry-point
// ---------------------------------------------------------------------------

export async function runTestQAAgent(task: AgentTask): Promise<AgentResult> {
  const testsDir = path.join(REPO_ROOT, 'tests');
  const allTestFiles = collectTestFiles(testsDir);

  const filesExamined = allTestFiles.map(f =>
    path.relative(REPO_ROOT, f).replace(/\\/g, '/'),
  );

  // Identify relevant test files for the goal
  const relevantFiles = allTestFiles.filter(absPath => {
    const source = fs.readFileSync(absPath, 'utf-8');
    return relevanceScore(source, task.goal) > 0;
  });

  // Run Jest and parse results
  const raw = runJest();

  let jestOutput: JestJsonOutput | null = null;
  try {
    jestOutput = JSON.parse(raw) as JestJsonOutput;
  } catch {
    // JSON parse failed — Jest may not be installed in ecommerce-demo
  }

  let testResult: TestResult;

  if (jestOutput !== null) {
    const failures = jestOutput.testResults
      .flatMap(suite => suite.assertionResults ?? [])
      .filter(t => t.status === 'failed')
      .map(t => ({
        testName: t.fullName,
        expected: extractExpected(t.failureMessages[0] ?? ''),
        received: extractReceived(t.failureMessages[0] ?? ''),
      }));

    testResult = {
      totalTests: jestOutput.numTotalTests,
      passed: jestOutput.numPassedTests,
      failed: jestOutput.numFailedTests,
      failures,
      executedAt: new Date().toISOString(),
    };
  } else {
    // Jest not runnable — report what we found statically
    testResult = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      failures: [],
      executedAt: new Date().toISOString(),
    };
  }

  // Identify missing coverage areas
  const srcDir = path.join(REPO_ROOT, 'src');
  const testedModules = new Set(
    allTestFiles.map(f => path.basename(f).replace(/\.test\.[jt]s$/, '')),
  );
  const srcModules = fs.existsSync(srcDir)
    ? fs.readdirSync(srcDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
    : [];
  const untestedModules = srcModules.filter(m => !testedModules.has(m));

  const hasMissingTests = untestedModules.length > 0;
  const missingNote = hasMissingTests
    ? ` Missing test coverage for modules: ${untestedModules.join(', ')}.`
    : '';

  const regressionRisk = testResult.failed > 0
    ? `${testResult.failed} test(s) failing — regression risk is HIGH.`
    : 'All tests passing — regression risk is LOW.';

  const relevantNote = relevantFiles.length > 0
    ? `Relevant test files for goal: ${relevantFiles.map(f => path.relative(REPO_ROOT, f).replace(/\\/g, '/')).join(', ')}.`
    : 'No test files matched goal keywords directly.';

  const status =
    testResult.totalTests === 0
      ? ('PARTIAL' as const)
      : testResult.failed === 0
        ? ('SUCCESS' as const)
        : ('PARTIAL' as const);

  return {
    agent: 'TEST_QA',
    status,
    task,
    testResult,
    filesExamined,
    filesModified: [],
    confidence: jestOutput !== null ? 'HIGH' : 'LOW',
    recommendedNextAction:
      testResult.failed > 0
        ? `Escalate ${testResult.failed} failing test(s) to DEBUG_REVIEW agent. ${regressionRisk}${missingNote} ${relevantNote}`
        : `All tests pass. ${missingNote} ${relevantNote}`,
    completedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Parse Jest failure message for expected/received values
// ---------------------------------------------------------------------------

function extractExpected(msg: string): string {
  const m = msg.match(/Expected[^:]*:\s*(.+)/);
  return m?.[1]?.trim() ?? '(see failure message)';
}

function extractReceived(msg: string): string {
  const m = msg.match(/Received[^:]*:\s*(.+)/);
  return m?.[1]?.trim() ?? '(see failure message)';
}
