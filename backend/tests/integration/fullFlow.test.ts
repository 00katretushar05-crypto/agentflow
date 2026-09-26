// TARGET INTEGRATION TEST — expected to fail until Supervisor + Agents are fully wired (M1/M2).
// This defines the contract the backend must satisfy.
//
// NOTE: As of now, backend/src/routes, backend/src/agents, backend/src/supervisor, and
// backend/src/types/contracts.ts are all still empty placeholders. No HTTP server exists yet,
// so this test is expected to fail with a "backend not reachable" connection error until those
// are implemented and a server is running on port 5000.

import supertest from "supertest";

const BASE_URL = "http://localhost:5000";
const request = supertest(BASE_URL);

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 30_000;

/** Return true if an error value is a network-level connection failure. */
function isConnectionRefused(err: unknown): boolean {
  // Plain Error: message contains ECONNREFUSED or socket hang up
  if (err instanceof Error) {
    if (
      err.message.includes("ECONNREFUSED") ||
      err.message.includes("socket hang up")
    ) {
      return true;
    }
  }

  // Node ≥ 16 AggregateError: duck-type via the `errors` array property
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

  // Last resort: stringify and scan (catches e.g. wrapped fetch errors)
  try {
    const s = JSON.stringify(err);
    if (s.includes("ECONNREFUSED")) return true;
  } catch {
    // non-serialisable — ignore
  }

  return false;
}

/** Poll GET /api/task/:taskId every second until status is VERIFIED or FAILED, or timeout. */
async function pollUntilTerminal(
  taskId: string
): Promise<{ status: string; body: Record<string, unknown> }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const res = await request.get(`/api/task/${taskId}`);

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    const status = body.status as string;

    if (status === "VERIFIED" || status === "FAILED") {
      return { status, body };
    }

    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `Timeout: task "${taskId}" did not reach VERIFIED or FAILED within ` +
      `${POLL_TIMEOUT_MS / 1_000} seconds. ` +
      "Either the Supervisor/Agents are not wired yet, or the backend is processing too slowly."
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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

      const createBody = createRes.body as Record<string, unknown>;

      const taskId = createBody.taskId as string;
      expect(typeof taskId).toBe("string");
      expect(taskId.length).toBeGreaterThan(0);

      const initialStatus = createBody.status as string;
      expect(typeof initialStatus).toBe("string");
      expect(["PENDING", "IN_PROGRESS"]).toContain(initialStatus);

      // ── Step 2: Poll for terminal status ────────────────────────────────
      const { status: terminalStatus } = await pollUntilTerminal(taskId);

      // ── Step 3: Fetch evidence and assert contract ───────────────────────
      const evidenceRes = await request.get(`/api/task/${taskId}/evidence`);
      expect(evidenceRes.status).toBe(200);

      const evidencePayload = evidenceRes.body as
        | Record<string, unknown>[]
        | Record<string, unknown>;

      // Accept both array-form and keyed-object-form evidence ledgers.
      const entries: Record<string, unknown>[] = Array.isArray(evidencePayload)
        ? (evidencePayload as Record<string, unknown>[])
        : (Object.values(evidencePayload) as Record<string, unknown>[]);

      if (terminalStatus !== "VERIFIED") {
        // Log full ledger so the developer can see what happened.
        console.error(
          "[EVIDENCE LEDGER — task did NOT reach VERIFIED]",
          JSON.stringify(entries, null, 2)
        );
      }

      expect(terminalStatus).toBe("VERIFIED");
      expect(entries.length).toBeGreaterThan(0);

      // At least one entry must represent a passing test-execution.
      const passingTestEntry = entries.find((entry) => {
        const isTestExecution =
          entry.type === "test_execution" ||
          entry.type === "TEST_EXECUTION";

        const isPassing =
          entry.passed === true ||
          entry.status === "PASSED" ||
          entry.status === "passed";

        return isTestExecution && isPassing;
      });

      if (passingTestEntry === undefined) {
        console.error(
          "[EVIDENCE LEDGER — no passing test_execution entry found]",
          JSON.stringify(entries, null, 2)
        );
      }

      expect(passingTestEntry).toBeDefined();
    } catch (err: unknown) {
      if (isConnectionRefused(err)) {
        throw new Error(
          "backend not reachable — is the server running on port 5000?\n" +
            `(original error: ${err instanceof Error ? err.message : String(err)})`
        );
      }
      throw err;
    }
  });
});
