/**
 * tests/utils/repoRoot.test.ts
 *
 * Verifies that findRepoRoot() resolves to the correct directory regardless of
 * whether the caller is running from:
 *   (a) the TypeScript source layout  — backend/src/agents/   (dev via tsx)
 *   (b) the compiled dist layout      — backend/dist/src/agents/ (prod via node)
 *
 * For the prod scenario the dist/src/agents/ directory does not need to exist
 * physically — findRepoRoot walks up from whatever path is provided and stops as
 * soon as it finds a real directory that contains 'ecommerce-demo'.  The test
 * constructs a synthetic path rooted at the real repo root so the walk succeeds.
 */

import { describe, test, expect } from 'vitest';
import * as path from 'path';
import { findRepoRoot, REPO_ROOT } from '../../src/utils/repoRoot.js';

// The actual repo root is the directory that contains both 'backend/' and
// 'ecommerce-demo/'.  We derive it from the test file's own __dirname so the
// test is location-independent.
//   __dirname here = backend/tests/utils/
//   ../../../      = repo root (agentflow/)
const ACTUAL_REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

describe('findRepoRoot', () => {
  test('dev scenario: resolves from backend/src/agents (3 levels inside repo root)', () => {
    // Simulates the runtime __dirname of a compiled src/agents/*.ts file when
    // running via tsx — the source directory exists on disk.
    const devAgentsDir = path.join(ACTUAL_REPO_ROOT, 'backend', 'src', 'agents');
    expect(findRepoRoot(devAgentsDir)).toBe(ACTUAL_REPO_ROOT);
  });

  test('prod scenario: resolves from backend/dist/src/agents (4 levels inside repo root)', () => {
    // Simulates the runtime __dirname of a compiled agent after `tsc` with
    // outDir:"dist".  The dist/src/agents directory may not exist on disk —
    // findRepoRoot walks up through ancestor directories, which DO exist,
    // until it reaches a directory that contains 'ecommerce-demo'.
    const prodAgentsDir = path.join(ACTUAL_REPO_ROOT, 'backend', 'dist', 'src', 'agents');
    // findRepoRoot will walk: dist/src/agents → dist/src → dist → backend → repo root ✓
    expect(findRepoRoot(prodAgentsDir)).toBe(ACTUAL_REPO_ROOT);
  });

  test('error scenario: throws when no ancestor contains ecommerce-demo', () => {
    // Use a temp-like path that will never have an ecommerce-demo ancestor.
    // path.parse('/').root is '/' on POSIX and e.g. 'C:\' on Windows — either
    // way it has no ecommerce-demo child, so the walk reaches the FS root and throws.
    const isolatedPath = path.parse(ACTUAL_REPO_ROOT).root;
    expect(() => findRepoRoot(isolatedPath)).toThrowError(/ecommerce-demo/);
  });
});

describe('REPO_ROOT module constant', () => {
  test('equals the actual repo root at runtime', () => {
    // REPO_ROOT is derived from the utility file's own __dirname.
    // Under tsx: backend/src/utils/ → 3 levels up → repo root.
    // Under node dist/: backend/dist/src/utils/ → 4 levels up → repo root.
    // Either way it must equal ACTUAL_REPO_ROOT.
    expect(REPO_ROOT).toBe(ACTUAL_REPO_ROOT);
  });
});
