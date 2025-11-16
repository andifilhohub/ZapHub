import express from 'express';
import path from 'path';
import cors from 'cors';
import config from '../../config/index.js';
import logger from '../lib/logger.js';
import routes from '../routes/routes.js';
import apiRoutes from '../api/routes/index.js';
import { errorHandler, notFoundHandler } from '../api/middleware/errorHandler.js';

const app = express();

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use(cors({
  origin: '*', // Configure appropriately for production
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request logging middleware
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
    ip: req.ip,
  }, '[HTTP] Incoming request');
  next();
});

// Serve static files from public directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Legacy routes (Baileys test routes)
app.use('/', routes);

// API v1 routes
app.use('/api/v1', apiRoutes);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

const PORT = config.server.port;

app.listen(PORT, () => {
  logger.info({ port: PORT, env: config.env }, '[Server] API server started');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api/v1`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/v1/health`);
});

