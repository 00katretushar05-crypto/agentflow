# Plan: Fix ecommerce-demo Path Resolution for Production (Render)

## Top-Level Overview

Three backend agents — `testQA.ts`, `debugReview.ts`, and `codeIntelligence.ts` — resolve the
path to `ecommerce-demo` using a fixed relative traversal from `__dirname`:

```ts
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', 'ecommerce-demo');
```

This is correct when running from source via `tsx` / Vitest (where `__dirname` points to
`backend/src/agents/`), but **wrong** after `tsc` compilation (where `__dirname` points to
`backend/dist/src/agents/`). In production the three `..` jumps land at `backend/` instead of
the repo root `agentflow/`, so `ecommerce-demo` is never found and every agent returns
`totalTests: -1` / `status: FAILURE`.

### Compilation depth difference

| Runtime            | `__dirname`                          | After `../../../` |
|--------------------|--------------------------------------|-------------------|
| `tsx` (dev)        | `.../agentflow/backend/src/agents`   | `.../agentflow`   |
| `node dist/` (prod)| `.../agentflow/backend/dist/src/agents` | `.../agentflow/backend` |

The compiled path needs **four** `..` steps, not three.

### Chosen Fix Approach

Introduce a single shared utility module `backend/src/utils/repoRoot.ts` that resolves the
repo root at runtime by **walking up from `__dirname` until it finds the directory that
contains the `ecommerce-demo` folder** (or until it reaches the filesystem root and throws).
This is the most robust option: it works regardless of whether TypeScript adds an extra
`dist/` layer, and it is independent of an environment variable that could be forgotten.

All three agents replace their inline `REPO_ROOT` constant with an import of this utility.
The two affected test files (`testQA.test.ts`, `debugReview.test.ts`) already resolve
`CHECKOUT_JS` / `ECOMMERCE_ROOT` using their own hardcoded traversal from `__dirname` —
these also need updating to use the shared utility (or be left as-is since they run under
Vitest which never adds the `dist/` layer; see Sub-task 3 for decision).

A **new test file** `backend/tests/utils/repoRoot.test.ts` verifies:
1. `findRepoRoot(actualBackendSrcAgentsDir)` → correct repo root (3 levels up, dev scenario)
2. `findRepoRoot(actualBackendDistSrcAgentsDir)` → same correct repo root (4 levels up, prod scenario)
3. `findRepoRoot('/tmp')` → throws a descriptive error (safety net)

---

## Sub-tasks

---

### Sub-task 1 — Create `backend/src/utils/repoRoot.ts`

**Status:** `[ ] pending`

**Intent**
Centralise the `ecommerce-demo` path resolution in a single place so every agent imports the
same battle-tested logic instead of each hardcoding its own `..` count.

**Expected Outcomes**
- `backend/src/utils/repoRoot.ts` exists and exports a `findRepoRoot(startDir: string): string`
  function.
- The function walks up the directory tree from `startDir`, returning the first directory that
  contains a child named `ecommerce-demo`.
- If no such ancestor is found before reaching the filesystem root, it throws a clear
  `Error` naming the start directory — this surfaces misconfigurations immediately rather
  than silently returning a wrong path.
- The module also exports a ready-to-use `REPO_ROOT` constant (computed once at module load
  from `__dirname` of the utility file itself) so agents can do a single import with no
  boilerplate.

**Todo List**
1. Create `backend/src/utils/repoRoot.ts`.
2. Implement `findRepoRoot(startDir: string): string` — walk upward with `fs.existsSync`,
   stop when `path.join(candidate, 'ecommerce-demo')` exists.
3. Export a module-level `REPO_ROOT` constant: `findRepoRoot(path.dirname(fileURLToPath(import.meta.url)))`.
4. Export `findRepoRoot` for direct use in tests (so tests can pass synthetic `startDir` values).

**Relevant Context**
- `backend/src/agents/testQA.ts` lines 19-22 — current path resolution pattern
- `backend/tsconfig.json` — `rootDir: "."`, `outDir: "dist"` confirming compiled depth

---

