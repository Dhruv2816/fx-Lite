'use strict';

require('dotenv').config();

const createApp    = require('./src/app');
const { initializeSchema, DB_PATH } = require('./src/config/db');
const engineService = require('./src/services/EngineService');

const PORT = process.env.PORT || 3000;

// Guarantee the schema exists even if `npm run init-db` was never run
// manually (idempotent — CREATE TABLE IF NOT EXISTS).
initializeSchema();

const app = createApp();

app.listen(PORT, async () => {
  // eslint-disable-next-line no-console
  console.log(`FX-Lite server listening on port ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`SQLite database file: ${DB_PATH}`);
  // eslint-disable-next-line no-console
  console.log(`Tip: run "npm run init-db" to seed a demo user (101) with 1000 USD + 50000 INR.`);

  // ── Start FX-Core C++ Engine (non-blocking) ──────────────
  // Engine is optional: if the binary doesn't exist yet (user hasn't
  // run npm run build-engine), FX-Lite still works for all other routes.
  try {
    await engineService.init();
    console.log('[FX-Core] C++ matching engine connected via stdin/stdout IPC');
  } catch (err) {
    console.warn(`[FX-Core] Engine not available: ${err.message}`);
    console.warn('[FX-Core] Run "npm run build-engine" then restart to enable /api/engine routes.');
  }
});

// ── Graceful shutdown ──────────────────────────────────────
// Joins the C++ consumer thread cleanly on SIGTERM (Docker stop, Ctrl+C)
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received — shutting down fx_core engine...');
  engineService.shutdown();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[server] SIGINT received — shutting down fx_core engine...');
  engineService.shutdown();
  process.exit(0);
});

