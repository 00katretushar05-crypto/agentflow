/**
 * api.ts — Express route handlers for the AgentFlow Supervisor API.
 *
 * All routes are mounted under /api.  Every success response uses the
 * `{ data: T }` envelope; every error uses `ApiError` from contracts.ts.
 *
 * SOLE-WRITER RULE: routes only read from the supervisor via exported
 * getters and call the two mutating operations (createTask,
 * approveSupervisorTask).  No direct store access here.
 */

import { Router, type Request, type Response } from 'express';
import type {
  ApiError,
  EvidenceItem,
  TaskHistoryItem,
  AgentResult,
  StateTransition,
} from '../types/contracts.js';
import {
  createTask,
  getRunState,
  getAllRunStates,
  approveSupervisorTask,
} from '../supervisor.js';

export const apiRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/task — create a new supervised task
// ---------------------------------------------------------------------------

apiRouter.post('/task', (req: Request, res: Response) => {
  const goal: unknown = req.body?.goal;

  if (typeof goal !== 'string' || goal.trim().length === 0) {
    res.status(400).json({
      error: 'Request body must include a non-empty "goal" string.',
      code: 'INVALID_REQUEST',
    } satisfies ApiError);
    return;
  }

  const maxRetries: number =
    typeof req.body?.maxRetries === 'number' ? req.body.maxRetries : 2;

  const state = createTask(goal.trim(), maxRetries);

  res.status(201).json({
    data: {
      taskId: state.taskId,
      status: state.status,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/task/:id — full SupervisorTaskState for one task
// ---------------------------------------------------------------------------

apiRouter.get('/task/:id', (req: Request, res: Response) => {
  const taskId = String(req.params['id'] ?? '');
  const state = getRunState(taskId);

  if (!state) {
    res.status(404).json({
      error: 'Run not found',
      code: 'NOT_FOUND',
      taskId,
    } satisfies ApiError);
    return;
  }

  res.json({ data: state });
});

// ---------------------------------------------------------------------------
// GET /api/task/:id/evidence — ordered evidence ledger for one task
// ---------------------------------------------------------------------------

apiRouter.get('/task/:id/evidence', (req: Request, res: Response) => {
  const taskId = String(req.params['id'] ?? '');
  const state = getRunState(taskId);

  if (!state) {
    res.status(404).json({
      error: 'Run not found',
      code: 'NOT_FOUND',
      taskId,
    } satisfies ApiError);
    return;
  }

  // Build the evidence list in chronological order:
  //   1. All StateTransitions from history (with their timestamps)
  //   2. All AgentResults from agentResults (also timestamped)
  // We merge and sort by timestamp so the sequence reflects actual event order.
  const items: EvidenceItem[] = [];

  for (const tx of state.history) {
    items.push({
      seq: 0, // assigned after sort
      type: 'TRANSITION',
      timestamp: tx.timestamp,
      summary: `[${tx.from} → ${tx.to}] ${tx.reason}`,
      payload: tx as StateTransition,
    });
  }

  for (const result of Object.values(state.agentResults)) {
    if (!result) continue;
    items.push({
      seq: 0,
      type: 'AGENT_RESULT',
      timestamp: result.completedAt,
      summary: `[${result.agent}] ${result.status}: ${result.recommendedNextAction}`,
      payload: result as AgentResult,
    });
  }

  // Sort by timestamp ascending, then assign sequential 1-based numbers.
  items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  items.forEach((item, idx) => {
    item.seq = idx + 1;
  });

  res.json({
    data: {
      taskId: state.taskId,
      items,
      updatedAt: state.updatedAt,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/task/:id/approve — human approval gate
// ---------------------------------------------------------------------------

apiRouter.post('/task/:id/approve', (req: Request, res: Response) => {
  const taskId = String(req.params['id'] ?? '');
  const state  = getRunState(taskId);

  if (!state) {
    res.status(404).json({
      error: 'Run not found',
      code: 'NOT_FOUND',
      taskId,
    } satisfies ApiError);
    return;
  }

  if (state.status !== 'AWAITING_APPROVAL') {
    res.status(400).json({
      error: `Task cannot be approved in status "${state.status}". Expected AWAITING_APPROVAL.`,
      code: 'INVALID_REQUEST',
      taskId,
    } satisfies ApiError);
    return;
  }

  const updated = approveSupervisorTask(taskId);
  res.json({ data: { taskId: updated.taskId, status: updated.status } });
});

// ---------------------------------------------------------------------------
// GET /api/tasks — list all tasks (compact rows)
// ---------------------------------------------------------------------------

apiRouter.get('/tasks', (_req: Request, res: Response) => {
  const tasks: TaskHistoryItem[] = getAllRunStates().map((s) => ({
    taskId:     s.taskId,
    goal:       s.goal,
    status:     s.status,
    retryCount: s.retryCount,
    maxRetries: s.maxRetries,
    createdAt:  s.createdAt,
    updatedAt:  s.updatedAt,
  }));

  res.json({ data: { tasks } });
});
