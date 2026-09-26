// TARGET INTEGRATION TEST — expected to fail until Supervisor + Agents are fully wired (M1/M2).
// This defines the contract the backend must satisfy.

import supertest from "supertest";

const BASE_URL = "http://localhost:5000";
const request = supertest(BASE_URL);

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 30_000;

type TerminalStatus = "VERIFIED" | "FAILED";

/** Poll GET /api/task/:taskId until status is VERIFIED or FAILED, or the timeout elapses. */
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
    `Task ${taskId} did not reach VERIFIED or FAILED within ${POLL_TIMEOUT_MS / 1_000} seconds. ` +
      "Either the Supervisor/Agents are not wired yet or the backend is too slow."
  );
}

describe("Full task lifecycle", () => {
  test("full task lifecycle reaches VERIFIED with passing evidence", async () => {
    try {
      // ── Step 1: Create task ────────────────────────────────────────────────
      const createRes = await request
        .post("/api/task")
        .send({
          goal: "Add a 10% discount for premium customers without breaking checkout",
        })
        .set("Content-Type", "application/json");

      expect([200, 201]).toContain(createRes.status);

      const createBody = createRes.body as Record<string, unknown>;
      const taskId = createBody.taskId as string;

      expect(typeof taskId).toBe("string");
      expect(taskId.length).toBeGreaterThan(0);

      // Initial status should acknowledge the task has been received.
      const initialStatus = createBody.status as string;
      expect(typeof initialStatus).toBe("string");
      expect(["PENDING", "IN_PROGRESS"]).toContain(initialStatus);

      // ── Step 2: Poll for terminal status ──────────────────────────────────
      const { status: terminalStatus } = await pollUntilTerminal(taskId);

      // ── Step 3: Fetch & assert evidence ───────────────────────────────────
      const evidenceRes = await request.get(`/api/task/${taskId}/evidence`);
      expect(evidenceRes.status).toBe(200);

      const evidence = evidenceRes.body as
        | Record<string, unknown>[]
        | Record<string, unknown>;

      // Accept both array and object-keyed evidence ledgers.
      const entries: Record<string, unknown>[] = Array.isArray(evidence)
        ? (evidence as Record<string, unknown>[])
        : (Object.values(evidence) as Record<string, unknown>[]);

      if (terminalStatus !== "VERIFIED") {
        console.error(
          "[EVIDENCE LEDGER — task reached FAILED, not VERIFIED]",
          JSON.stringify(entries, null, 2)
        );
      }

      expect(terminalStatus).toBe<TerminalStatus>("VERIFIED");

      expect(entries.length).toBeGreaterThan(0);

      // At least one entry must be a passing test-execution evidence item.
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

      if (!passingTestEntry) {
        console.error(
          "[EVIDENCE LEDGER — no passing test_execution entry found]",
          JSON.stringify(entries, null, 2)
        );
      }

      expect(passingTestEntry).toBeDefined();
    } catch (err: unknown) {
      // Translate connection-refused errors into a developer-friendly message.
      // Node can wrap ECONNREFUSED in an AggregateError whose individual errors
      // carry the code, so we inspect the full serialised form.
      const serialised = (() => {
        try {
          return JSON.stringify(err);
        } catch {
          return String(err);
        }
      })();

      const message = err instanceof Error ? err.message : String(err);

      // AggregateError (Node ≥16) wraps multiple ECONNREFUSED sub-errors;
      // duck-type check via the `errors` array property.
      const aggregateErrors: unknown[] =
        err != null &&
        typeof err === "object" &&
        Array.isArray((err as Record<string, unknown>).errors)
          ? ((err as Record<string, unknown>).errors as unknown[])
          : [];

      const isNetworkError =
        message.includes("ECONNREFUSED") ||
        message.includes("socket hang up") ||
        serialised.includes("ECONNREFUSED") ||
        aggregateErrors.some(
          (e) => e instanceof Error && e.message.includes("ECONNREFUSED")
        );

      if (isNetworkError) {
        throw new Error(
          "backend not reachable — is the server running on port 5000?\n" +
            `(original error: ${message})`
        );
      }

      throw err;
    }
  });
});