### Sub-task 2 — Update the three agents to use `repoRoot.ts`

**Status:** `[ ] pending`

**Intent**
Remove the three duplicated inline `REPO_ROOT` calculations and replace them with the
imported constant from the new utility. This is the actual production fix.

**Expected Outcomes**
- `backend/src/agents/testQA.ts`, `debugReview.ts`, and `codeIntelligence.ts` each:
  - Delete the `fileURLToPath` / `path.dirname` / `path.resolve('../../../ecommerce-demo')` block.
  - Import `REPO_ROOT` from `'../utils/repoRoot.js'`.
  - All downstream uses of `REPO_ROOT` are unchanged.
- TypeScript strict-mode compilation passes (`npx tsc --noEmit`).

**Todo List**
1. In `testQA.ts`: remove lines 19-22; add `import { REPO_ROOT } from '../utils/repoRoot.js';`.
2. In `debugReview.ts`: same removal and import (lines 21-24).
3. In `codeIntelligence.ts`: same removal and import (lines 17-21).
4. Remove any now-unused `fileURLToPath` / `node:url` imports from all three files.
5. Run `npx tsc --noEmit` from `backend/` — confirm zero errors.

**Relevant Context**
- `backend/src/agents/testQA.ts` — `_io` object and `JEST_EXEC_FAILURE_SENTINEL` export must be
  preserved exactly; only the `REPO_ROOT` derivation changes.
- `backend/src/agents/codeIntelligence.ts` lines 17-21 — identical pattern.

---

### Sub-task 3 — Add `repoRoot.test.ts` and update existing path references in test files

**Status:** `[ ] pending`

**Intent**
Prove that `findRepoRoot` is correct for both the source and compiled directory depths, and
ensure existing test-file path helpers also survive (they currently hardcode `../../../` which
works only because Vitest runs without compilation).

**Expected Outcomes**
- New file `backend/tests/utils/repoRoot.test.ts` contains three tests:
  1. **dev scenario**: `findRepoRoot` given `<repoRoot>/backend/src/agents` returns `<repoRoot>`.
  2. **prod scenario**: `findRepoRoot` given `<repoRoot>/backend/dist/src/agents` returns
     `<repoRoot>` (the `dist/src/agents` directory does not need to physically exist — the
     function walks up regardless).
  3. **error scenario**: `findRepoRoot('/tmp')` (or any path with no `ecommerce-demo` ancestor)
     throws an error containing `'ecommerce-demo'` in the message.
- `backend/tests/agents/testQA.test.ts` and `debugReview.test.ts` import `REPO_ROOT` from
  `../../src/utils/repoRoot.js` instead of computing paths inline — this makes the test
  helper paths consistent with production.
- `npx vitest run` from `backend/` — all existing and new tests pass.

**Todo List**
1. Create `backend/tests/utils/repoRoot.test.ts` with the three scenarios described above.
2. Update `testQA.test.ts` line 15: replace inline `path.resolve(__dirname, '..', '..', '..',
   'ecommerce-demo', ...)` with `path.join(REPO_ROOT, 'src', 'checkout', 'checkout.js')`.
3. Update `debugReview.test.ts` lines 27-33: replace both inline constants (`CHECKOUT_JS`,
   `ECOMMERCE_ROOT`) with `path.join(REPO_ROOT, ...)`.
4. Run `npx vitest run` from `backend/` and confirm all tests pass, including the new ones.
5. Confirm `npx tsc --noEmit` still reports zero errors after the test-file changes.

**Relevant Context**
- `backend/tests/agents/testQA.test.ts` line 15 — current inline path
- `backend/tests/agents/debugReview.test.ts` lines 27-33 — current inline paths
- `backend/vitest.config.ts` — `fileParallelism: false` (sequential, no changes needed)

---

## What Does NOT Change

- Agent business logic — only the `REPO_ROOT` derivation changes, nothing else.
- `contracts.ts` — no new types needed.
- `vitest.config.ts` — sequential execution is still required; no changes.
- Test sentinel values, `_io` export shape, or any other public API surface.
