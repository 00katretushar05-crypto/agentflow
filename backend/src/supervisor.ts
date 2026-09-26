/**
 * supervisor.ts — The Supervisor Engine.
 *
 * SOLE WRITER RULE (from AGENTS.md):
 *   This is the only module that writes to runStore and emits SSE events.
 *   Agent files are pure async functions.  agentRunner.ts only dispatches.
 *
 * STATE MACHINE RULES:
 *   • Every state change must call `applyTransition()` — never mutate
 *     `state.status` directly.  This guarantees a StateTransition entry is
 *     always recorded in the evidence ledger (history array).
 *   • Retries are strictly bounded by `state.maxRetries`.
 *   • AWAITING_APPROVAL is a hard gate — nothing auto-transitions past it.
 *     Only `approveSupervisorTask()` (called by the future POST route) may
 *     advance to VERIFIED.
 *
 * PARALLELISM NOTE:
 *   CODE_INTELLIGENCE and TEST_QA are dispatched concurrently via
 *   Promise.all() in the ANALYZING phase.  This is a deliberate design
 *   choice: both agents are read-only at that point (no code has been
 *   written yet), so their results are independent and can be collected in
 *   parallel to reduce total latency.
 *
 * DEPENDENCY ORDERING RULE:
 *   DEBUG_REVIEW is only dispatched from the RECOVERING state, which can only
 *   be reached from FAILED, which can only be reached after TESTING has
 *   already run and produced a TestResult with failed > 0.  This ordering is
 *   enforced by the state machine transition table — DEBUG_REVIEW will never
 *   be assigned before a test failure has been recorded.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  SupervisorTaskState,
  SupervisorState,
  StateTransition,
  AgentResult,
  AgentName,
  FailureReport,
  VerificationResult,
  AgentStatusEntry,
  AgentRunStatus,
} from './types/contracts.js';
import { transition, isTerminal } from './stateMachine.js';
import { decomposeTask } from './taskDecomposer.js';
import { runAgent } from './agentRunner.js';

// ---------------------------------------------------------------------------
// In-memory store (single source of truth for this process)
// ---------------------------------------------------------------------------

/**
 * In-memory run store.  Keys are taskIds, values are the full
 * SupervisorTaskState.  The store is intentionally module-scoped so that
 * supervisor.ts remains the sole writer.
 */
const runStore = new Map<string, SupervisorTaskState>();

/**
 * SSE emitter callback — populated by the Express layer when it registers
 * the SSE route.  Kept as a simple callback to avoid coupling the supervisor
 * to Express internals.
 */
let sseEmitter: ((taskId: string, event: StateTransition | AgentResult) => void) | null = null;

// ---------------------------------------------------------------------------
// Public API — store access
// ---------------------------------------------------------------------------

/**
 * Returns the current state of a run, or undefined if the taskId is unknown.
 */
export function getRunState(taskId: string): SupervisorTaskState | undefined {
  return runStore.get(taskId);
}

/**
 * Returns all known run states (for listing endpoints).
 */
export function getAllRunStates(): SupervisorTaskState[] {
  return Array.from(runStore.values());
}

/**
 * Registers the SSE emitter callback provided by the Express SSE route.
 * Called once at server startup.
 */
export function registerSseEmitter(
  emitter: (taskId: string, event: StateTransition | AgentResult) => void,
): void {
  sseEmitter = emitter;
}

// ---------------------------------------------------------------------------
// Public API — task lifecycle
// ---------------------------------------------------------------------------

/**
 * Creates a new supervised task, writes it into the store, records the first
 * StateTransition (RECEIVED), and kicks off the orchestration pipeline
 * asynchronously (does not await completion).
 *
 * Returns the initial SupervisorTaskState immediately so the caller (the POST
 * route handler) can respond with the taskId while orchestration runs in the
 * background.
 *
 * @param goal - The developer's high-level objective.
 * @param maxRetries - Hard cap on recovery attempts; defaults to 2.
 */
