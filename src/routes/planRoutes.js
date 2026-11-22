import { Router } from 'express';
import { planRequestSchema, validate } from '../middleware/validate.js';

/**
 * Create Express router serving the rate-limited POST /api/plan endpoint.
 *
 * @param {{ planBuilder: import('../types.d.ts').PlanBuilder, planRateLimiter: import('express').RequestHandler }} deps - Route dependencies.
 * @returns {import('express').Router} Configured Express router.
 */
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
