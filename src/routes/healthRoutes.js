import { Router } from 'express';

/**
 * Create Express router serving the /api/health liveness endpoint.
 *
 * @param {object} deps - Route dependencies.
 * @param {boolean} deps.aiEnabled - Whether Gemini personalization is enabled.
 * @returns {import('express').Router} Configured Express router.
 */
export function createHealthRouter({ aiEnabled }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      aiEnabled: Boolean(aiEnabled),
    });
  });

  return router;
}
