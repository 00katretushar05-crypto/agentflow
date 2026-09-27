// TARGET INTEGRATION TEST — verifies the full task lifecycle end-to-end.
// Requires a live backend running on http://localhost:3001.

import { describe, test, expect } from 'vitest';
import supertest from "supertest";

const BASE_URL = "http://localhost:3001";
const request = supertest(BASE_URL);

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 30_000;

/** Return true if an error value is a network-level connection failure. */
function isConnectionRefused(err: unknown): boolean {
  if (err instanceof Error) {
    if (
      err.message.includes("ECONNREFUSED") ||
      err.message.includes("socket hang up")
    ) {
      return true;
    }
  }
  if (
    err != null &&
    typeof err === "object" &&
    Array.isArray((err as Record<string, unknown>).errors)
  ) {
    const subErrors = (err as Record<string, unknown>).errors as unknown[];
    if (
      subErrors.some(
        (e) =>
          e instanceof Error &&
          (e.message.includes("ECONNREFUSED") ||
            e.message.includes("socket hang up"))
      )
    ) {
      return true;
    }
  }
  try {
    const s = JSON.stringify(err);
    if (s.includes("ECONNREFUSED")) return true;
  } catch {
    // non-serialisable — ignore
  }
  return false;
}

/** Unwrap the standard { data: T } response envelope used across the API. */
function unwrap(body: unknown): Record<string, unknown> {
  const b = body as Record<string, unknown>;
  return (b.data as Record<string, unknown>) ?? b;
}

/**
 * Poll GET /api/task/:taskId every second until status is VERIFIED or FAILED, or timeout.
 * If the task reaches AWAITING_APPROVAL, this calls POST /api/task/:taskId/approve
 * once (the Supervisor's human-approval gate) and continues polling until VERIFIED.
 */
async function pollUntilTerminal(
  taskId: string
): Promise<{ status: string; body: Record<string, unknown> }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let approvalCalled = false;

  while (Date.now() < deadline) {
    const res = await request.get(`/api/task/${taskId}`);
    expect(res.status).toBe(200);

    const body = unwrap(res.body);
    const status = body.status as string;

    if (status === "VERIFIED" || status === "FAILED") {
      return { status, body };
    }

    if (status === "AWAITING_APPROVAL" && !approvalCalled) {
      approvalCalled = true;
      const approveRes = await request.post(`/api/task/${taskId}/approve`);
      expect([200, 201]).toContain(approveRes.status);
      continue; // re-poll immediately to pick up the new VERIFIED status
    }

    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `Timeout: task "${taskId}" did not reach VERIFIED or FAILED within ` +
      `${POLL_TIMEOUT_MS / 1_000} seconds. ` +
      "Either the Supervisor/Agents are not wired yet, or the backend is processing too slowly."
  );
}

describe("Full task lifecycle", () => {
  test("full task lifecycle reaches VERIFIED with passing evidence", async () => {
    try {
      // ── Step 1: Create task ──────────────────────────────────────────────
      const createRes = await request
        .post("/api/task")
        .set("Content-Type", "application/json")
        .send({
          goal: "Add a 10% discount for premium customers without breaking checkout",
        });

      expect([200, 201]).toContain(createRes.status);

      const createBody = unwrap(createRes.body);

      const taskId = createBody.taskId as string;
      expect(typeof taskId).toBe("string");
      expect(taskId.length).toBeGreaterThan(0);

      const initialStatus = createBody.status as string;
      expect(typeof initialStatus).toBe("string");
      expect(["RECEIVED", "PENDING", "IN_PROGRESS"]).toContain(initialStatus);

      // ── Step 2: Poll for terminal status ────────────────────────────────
      const { status: terminalStatus } = await pollUntilTerminal(taskId);

      // ── Step 3: Fetch evidence and assert contract ───────────────────────
      const evidenceRes = await request.get(`/api/task/${taskId}/evidence`);
      expect(evidenceRes.status).toBe(200);

      const evidencePayload = unwrap(evidenceRes.body) as {
        items?: Record<string, unknown>[];
        ledger?: Record<string, unknown>;
      };

      // The evidence endpoint returns a named object: { taskId, items, updatedAt, ledger }.
      const entries: Record<string, unknown>[] = Array.isArray(evidencePayload.items)
        ? evidencePayload.items
        : [];

      const summary = evidencePayload.ledger ?? {};

      if (terminalStatus !== "VERIFIED") {
        console.error(
          "[EVIDENCE LEDGER — task did NOT reach VERIFIED]",
          JSON.stringify(entries, null, 2)
        );
      }

      expect(terminalStatus).toBe("VERIFIED");
      expect(entries.length).toBeGreaterThan(0);

      // Test-pass evidence lives inside the TEST_QA AGENT_RESULT entry's testResult payload,
      // not as a standalone "test_execution" entry type.
      const passingTestEntry = entries.find((entry) => {
        const payload = entry.payload as Record<string, unknown> | undefined;
        const isTestQaResult =
          entry.type === "AGENT_RESULT" && payload?.agent === "TEST_QA";
        const testResult = payload?.testResult as
          | { passed?: number; failed?: number }
          | undefined;
        const isPassing =
          !!testResult && (testResult.passed ?? 0) > 0 && (testResult.failed ?? 0) === 0;
        return isTestQaResult && isPassing;
      });

      if (passingTestEntry === undefined) {
        console.error(
          "[EVIDENCE LEDGER — no passing TEST_QA result found]",
          JSON.stringify(entries, null, 2)
        );
      }

      expect(passingTestEntry).toBeDefined();

      // Sanity-check the summary object too, since it directly reports pass/fail counts.
      expect(summary.testsPassed).toBeGreaterThan(0);
      expect(summary.regressionPassed).toBe(true);
    } catch (err: unknown) {
      if (isConnectionRefused(err)) {
        throw new Error(
          `backend not reachable at ${BASE_URL} — is the server running?\n` +
            `(original error: ${err instanceof Error ? err.message : String(err)})`
        );
      }
      throw err;
    }
  }, POLL_TIMEOUT_MS + 10000);
});
