import { Router } from 'express';
import { planRequestSchema, validate } from '../middleware/validate.js';

export function createPlanRouter({ planBuilder, planRateLimiter }) {
  const router = Router();

  router.post(
    '/plan',
    planRateLimiter,
    validate(planRequestSchema, 'body'),
    async (req, res, next) => {
      try {
        const result = await planBuilder.buildPlan(req.validatedBody);
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
