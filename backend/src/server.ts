/**
 * server.ts — Express application factory.
 *
 * Exported as a pure factory function (no `.listen()` call) so that test
 * files can import and wrap it with supertest without binding a real port.
 * The actual `listen()` call lives in index.ts.
 */

import express from 'express';
import { apiRouter } from './routes/api.js';

/**
 * Creates and returns a configured Express application.
 * Does NOT call app.listen() — call that in index.ts or in test setup.
 */
export function createApp(): express.Application {
  const app = express();

  // Parse JSON request bodies.
  app.use(express.json());

  // Mount all API routes under /api.
  app.use('/api', apiRouter);

  // 404 fallback for any unmatched route.
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  });

  return app;
}
