/**
 * codeIntelligence.ts
 *
 * CODE_INTELLIGENCE agent — inspects the ecommerce-demo source tree to:
 *   1. Walk all .js files under ecommerce-demo/src/
 *   2. Identify files/functions relevant to the task goal (keyword match)
 *   3. Build a dependency map from require() calls
 *   4. Estimate change risk based on dependency depth and cross-module coupling
 *   5. Return a structured AgentResult with a populated Finding
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AgentTask, AgentResult, Finding } from '../types/contracts';

/** Absolute path to the ecommerce-demo repo (relative to this file at runtime). */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', 'ecommerce-demo');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Recursively collect all .js files under `dir`. */
function collectJsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Extract exported function names via a simple regex over the source text. */
function extractFunctionNames(source: string): string[] {
  const names: string[] = [];
  // function declarations: function foo(
  for (const m of source.matchAll(/^function\s+(\w+)\s*\(/gm)) {
    names.push(m[1]!);
  }
  // const foo = function( or const foo = (
  for (const m of source.matchAll(/^(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\()/gm)) {
    names.push(m[1]!);
  }
  return names;
}

/** Extract require() paths from source text. Returns relative paths as written. */
function extractRequires(source: string): string[] {
  const deps: string[] = [];
  for (const m of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    deps.push(m[1]!);
  }
  return deps;
}

/** Score relevance of a file to the task goal (0 = irrelevant, higher = more relevant). */
function relevanceScore(source: string, goal: string): number {
  const goalWords = goal.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const lowerSource = source.toLowerCase();
  return goalWords.reduce((acc, word) => acc + (lowerSource.includes(word) ? 1 : 0), 0);
}

/**
 * Determine risk level.
 *
 * Heuristic:
 *  - HIGH   if a file is required by ≥ 2 other source files (wide coupling)
 *  - MEDIUM if relevant files span multiple modules
 *  - LOW    otherwise
 */
function estimateRisk(
  affectedFiles: string[],
  dependencyGraph: Map<string, string[]>,
): Finding['riskLevel'] {
  const incomingCount = new Map<string, number>();
  for (const [, deps] of dependencyGraph) {
    for (const dep of deps) {
      incomingCount.set(dep, (incomingCount.get(dep) ?? 0) + 1);
    }
  }

  const highCoupling = affectedFiles.some(f => (incomingCount.get(f) ?? 0) >= 2);
  if (highCoupling) return 'HIGH';

  const modules = new Set(affectedFiles.map(f => f.split('/')[1]));
  if (modules.size > 1) return 'MEDIUM';

  return 'LOW';
}

// ---------------------------------------------------------------------------
// Public agent entry-point
// ---------------------------------------------------------------------------

export async function runCodeIntelligenceAgent(task: AgentTask): Promise<AgentResult> {
  const srcDir = path.join(REPO_ROOT, 'src');
  const allFiles = collectJsFiles(srcDir);

  // Build dependency graph and extract function names, keyed by repo-relative path
  const dependencyGraph = new Map<string, string[]>(); // repoRelPath → [repoRelPath…]
  const fileFunctions = new Map<string, string[]>(); // repoRelPath → functionNames[]
  const filesExamined: string[] = [];

  for (const absPath of allFiles) {
    const repoRel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    filesExamined.push(repoRel);

    const source = fs.readFileSync(absPath, 'utf-8');
    fileFunctions.set(repoRel, extractFunctionNames(source));

    // Resolve require() calls relative to the containing file
    const rawDeps = extractRequires(source);
    const resolvedDeps: string[] = [];
    for (const dep of rawDeps) {
      if (!dep.startsWith('.')) continue; // skip node_modules
      const absDepPath = path.resolve(path.dirname(absPath), dep);
      // Try with .js extension if needed
      const candidates = [absDepPath, `${absDepPath}.js`];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          resolvedDeps.push(path.relative(REPO_ROOT, c).replace(/\\/g, '/'));
          break;
        }
      }
    }
    dependencyGraph.set(repoRel, resolvedDeps);
  }

  // Identify files relevant to the task goal
  const affectedFiles: string[] = [];
  const affectedFunctions: string[] = [];

  for (const absPath of allFiles) {
    const repoRel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    const source = fs.readFileSync(absPath, 'utf-8');
    const score = relevanceScore(source, task.goal);
    if (score > 0) {
      affectedFiles.push(repoRel);
      const fns = fileFunctions.get(repoRel) ?? [];
      affectedFunctions.push(...fns);
    }
  }

  // If nothing matched the goal keywords, fall back to all files
  const finalAffected = affectedFiles.length > 0 ? affectedFiles : filesExamined;
  const finalFunctions = affectedFunctions.length > 0
    ? [...new Set(affectedFunctions)]
    : [...new Set([...fileFunctions.values()].flat())];

  const riskLevel = estimateRisk(finalAffected, dependencyGraph);

  // Build a human-readable recommendation
  const depSummary = finalAffected
    .map(f => {
      const deps = dependencyGraph.get(f) ?? [];
      return deps.length > 0 ? `${f} → [${deps.join(', ')}]` : null;
    })
    .filter(Boolean)
    .join('; ');

  const recommendation =
    `${finalAffected.length} file(s) are relevant to "${task.goal}". ` +
    `Dependency edges: ${depSummary || 'none'}. ` +
    `Risk is ${riskLevel} — review all callers before modifying shared services.`;

  const finding: Finding = {
    affectedFiles: finalAffected,
    affectedFunctions: finalFunctions,
    riskLevel,
    recommendation,
  };

  return {
    agent: 'CODE_INTELLIGENCE',
    status: 'SUCCESS',
    task,
    findings: finding,
    filesExamined,
    filesModified: [],
    proposedModifications: finalAffected,
    confidence: riskLevel === 'LOW' ? 'HIGH' : riskLevel === 'MEDIUM' ? 'MEDIUM' : 'LOW',
    recommendedNextAction: 'Proceed to Test & QA analysis.',
    completedAt: new Date().toISOString(),
  };
}
