'use strict';

const express = require('express');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

/**
 * Builds and returns a configured Express application.
 * Kept as a factory function (rather than starting the server here) so
 * the app can be imported and tested (e.g. with supertest) without
 * actually binding to a network port.
 */
function createApp() {
  const app = express();

  app.use(express.json());

  // Lightweight request log — useful during grading/demo, negligible cost.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      // eslint-disable-next-line no-console
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });

  // Simple health check, handy for Docker HEALTHCHECK / uptime probes.
  app.get('/health', (req, res) => {
    res.status(200).json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api', apiRoutes);

  // 404 for anything unmatched, then the centralized error handler.
  // Order matters: notFoundHandler must be registered AFTER all routes,
  // and errorHandler must be the LAST app.use() call of all.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