export function createTask(goal: string, maxRetries = 2): SupervisorTaskState {
  const taskId = uuidv4();
  const now = new Date().toISOString();

  // First transition: system → RECEIVED
  const initialTransition: StateTransition = {
    from: 'RECEIVED', // There is no "before" state; RECEIVED is the entry point.
    to: 'RECEIVED',
    reason: `Task created with goal: "${goal}"`,
    timestamp: now,
  };

  const initialAgentStatus: AgentStatusEntry[] = [
    { agent: 'CODE_INTELLIGENCE', status: 'PENDING' },
    { agent: 'TEST_QA',           status: 'PENDING' },
    { agent: 'DEBUG_REVIEW',      status: 'SKIPPED' }, // only activated on failure
  ];

  const state: SupervisorTaskState = {
    taskId,
    goal,
    status: 'RECEIVED',
    history: [initialTransition],
    agentStatus: initialAgentStatus,
    agentResults: {},
    retryCount: 0,
    maxRetries,
    createdAt: now,
    updatedAt: now,
  };

  runStore.set(taskId, state);
  emitSse(taskId, initialTransition);

  // Kick off orchestration via setTimeout(0) rather than a direct async call.
  // This ensures createTask() returns synchronously with status=RECEIVED before
  // any pipeline transitions run, which is important for:
  //   1. The HTTP response handler receiving the taskId immediately.
  //   2. Tests being able to assert on the initial RECEIVED state without
  //      microtasks racing ahead — vi.useFakeTimers() can then control when
  //      orchestration begins.
  setTimeout(() => {
    orchestrate(taskId).catch((err) => {
      console.error(`[supervisor] Unhandled error in orchestrate(${taskId}):`, err);
    });
  }, 0);

  return state;
}

/**
 * Human-approval gate — the ONLY way to advance from AWAITING_APPROVAL to
 * VERIFIED.  Must be called by the POST /api/task/:id/approve route handler.
 *
 * Returns the updated state, or throws if the task is not in
 * AWAITING_APPROVAL.
 *
 * @param taskId - The run to approve.
 */
export function approveSupervisorTask(taskId: string): SupervisorTaskState {
  const state = requireState(taskId);

  if (state.status !== 'AWAITING_APPROVAL') {
    throw new Error(
      `Cannot approve task ${taskId}: current status is ${state.status}, ` +
      `expected AWAITING_APPROVAL.`,
    );
  }

  applyTransition(
    state,
    'VERIFIED',
    'Human reviewer explicitly approved the task via POST /api/task/:id/approve.',
  );

  return state;
}

// ---------------------------------------------------------------------------
// Orchestration pipeline (internal, async)
// ---------------------------------------------------------------------------

/**
 * Main orchestration loop.  Drives the task through the state machine from
 * PLANNING to AWAITING_APPROVAL.  Never throws — all errors are caught and
 * recorded as FAILED transitions so the evidence ledger is always consistent.
 */
