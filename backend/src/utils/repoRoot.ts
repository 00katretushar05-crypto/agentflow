/**
 * repoRoot.ts
 *
 * Resolves the absolute path to the repo root by walking upward from a given
 * starting directory until it finds a directory that contains 'ecommerce-demo'.
 *
 * Why walk upward instead of using a fixed relative path?
 * When TypeScript compiles with rootDir:"." and outDir:"dist", the compiled
 * agents land at backend/dist/src/agents/ — one extra level deeper than the
 * source files at backend/src/agents/. A hardcoded '../../../' traversal points
 * to the wrong directory in production. Walking upward is depth-independent and
 * works correctly regardless of whether code runs via tsx (dev) or node dist/ (prod).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

/**
 * Walk upward from `startDir` until a directory is found that contains a child
 * named 'ecommerce-demo'. Returns the absolute path of that ancestor directory
 * (i.e. the repo root), NOT the ecommerce-demo directory itself.
 *
 * Exported so tests can call it with synthetic directory paths to verify both
 * the src-depth (dev) and dist-depth (prod) scenarios without touching the real
 * filesystem layout.
 *
 * @throws {Error} If no such ancestor is found before reaching the filesystem root.
 */
export function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fs.existsSync(path.join(current, 'ecommerce-demo'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // Reached the filesystem root without finding ecommerce-demo.
      throw new Error(
        `findRepoRoot: could not locate a directory containing 'ecommerce-demo' ` +
          `while walking up from '${startDir}'. ` +
          `Check that the ecommerce-demo folder is present in the repository root.`,
      );
    }
    current = parent;
  }
}

/**
 * Absolute path to the repository root (the directory that contains
 * 'ecommerce-demo' as a direct child).  Resolved once at module-load time.
 */
export const REPO_ROOT: string = findRepoRoot(
  path.dirname(fileURLToPath(import.meta.url)),
);

/**
 * Absolute path to the ecommerce-demo directory itself.
 * Agents should import this constant — it replaces the old hardcoded
 *   `path.resolve(__dirname, '..', '..', '..', 'ecommerce-demo')`
 * pattern that breaks in the compiled dist/ layout.
 *
 * Usage in an agent:
 *   import { ECOMMERCE_ROOT } from '../utils/repoRoot.js';
 *   const jestBin = path.join(ECOMMERCE_ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
 */
export const ECOMMERCE_ROOT: string = path.join(REPO_ROOT, 'ecommerce-demo');
