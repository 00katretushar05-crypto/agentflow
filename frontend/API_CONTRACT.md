\# AgentFlow API Contract



Real, verified response shapes — captured from live backend runs (2026-09-27). All fields shown are what the API actually returns, not a mock spec.



\## GET /api/task/:id



```json

{

&#x20; "data": {

&#x20;   "taskId": "322a7d8f-5536-451a-92ec-ad5b74c9c7fc",

&#x20;   "goal": "Add a 10% discount for premium customers without breaking checkout",

&#x20;   "status": "AWAITING\_APPROVAL",

&#x20;   "history": \[

&#x20;     {

&#x20;       "from": "RECEIVED",

&#x20;       "to": "PLANNING",

&#x20;       "reason": "Supervisor accepted the task and is decomposing it into subtasks.",

&#x20;       "timestamp": "2026-09-27T04:34:12.155Z"

&#x20;     }

&#x20;   ],

&#x20;   "agentStatus": \[

&#x20;     { "agent": "CODE\_INTELLIGENCE", "status": "SUCCESS", "updatedAt": "2026-09-27T04:34:12.208Z" },

&#x20;     { "agent": "TEST\_QA", "status": "SUCCESS", "updatedAt": "2026-09-27T04:34:33.945Z" },

&#x20;     { "agent": "DEBUG\_REVIEW", "status": "SUCCESS", "updatedAt": "2026-09-27T04:34:32.790Z" }

&#x20;   ],

&#x20;   "agentResults": {

&#x20;     "CODE\_INTELLIGENCE": {

&#x20;       "agent": "CODE\_INTELLIGENCE",

&#x20;       "status": "SUCCESS",

&#x20;       "findings": {

&#x20;         "affectedFiles": \["src/checkout/checkout.js", "src/discounts/discountService.js"],

&#x20;         "affectedFunctions": \["checkout", "getDiscount"],

&#x20;         "riskLevel": "MEDIUM",

&#x20;         "recommendation": "..."

&#x20;       },

&#x20;       "filesExamined": \["..."],

&#x20;       "filesModified": \[],

&#x20;       "confidence": "MEDIUM",

&#x20;       "recommendedNextAction": "Proceed to Test \& QA analysis.",

&#x20;       "completedAt": "2026-09-27T04:34:12.208Z"

&#x20;     },

&#x20;     "TEST\_QA": {

&#x20;       "agent": "TEST\_QA",

&#x20;       "status": "SUCCESS",

&#x20;       "testResult": {

&#x20;         "totalTests": 10,

&#x20;         "passed": 10,

&#x20;         "failed": 0,

&#x20;         "failures": \[],

&#x20;         "executedAt": "2026-09-27T04:34:33.944Z"

&#x20;       },

&#x20;       "confidence": "HIGH",

&#x20;       "completedAt": "2026-09-27T04:34:33.945Z"

&#x20;     },

&#x20;     "DEBUG\_REVIEW": {

&#x20;       "agent": "DEBUG\_REVIEW",

&#x20;       "status": "SUCCESS",

&#x20;       "failureReport": {

&#x20;         "testFailure": "...",

&#x20;         "rootCause": "...",

&#x20;         "confidence": "HIGH"

&#x20;       },

&#x20;       "filesModified": \["src/checkout/checkout.js"],

&#x20;       "completedAt": "2026-09-27T04:34:32.790Z"

&#x20;     }

&#x20;   },

&#x20;   "retryCount": 1,

&#x20;   "maxRetries": 2,

&#x20;   "createdAt": "2026-09-27T04:34:12.143Z",

&#x20;   "updatedAt": "2026-09-27T04:34:34.253Z",

&#x20;   "verification": {

&#x20;     "requirementsMet": true,

&#x20;     "testsExecuted": 10,

&#x20;     "testsPassed": 10,

&#x20;     "regressionPassed": true,

&#x20;     "codeReviewed": true

&#x20;   },

&#x20;   "riskAssessment": {

&#x20;     "filesAffected": 4,

&#x20;     "functionsAffected": 4,

&#x20;     "testsCovered": 10,

&#x20;     "dependencyImpact": "MEDIUM",

&#x20;     "riskPercent": 75,

&#x20;     "recommendation": "High risk: manual review required before proceeding."

&#x20;   }

&#x20; }

}

```



