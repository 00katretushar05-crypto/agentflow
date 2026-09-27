/**
 * testQA.ts
 *
 * TEST_QA agent — inspects ecommerce-demo/tests/, identifies relevant and
 * missing tests for the task goal, then executes the Jest suite and captures
 * structured pass/fail results.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import type { AgentTask, AgentResult, TestResult } from '../types/contracts.js';
import { ECOMMERCE_ROOT as REPO_ROOT } from '../utils/repoRoot.js';

/** Sentinel used in the testResult when Jest could not execute at all.
 *  Distinguishable from a real run because totalTests === -1. */
export const JEST_EXEC_FAILURE_SENTINEL = -1;

/**
 * Injectable I/O layer — lets tests swap out existsSync / execSync without
 * spying on sealed Node built-in module exports (which Vitest cannot patch in
 * ESM context).  Production code always uses the real implementations; tests
 * may override individual fields on this object.
 *
 * @internal  Not part of the public agent API — exported only for tests.
 */
export const _io = {
  existsSync: (p: fs.PathLike): boolean => fs.existsSync(p),
  execSync: (cmd: string, opts: Parameters<typeof childProcess.execSync>[1]): string =>
    childProcess.execSync(cmd, opts) as string,
};

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

type JestRunResult =
  | { ok: true; output: string }
  | { ok: false; reason: string };

function runJest(): JestRunResult {
  // Guard: jest binary must exist — if node_modules is absent the process
  // cannot launch at all and we must not silently report zero tests.
  const jestEntry = path.join(REPO_ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
  if (!_io.existsSync(jestEntry)) {
    return {
      ok: false,
      reason:
        'ecommerce-demo dependencies not installed. Run `npm install` in ecommerce-demo before running tests.',
    };
  }

  const cmd = `node "${jestEntry}" --json --no-coverage`;

  try {
    const output = _io.execSync(cmd, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 30_000,
    });
    return { ok: true, output };
  } catch (err: unknown) {
    // execSync throws when exit code is non-zero.  Jest exits non-zero when
    // tests fail but still writes valid JSON to stdout — recover that output
    // so the caller can parse real results.  If stdout is empty or absent,
    // there was a process-level failure (crash, timeout, ENOENT, etc.).
    if (err && typeof err === 'object' && 'stdout' in err) {
      const stdout = (err as { stdout: string }).stdout ?? '';
      if (stdout.trim().length > 0) {
        return { ok: true, output: stdout };
      }
      // Non-zero exit AND no output — genuine execution failure.
      const stderr =
        (err as { stderr?: string }).stderr?.trim() ?? '';
      const message =
        (err as { message?: string }).message?.trim() ?? 'unknown error';
      return {
        ok: false,
        reason: `Jest process failed to execute: ${stderr || message}`,
      };
    }
    // Thrown error without exec shape (e.g. programmatic error in this code).
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Jest process failed to execute: ${message}` };
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

  const jestRun = runJest();

  // Execution failure — node_modules missing or process crashed.
  // Return FAILURE immediately so the Supervisor never mistakes this for
  // "all tests passed" (totalTests === 0 with no failures is ambiguous).
  if (!jestRun.ok) {
    return {
      agent: 'TEST_QA',
      status: 'FAILURE',
      task,
      testResult: {
        // Sentinel value: -1 is never a valid Jest test count and signals
        // that no tests ran due to an infrastructure problem, not a clean run.
        totalTests: JEST_EXEC_FAILURE_SENTINEL,
        passed: 0,
        failed: 0,
        failures: [],
        executedAt: new Date().toISOString(),
      },
      filesExamined,
      filesModified: [],
      confidence: 'LOW',
      recommendedNextAction: jestRun.reason,
      completedAt: new Date().toISOString(),
    };
  }

  let jestOutput: JestJsonOutput | null = null;
  try {
    jestOutput = JSON.parse(jestRun.output) as JestJsonOutput;
  } catch {
    // JSON parse failed after a seemingly successful process exit — treat as
    // execution failure for the same reason: we cannot report zero tests here.
    return {
      agent: 'TEST_QA',
      status: 'FAILURE',
      task,
      testResult: {
        totalTests: JEST_EXEC_FAILURE_SENTINEL,
        passed: 0,
        failed: 0,
        failures: [],
        executedAt: new Date().toISOString(),
      },
      filesExamined,
      filesModified: [],
      confidence: 'LOW',
      recommendedNextAction:
        'Jest produced non-JSON output — the process may have printed a startup error. Check ecommerce-demo/node_modules and Jest configuration.',
      completedAt: new Date().toISOString(),
    };
  }

  const failures = jestOutput.testResults
    .flatMap(suite => suite.assertionResults ?? [])
    .filter(t => t.status === 'failed')
    .map(t => ({
      testName: t.fullName,
      expected: extractExpected(t.failureMessages[0] ?? ''),
      received: extractReceived(t.failureMessages[0] ?? ''),
    }));

  const testResult: TestResult = {
    totalTests: jestOutput.numTotalTests,
    passed: jestOutput.numPassedTests,
    failed: jestOutput.numFailedTests,
    failures,
    executedAt: new Date().toISOString(),
  };

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

  // totalTests === 0 means the suite is empty (e.g. no test files), not an
  // execution failure — execution failures are caught above and return early.
  const status =
    testResult.failed === 0 ? ('SUCCESS' as const) : ('PARTIAL' as const);

  // ----- Fragile-coverage detection ----------------------------------------
  // A file is flagged "do not modify" when it has active tests whose coverage is
  // currently fragile: either the tests are already failing (any change risks
  // silent breakage) or the file is covered by relevant tests with no safety net
  // (failed > 0 in the relevant test suite).
  const doNotModify: string[] = [];

  if (testResult.failed > 0) {
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
    confidence: 'HIGH',
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