async function orchestrate(taskId: string): Promise<void> {
  const state = requireState(taskId);

  try {
    await runPlanningPhase(state);
    await runAnalysisPhase(state);
    await runImplementationPhase(state);
    await runTestingPhase(state);
    // Testing may have triggered FAILED → RECOVERING; loop handles retries.
    await runRecoveryLoop(state);
    // Only reach here if we're in VERIFYING (recovery succeeded or no failures).
    await runVerificationPhase(state);
  } catch (err: unknown) {
    // Catch-all: transition to FAILED with a recorded reason so the ledger is
    // never left in an inconsistent state.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[supervisor] Fatal error in pipeline for ${taskId}:`, err);

    if (!isTerminal(state.status)) {
      applyTransition(state, 'FAILED', `Pipeline error: ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Phase implementations
// ---------------------------------------------------------------------------

/** RECEIVED → PLANNING */
async function runPlanningPhase(state: SupervisorTaskState): Promise<void> {
  applyTransition(state, 'PLANNING', 'Supervisor accepted the task and is decomposing it into subtasks.');

  const subtasks = decomposeTask(state.taskId, state.goal);
  // Store the decomposed plan in the state for visibility — we embed it in
  // the risk field as a lightweight "plan" record since contracts.ts has no
  // dedicated subtasks array.
  state.updatedAt = new Date().toISOString();

  applyTransition(
    state,
    'ANALYZING',
    `Task decomposed into ${subtasks.length} subtasks: ` +
    subtasks.map((t) => t.agent).join(', ') + '.',
  );

  // Attach subtasks to state so the analysis phase can use them.
  // We store them on the state object via an extension property rather than
  // modifying contracts.ts — this is a runtime-only concern.
  (state as SupervisorTaskStateInternal).__subtasks = subtasks;
}

/**
 * ANALYZING phase — CODE_INTELLIGENCE and TEST_QA are dispatched concurrently.
 *
 * WHY PARALLEL: Both agents are read-only at this point — CODE_INTELLIGENCE
 * reads the codebase; TEST_QA runs the existing test suite.  Neither modifies
 * any file and their results are independent, so running them in parallel
 * reduces total wall-clock time without introducing any race condition.
 */
async function runAnalysisPhase(state: SupervisorTaskState): Promise<void> {
  // State is already ANALYZING (set at end of planning phase).
  const subtasks = getSubtasks(state);

  const ciTask = subtasks.find((t) => t.agent === 'CODE_INTELLIGENCE');
  const qaTask = subtasks.find((t) => t.agent === 'TEST_QA');

  if (!ciTask || !qaTask) {
    throw new Error('Decomposition did not produce CODE_INTELLIGENCE and TEST_QA tasks.');
  }

  // Inject retryCount into context so TEST_QA stub can control deterministic
  // pass/fail behaviour.
  qaTask.context = { ...qaTask.context, retryCount: state.retryCount };

  // Deliberate parallel dispatch — see module-level comment.
  const [ciResult, qaResult] = await Promise.all([
    runAgent(ciTask),
    runAgent(qaTask),
  ]);

  storeResult(state, ciResult);
  storeResult(state, qaResult);
}

/** ANALYZING → IMPLEMENTING */
async function runImplementationPhase(state: SupervisorTaskState): Promise<void> {
  applyTransition(
    state,
    'IMPLEMENTING',
    'Code Intelligence analysis complete. Proceeding to implementation phase.',
  );

  // In a real system this would invoke an LLM to generate and apply code
  // changes.  For the demo, we simulate work with a brief pause.
  await delay(500);

  applyTransition(
    state,
    'TESTING',
    'Implementation complete. Running test suite to verify correctness.',
  );
}

/**
 * TESTING phase — runs TEST_QA again against the (simulated) implementation.
 * If tests fail, transitions to FAILED; if they pass, transitions to VERIFYING.
 */
async function runTestingPhase(state: SupervisorTaskState): Promise<void> {
  // State is already TESTING (set at end of implementation phase).
  const subtasks = getSubtasks(state);
  const qaTask = subtasks.find((t) => t.agent === 'TEST_QA');

  if (!qaTask) {
    throw new Error('No TEST_QA task found for testing phase.');
  }

  // Update retryCount in context so the stub returns the right result.
  qaTask.context = { ...qaTask.context, retryCount: state.retryCount };
  // Refresh assignedAt timestamp for this dispatch.
  qaTask.assignedAt = new Date().toISOString();

  const qaResult = await runAgent(qaTask);
  storeResult(state, qaResult);

  const failures = qaResult.testResult?.failed ?? 0;

  if (failures > 0) {
    // FAILURE DETECTION (requirement #7): if any TestResult.failed > 0,
    // transition to FAILED and record why.  Never transition silently.
    applyTransition(
      state,
      'FAILED',
      `TEST_QA reported ${failures} test failure(s): ` +
      (qaResult.testResult?.failures.map((f) => f.testName).join('; ') ?? 'unknown'),
    );
  } else {
    applyTransition(
      state,
      'VERIFYING',
      `All ${qaResult.testResult?.totalTests ?? 0} tests passed.  Proceeding to verification.`,
    );
  }
}

/**
 * Recovery loop — handles the FAILED → RECOVERING → RETESTING cycle.
 *
 * BOUNDED RETRY (requirement #8):
 *   retryCount is incremented on each iteration.  When it reaches maxRetries
 *   we stop retrying and transition to a clearly terminal FAILED state rather
 *   than looping indefinitely.  This is mandatory: a live demo cannot hang.
 */
async function runRecoveryLoop(state: SupervisorTaskState): Promise<void> {
  while (state.status === 'FAILED') {
    if (state.retryCount >= state.maxRetries) {
      // Retries exhausted — transition to terminal FAILED.
      applyTransition(
        state,
        'FAILED',
        `Retry limit reached (retryCount=${state.retryCount}, maxRetries=${state.maxRetries}). ` +
        'Task permanently failed — no further recovery attempts will be made.',
      );
      // Return early; the pipeline will exit without reaching VERIFYING.
      return;
    }

    state.retryCount += 1;
    state.updatedAt = new Date().toISOString();

    applyTransition(
      state,
      'RECOVERING',
      `Recovery attempt ${state.retryCount}/${state.maxRetries}. ` +
      'Dispatching DEBUG_REVIEW agent to diagnose failure.',
    );

    // Mark DEBUG_REVIEW as RUNNING so the UI and agentStatus reflect live progress.
    setAgentStatus(state, 'DEBUG_REVIEW', 'RUNNING');

    // DEPENDENCY ORDERING (requirement #4):
    //   DEBUG_REVIEW is only ever dispatched here, inside the RECOVERING
    //   state, which is only reachable from FAILED, which is only reachable
    //   after TESTING has run and produced failures.  The state machine
    //   topology enforces this — there is no code path that dispatches
    //   DEBUG_REVIEW before a TestResult with failed > 0 is in agentResults.
    const subtasks = getSubtasks(state);
    const debugTask = subtasks.find((t) => t.agent === 'DEBUG_REVIEW');

    if (!debugTask) {
      throw new Error('No DEBUG_REVIEW task found for recovery phase.');
    }

    // Inject the failure summary so the debug agent knows what to review.
    const priorQaResult = state.agentResults['TEST_QA'];
    const failureSummary = priorQaResult?.testResult?.failures
      .map((f) => `${f.testName}: expected "${f.expected}", received "${f.received}"`)
      .join('\n') ?? 'No failure details available.';

    debugTask.context = { ...debugTask.context, failureSummary };
    debugTask.assignedAt = new Date().toISOString();

    const debugResult = await runAgent(debugTask);
    storeResult(state, debugResult);

    // Now re-run tests (RETESTING phase).
    applyTransition(
      state,
      'RETESTING',
      `DEBUG_REVIEW complete. Root cause: "${debugResult.failureReport?.rootCause ?? 'unknown'}". ` +
      'Re-running test suite.',
    );

    // Refresh TEST_QA task with the new retryCount so the stub returns the
    // correct deterministic result on retry.
    const qaTask = subtasks.find((t) => t.agent === 'TEST_QA');
    if (!qaTask) throw new Error('No TEST_QA task found for retesting phase.');

    qaTask.context = { ...qaTask.context, retryCount: state.retryCount };
    qaTask.assignedAt = new Date().toISOString();

    const retestResult = await runAgent(qaTask);
    storeResult(state, retestResult);

    const failures = retestResult.testResult?.failed ?? 0;

    if (failures > 0) {
      applyTransition(
        state,
        'FAILED',
        `Re-test after recovery attempt ${state.retryCount} still has ${failures} failure(s). ` +
        (retestResult.testResult?.failures.map((f) => f.testName).join('; ') ?? ''),
      );
      // Loop continues; next iteration will check retryCount again.
    } else {
      applyTransition(
        state,
        'VERIFYING',
        `All ${retestResult.testResult?.totalTests ?? 0} tests passed after ` +
        `recovery attempt ${state.retryCount}. Proceeding to verification.`,
      );
      // Exit the recovery loop — we're now in VERIFYING.
      return;
    }
  }
}

/**
 * VERIFYING → AWAITING_APPROVAL.
 *
 * VERIFICATION RULES (requirement #10):
 *   Only transitions to AWAITING_APPROVAL when:
 *     • requirementsMet is true
 *     • testsPassed === testsExecuted
 *     • regressionPassed is true
 *   Never marks VERIFIED (or even AWAITING_APPROVAL) based on assumption.
 */
async function runVerificationPhase(state: SupervisorTaskState): Promise<void> {
  if (state.status !== 'VERIFYING') return; // Guard: only run if we actually got here.

  await delay(300); // Simulate final verification work.

  // Build VerificationResult from collected agent results.
  const qaResult = state.agentResults['TEST_QA'];
  const ciResult = state.agentResults['CODE_INTELLIGENCE'];

  const testsExecuted = qaResult?.testResult?.totalTests ?? 0;
  const testsPassed   = qaResult?.testResult?.passed ?? 0;
  const regressionPassed = (qaResult?.testResult?.failed ?? 1) === 0;
  const requirementsMet  = ciResult?.status === 'SUCCESS' && regressionPassed;
  const codeReviewed     = ciResult !== undefined;

  const verification: VerificationResult = {
    requirementsMet,
    testsExecuted,
    testsPassed,
    regressionPassed,
    codeReviewed,
  };

  state.verification = verification;
  state.updatedAt    = new Date().toISOString();

  // Strictly validate all three conditions before advancing.
  if (!requirementsMet || testsPassed !== testsExecuted || !regressionPassed) {
    applyTransition(
      state,
      'FAILED',
      `Verification failed: requirementsMet=${requirementsMet}, ` +
      `testsPassed=${testsPassed}/${testsExecuted}, regressionPassed=${regressionPassed}.`,
    );
    return;
  }

  applyTransition(
    state,
    'AWAITING_APPROVAL',
    `Verification passed: all ${testsExecuted} tests pass, regression clear, ` +
    `requirements met. Waiting for human approval before marking VERIFIED.`,
  );

  // HUMAN APPROVAL GATE (requirement #11):
  //   Nothing auto-transitions from AWAITING_APPROVAL.  The pipeline ends
  //   here.  approveSupervisorTask() must be called explicitly to advance.
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Internal extension — not exported, not part of the public contract. */
interface SupervisorTaskStateInternal extends SupervisorTaskState {
  __subtasks?: import('./types/contracts.js').AgentTask[];
}

/**
 * Applies a state transition, records it in the history, emits an SSE event,
 * and updates `updatedAt`.  This is the ONLY way the supervisor may change
 * `state.status`.
 */
function applyTransition(
  state: SupervisorTaskState,
  to: SupervisorState,
  reason: string,
): void {
  const tx = transition(state.status, to, reason);
  state.status   = to;
  state.history.push(tx);
  state.updatedAt = tx.timestamp;
  emitSse(state.taskId, tx);
}

/**
 * Stores an AgentResult in `state.agentResults`, keyed by agent name, and
 * updates the corresponding agentStatus entry to reflect the outcome.
 * Updates `updatedAt` and emits an SSE event so the client sees live progress.
 */
function storeResult(state: SupervisorTaskState, result: AgentResult): void {
  state.agentResults[result.agent as AgentName] = result;
  setAgentStatus(state, result.agent, result.status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE', result.completedAt);
  state.updatedAt = result.completedAt;
  emitSse(state.taskId, result);
}

/**
 * Updates the agentStatus entry for a specific agent.
 * If the agent is not yet in the array (shouldn't happen), appends a new entry.
 */
function setAgentStatus(
  state: SupervisorTaskState,
  agent: AgentName,
  status: AgentRunStatus,
  updatedAt?: string,
): void {
  const entry = state.agentStatus.find((e) => e.agent === agent);
  if (entry) {
    entry.status    = status;
    entry.updatedAt = updatedAt ?? new Date().toISOString();
  } else {
    state.agentStatus.push({ agent, status, updatedAt: updatedAt ?? new Date().toISOString() });
  }
}

/** Retrieves a state from the store, throwing if it does not exist. */
function requireState(taskId: string): SupervisorTaskState {
  const state = runStore.get(taskId);
  if (!state) throw new Error(`Run not found: ${taskId}`);
  return state;
}

/** Retrieves the decomposed subtasks attached to the state. */
function getSubtasks(state: SupervisorTaskState): NonNullable<SupervisorTaskStateInternal['__subtasks']> {
  const internal = state as SupervisorTaskStateInternal;
  if (!internal.__subtasks?.length) {
    throw new Error(`No subtasks found on state for task ${state.taskId}.`);
  }
  return internal.__subtasks;
}

/** Fires the SSE emitter if one has been registered. */
function emitSse(taskId: string, event: StateTransition | AgentResult): void {
  if (sseEmitter) {
    sseEmitter(taskId, event);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