\*\*Key notes:\*\*

\- `agentStatus` is an \*\*array\*\*, not an object. Status values: `SUCCESS | FAILURE | PARTIAL | SKIPPED`.

\- `verification` and `riskAssessment` are both `undefined` until the task reaches `VERIFYING` or later — treat missing as PENDING in UI.

\- `SupervisorState` values: `RECEIVED, PLANNING, ANALYZING, IMPLEMENTING, TESTING, FAILED, RECOVERING, RETESTING, VERIFYING, AWAITING\_APPROVAL, VERIFIED`.

\- A run that needed recovery (`retryCount > 0`) still reaches `AWAITING\_APPROVAL` if all tests eventually pass — the `history` entry for that transition includes a note flagging the recovery attempt for human review.



\## GET /api/task/:id/evidence



```json

{

&#x20; "data": {

&#x20;   "taskId": "322a7d8f-5536-451a-92ec-ad5b74c9c7fc",

&#x20;   "items": \[

&#x20;     {

&#x20;       "seq": 1,

&#x20;       "type": "TRANSITION",

&#x20;       "timestamp": "2026-09-27T04:34:12.143Z",

&#x20;       "summary": "\[RECEIVED → RECEIVED] Task created with goal: \\"...\\"",

&#x20;       "payload": { "from": "RECEIVED", "to": "RECEIVED", "reason": "...", "timestamp": "..." }

&#x20;     },

&#x20;     {

&#x20;       "seq": 4,

&#x20;       "type": "AGENT\_RESULT",

&#x20;       "timestamp": "2026-09-27T04:34:12.208Z",

&#x20;       "summary": "\[CODE\_INTELLIGENCE] SUCCESS: Proceed to Test \& QA analysis.",

&#x20;       "payload": { "agent": "CODE\_INTELLIGENCE", "status": "SUCCESS", "...": "..." }

&#x20;     }

&#x20;   ],

&#x20;   "updatedAt": "2026-09-27T04:34:34.253Z"

&#x20; }

}

```



\*\*Key notes:\*\*

\- This is a \*\*chronological activity log\*\*, not a checklist. Only two `type` values exist: `TRANSITION` and `AGENT\_RESULT`. There is no PASS/FAIL/IN\_PROGRESS/PENDING checklist format anywhere in the API.

\- For a checklist-style UI, derive it from `GET /api/task/:id`'s `verification` + `riskAssessment` fields instead (see mapping below).

\- `seq` is 1-based and strictly increasing, sorted by timestamp.



\### Deriving a checklist view (if needed) from /api/task/:id



| Checklist item | Source field |

|---|---|

| Requirement | `verification.requirementsMet` |

| Impact Analysis | `riskAssessment.filesAffected` / `functionsAffected` |

| Files Changed | `riskAssessment.filesAffected` |

| Tests Executed | `verification.testsExecuted` |

| Tests Passed | `verification.testsPassed` |

| Regression | `verification.regressionPassed` |

| Code Review | `verification.codeReviewed` |

| Human Approval | Derived from `status`: `AWAITING\_APPROVAL` → PENDING, `VERIFIED` → PASS |



\## GET /api/tasks



```json

{

&#x20; "data": {

&#x20;   "tasks": \[

&#x20;     {

&#x20;       "taskId": "322a7d8f-5536-451a-92ec-ad5b74c9c7fc",

&#x20;       "goal": "Add a 10% discount for premium customers without breaking checkout",

&#x20;       "status": "AWAITING\_APPROVAL",

&#x20;       "retryCount": 1,

&#x20;       "maxRetries": 2,

&#x20;       "createdAt": "2026-09-27T04:34:12.143Z",

&#x20;       "updatedAt": "2026-09-27T04:34:34.253Z"

&#x20;     }

&#x20;   ]

&#x20; }

}

```



\*\*Key note:\*\* response is wrapped in `data.tasks`, not a bare `tasks` array at the top level.

