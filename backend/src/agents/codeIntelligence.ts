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
import type { AgentTask, AgentResult, Finding } from '../types/contracts.js';
import { ECOMMERCE_ROOT as REPO_ROOT } from '../utils/repoRoot.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

function extractFunctionNames(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(/^function\s+(\w+)\s*\(/gm)) {
    names.push(m[1]!);
  }
  for (const m of source.matchAll(/^(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\()/gm)) {
    names.push(m[1]!);
  }
  return names;
}

function extractRequires(source: string): string[] {
  const deps: string[] = [];
  for (const m of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    deps.push(m[1]!);
  }
  return deps;
}

function relevanceScore(source: string, goal: string): number {
  const goalWords = goal.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const lowerSource = source.toLowerCase();
  return goalWords.reduce((acc, word) => acc + (lowerSource.includes(word) ? 1 : 0), 0);
}

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

export async function runCodeIntelligence(task: AgentTask): Promise<AgentResult> {
  const srcDir = path.join(REPO_ROOT, 'src');
  const allFiles = collectJsFiles(srcDir);

  const dependencyGraph = new Map<string, string[]>();
  const fileFunctions = new Map<string, string[]>();
  const filesExamined: string[] = [];

  for (const absPath of allFiles) {
    const repoRel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    filesExamined.push(repoRel);

    const source = fs.readFileSync(absPath, 'utf-8');
    fileFunctions.set(repoRel, extractFunctionNames(source));

    const rawDeps = extractRequires(source);
    const resolvedDeps: string[] = [];
    for (const dep of rawDeps) {
      if (!dep.startsWith('.')) continue;
      const absDepPath = path.resolve(path.dirname(absPath), dep);
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

  const finalAffected = affectedFiles.length > 0 ? affectedFiles : filesExamined;
  const finalFunctions = affectedFunctions.length > 0
    ? [...new Set(affectedFunctions)]
    : [...new Set([...fileFunctions.values()].flat())];

  const riskLevel = estimateRisk(finalAffected, dependencyGraph);

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