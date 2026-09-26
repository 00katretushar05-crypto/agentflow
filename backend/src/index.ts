/**
 * index.ts — Entry point for the AgentFlow backend server.
 *
 * Imports the Express app factory from server.ts and binds it to a port.
 * Kept minimal so the bulk of app setup stays testable in server.ts.
 */

import { createApp } from './server.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const app = createApp();

app.listen(PORT, () => {
  console.log(`[agentflow] Backend listening on http://localhost:${PORT}`);
});
