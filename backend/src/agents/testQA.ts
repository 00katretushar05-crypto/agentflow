/**
 * testQA.ts
 *
 * TEST_QA agent — inspects ecommerce-demo/tests/, identifies relevant and
 * missing tests for the task goal, then executes the Jest suite and captures
 * structured pass/fail results.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'node:url';
import type { AgentTask, AgentResult, TestResult } from '../types/contracts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', 'ecommerce-demo');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------


/**
 * Collect all .js/.ts source files under `dir` whose path contains `stem`
 * (case-insensitive).  Used to map failing test file names back to the source
 * files they exercise.
 */
function walkSrcForStem(dir: string, stem: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSrcForStem(fullPath, stem));
    } else if (
      entry.isFile() &&
      /\.[jt]s$/.test(entry.name) &&
      entry.name.toLowerCase().includes(stem.toLowerCase())
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

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

function relevanceScore(source: string, goal: string): number {
  const goalWords = goal.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const lowerSource = source.toLowerCase();
  return goalWords.reduce((acc, word) => acc + (lowerSource.includes(word) ? 1 : 0), 0);
}

function runJest(): string {
  const jestEntry = path.join(REPO_ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
  const cmd = `node "${jestEntry}" --json --no-coverage`;

  try {
    return execSync(cmd, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 30_000,
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stdout' in err) {
      return (err as { stdout: string }).stdout ?? '';
    }
    return '';
  }
}

interface JestAssertionResult {
  title: string;
  fullName: string;
  status: 'passed' | 'failed' | 'pending';
  failureMessages: string[];
}

interface JestTestSuiteResult {

  testFilePath: string;

  /** Absolute path to the test file — Jest uses "name" in its --json output. */
  name: string;
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

export async function runTestQA(task: AgentTask): Promise<AgentResult> {
  const testsDir = path.join(REPO_ROOT, 'tests');
  const allTestFiles = collectTestFiles(testsDir);

  const filesExamined = allTestFiles.map(f =>
    path.relative(REPO_ROOT, f).replace(/\\/g, '/'),
  );

  const relevantFiles = allTestFiles.filter(absPath => {
    const source = fs.readFileSync(absPath, 'utf-8');
    return relevanceScore(source, task.goal) > 0;
  });

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
    testResult = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      failures: [],
      executedAt: new Date().toISOString(),
    };
  }

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

  // ----- Fragile-coverage detection ----------------------------------------
  // A file is flagged "do not modify" when it has active tests whose coverage is
  // currently fragile: either the tests are already failing (any change risks
  // silent breakage) or the file is covered by relevant tests with no safety net
  // (failed > 0 in the relevant test suite).
  const doNotModify: string[] = [];

  if (testResult.failed > 0 && jestOutput !== null) {
    // Collect the set of source files exercised by failing test suites.
    for (const suite of jestOutput.testResults) {
      const hasFailure = (suite.assertionResults ?? []).some(a => a.status === 'failed');
      if (!hasFailure) continue;

      // The test file name (e.g. "checkout.test.js") implies coverage of the
      // corresponding source module (e.g. "checkout").  Find all src files
      // whose module name matches the stem of the failing test file.
      const testStem = path.basename(suite.name ?? '').replace(/\.test\.[jt]s$/, '');
      if (!testStem) continue;
      const srcFilesForStem = walkSrcForStem(srcDir, testStem);

      for (const f of srcFilesForStem) {
        const rel = path.relative(REPO_ROOT, f).replace(/\\/g, '/');
        if (!doNotModify.includes(rel)) doNotModify.push(rel);
      }
    }
  }

  return {
    agent: 'TEST_QA',
    status,
    task,
    testResult,
    filesExamined,
    filesModified: [],
    doNotModify: doNotModify.length > 0 ? doNotModify : undefined,
    confidence: jestOutput !== null ? 'HIGH' : 'LOW',
    recommendedNextAction:
      testResult.failed > 0
        ? `Escalate ${testResult.failed} failing test(s) to DEBUG_REVIEW agent. ${regressionRisk}${missingNote} ${relevantNote}`
        : `All tests pass. ${missingNote} ${relevantNote}`,
    completedAt: new Date().toISOString(),
  };
}

function extractExpected(msg: string): string {
  const m = msg.match(/Expected[^:]*:\s*(.+)/);
  return m?.[1]?.trim() ?? '(see failure message)';
}

function extractReceived(msg: string): string {
  const m = msg.match(/Received[^:]*:\s*(.+)/);
  return m?.[1]?.trim() ?? '(see failure message)';
}