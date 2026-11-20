import { Router } from 'express';

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
