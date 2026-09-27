"Good catch on the in-progress state — I added agentStatus to the contracts so you can show per-agent PENDING/IN_PROGRESS/DONE separately from the final result. Pulled contracts.ts, here's exact sample JSON for all 3 endpoints:

GET /api/task/:id

json
{
  "taskId": "AF-1024",
  "goal": "Add a 10% discount for premium customers without breaking checkout",
  "status": "TESTING",
  "history": [
    { "from": "RECEIVED", "to": "PLANNING", "reason": "Task decomposed into agent subtasks", "timestamp": "2026-09-26T10:00:00.000Z" },
    { "from": "PLANNING", "to": "ANALYZING", "reason": "Agents assigned: CODE_INTELLIGENCE, TEST_QA", "timestamp": "2026-09-26T10:00:04.000Z" },
    { "from": "ANALYZING", "to": "IMPLEMENTING", "reason": "Both agents returned findings", "timestamp": "2026-09-26T10:00:15.000Z" },
    { "from": "IMPLEMENTING", "to": "TESTING", "reason": "Implementation complete, running tests", "timestamp": "2026-09-26T10:00:28.000Z" }
  ],
  "agentStatus": {
    "CODE_INTELLIGENCE": "DONE",
    "TEST_QA": "IN_PROGRESS",
    "DEBUG_REVIEW": "PENDING"
  },
  "agentResults": {
    "CODE_INTELLIGENCE": {
      "agent": "CODE_INTELLIGENCE",
      "status": "SUCCESS",
      "task": {
        "taskId": "AF-1024",
        "agent": "CODE_INTELLIGENCE",
        "goal": "Analyze impact of adding premium discount",
        "assignedAt": "2026-09-26T10:00:04.000Z"
      },
      "findings": {
        "affectedFiles": ["src/checkout/checkout.js", "src/discounts/discountService.js"],
        "affectedFunctions": ["calculateDiscount", "processCheckout"],
        "riskLevel": "MEDIUM",
        "recommendation": "Modify discount calculation and add regression tests."
      },
      "filesExamined": ["src/checkout/checkout.js", "src/discounts/discountService.js"],
      "filesModified": [],
      "confidence": "HIGH",
      "recommendedNextAction": "Proceed to implementation",
      "completedAt": "2026-09-26T10:00:12.000Z"
    },
    "TEST_QA": null,
    "DEBUG_REVIEW": null
  },
  "retryCount": 0,
  "maxRetries": 3,
  "verification": null,
  "risk": null,
  "createdAt": "2026-09-26T10:00:00.000Z",
  "updatedAt": "2026-09-26T10:00:28.000Z"
}

(Notes for your loading states: when agentStatus for an agent is "IN_PROGRESS" or "PENDING", agentResults for that agent will be null — that's your signal to show a spinner/skeleton instead of result content. SupervisorState values are exactly what's in contracts.ts, unchanged: RECEIVED, PLANNING, ANALYZING, IMPLEMENTING, TESTING, FAILED, RECOVERING, RETESTING, VERIFYING, AWAITING_APPROVAL, VERIFIED. All timestamps are ISO strings — sort by timestamp for the activity feed, driven off the history array.)

GET /api/task/:id/evidence

json
{
  "taskId": "AF-1024",
  "items": [
    { "label": "Requirement", "status": "PASS", "detail": "Requirement understood and decomposed" },
    { "label": "Impact Analysis", "status": "PASS", "detail": "2 files, 2 functions identified" },
    { "label": "Files Changed", "status": "PASS", "detail": "3" },
    { "label": "Tests Executed", "status": "IN_PROGRESS", "detail": "11" },
    { "label": "Tests Passed", "status": "PENDING", "detail": null },
    { "label": "Regression", "status": "PENDING", "detail": null },
    { "label": "Code Review", "status": "PENDING", "detail": null },
    { "label": "Human Approval", "status": "PENDING", "detail": null }
  ],
  "updatedAt": "2026-09-26T10:00:28.000Z"
}

(status is always one of PASS / FAIL / IN_PROGRESS / PENDING — that covers your color coding: green/red/amber/grey.)

GET /api/tasks

json
{
  "tasks": [
    { "taskId": "AF-1024", "goal": "Add premium customer discount", "status": "TESTING", "createdAt": "2026-09-26T10:00:00.000Z", "updatedAt": "2026-09-26T10:00:28.000Z" },
    { "taskId": "AF-1023", "goal": "Fix payment bug", "status": "VERIFIED", "createdAt": "2026-09-26T09:40:00.000Z", "updatedAt": "2026-09-26T09:52:00.000Z" },
    { "taskId": "AF-1022", "goal": "Order validation", "status": "VERIFIED", "createdAt": "2026-09-26T09:10:00.000Z", "updatedAt": "2026-09-26T09:25:00.000Z" },
    { "taskId": "AF-1021", "goal": "Cart calculation", "status": "FAILED", "createdAt": "2026-09-26T08:50:00.000Z", "updatedAt": "2026-09-26T09:05:00.000Z" }
  ]
}

Build your mock data to exactly match these shapes — when I wire the real API it'll return this structure."