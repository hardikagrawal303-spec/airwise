import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config as defaultConfig } from './config/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import {
  createApiRateLimiter,
  createOriginGuard,
  createSecurityHeadersMiddleware,
} from './middleware/security.js';
import { createAirRouter } from './routes/airRoutes.js';
import { createHealthRouter } from './routes/healthRoutes.js';
import { createPlanRouter } from './routes/planRoutes.js';
import { airQualityService as defaultAirService } from './services/airQualityService.js';
import { geminiService as defaultGeminiService } from './services/geminiService.js';
import { createPlanBuilder } from './services/planBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

/**
 * Express application factory (exported for integration tests).
 *
 * @param {object} [deps] - Optional dependency overrides for testing.
 * @param {object} [deps.config] - Validated application configuration.
 * @param {object} [deps.airQualityService] - Air quality and geocoding service.
 * @param {object} [deps.geminiService] - Optional Gemini personalization service.
 * @returns {import('express').Express} Configured Express application.
 */
export function createApp({
  config = defaultConfig,
  airQualityService = defaultAirService,
  geminiService = defaultGeminiService,
} = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  // Strict security headers & CSP
  app.use(createSecurityHeadersMiddleware());

  // Bounded JSON payload parser
  app.use(express.json({ limit: config.jsonBodyLimit || '10kb' }));

  // Static frontend assets (vanilla HTML/CSS/JS + self-hosted fonts & locales)
  app.use(
    express.static(PUBLIC_DIR, {
      index: 'index.html',
      dotfiles: 'ignore',
      maxAge: config.nodeEnv === 'production' ? '1h' : 0,
    })
  );

  // API security middleware: origin check + global rate limit
  const globalLimiter = createApiRateLimiter({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
  });
  const planLimiter = createApiRateLimiter({
    windowMs: config.rateLimitWindowMs,
    max: config.planRateLimitMax,
  });

  app.use(
    '/api',
    createOriginGuard(config.allowedOrigins, {
      trustProxy: config.trustProxy,
      nodeEnv: config.nodeEnv,
    })
  );
  app.use('/api', globalLimiter);

  const planBuilder = createPlanBuilder({ airQualityService, geminiService });

  app.use('/api', createHealthRouter({ aiEnabled: geminiService.isEnabled() }));
  app.use('/api', createAirRouter({ airQualityService }));
  app.use('/api', createPlanRouter({ planBuilder, planRateLimiter: planLimiter }));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
