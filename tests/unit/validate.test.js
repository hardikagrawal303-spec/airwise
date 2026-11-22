import { jest } from '@jest/globals';
import {
  airQuerySchema,
  geocodeQuerySchema,
  planRequestSchema,
  validate,
} from '../../src/middleware/validate.js';
import { AppError, ERROR_CODES } from '../../src/utils/errors.js';

const baseProfile = {
  members: { adults: 2, children: 1, elderly: 0 },
  hasRespiratoryOrHeartCondition: false,
  commute: 'car',
  commuteKmPerDay: 15,
  cookingFuel: 'lpg',
  hasPurifier: false,
  budget: 'medium',
  homeType: 'apartment',
  language: 'en',
};

describe('Validation middleware and Zod schemas (src/middleware/validate.js)', () => {
  test('geocodeQuerySchema accepts Latin and Devanagari place queries and rejects unknown keys or unsafe characters', () => {
    expect(geocodeQuerySchema.safeParse({ q: 'नई दिल्ली' }).success).toBe(true);
    expect(geocodeQuerySchema.safeParse({ q: 'Dehradun, Uttarakhand' }).success).toBe(true);
    expect(geocodeQuerySchema.safeParse({ q: 'Delhi', extra: 'nope' }).success).toBe(false);
    expect(geocodeQuerySchema.safeParse({ q: 'Delhi<script>' }).success).toBe(false);
    expect(geocodeQuerySchema.safeParse({ q: 'A' }).success).toBe(false);
  });

  test('airQuerySchema enforces coords-or-manual invariant and rejects partial coordinates or unknown keys', () => {
    expect(airQuerySchema.safeParse({ lat: '28.6', lon: '77.2' }).success).toBe(true);
    expect(airQuerySchema.safeParse({ manualPm25: '180' }).success).toBe(true);
    expect(airQuerySchema.safeParse({}).success).toBe(false);
    expect(airQuerySchema.safeParse({ lat: '28.6' }).success).toBe(false);
    expect(airQuerySchema.safeParse({ manualPm25: '180', extra: 1 }).success).toBe(false);
  });

  test('planRequestSchema rejects unknown nested keys, missing location/manual, and simultaneous location+manual', () => {
    expect(
      planRequestSchema.safeParse({ manual: { pm25: 120, label: 'मथुरा' }, profile: baseProfile })
        .success
    ).toBe(true);

    expect(planRequestSchema.safeParse({ profile: baseProfile }).success).toBe(false);
    expect(
      planRequestSchema.safeParse({
        location: { lat: 28.6, lon: 77.2 },
        manual: { pm25: 120 },
        profile: baseProfile,
      }).success
    ).toBe(false);
    expect(
      planRequestSchema.safeParse({
        manual: { pm25: 120 },
        profile: { ...baseProfile, extraField: true },
      }).success
    ).toBe(false);
  });

  test('validate() populates req.validatedBody and req.validatedQuery on valid inputs', () => {
    const bodyMiddleware = validate(planRequestSchema, 'body');
    const bodyReq = { body: { manual: { pm25: 90 }, profile: baseProfile } };
    const nextBody = jest.fn();
    bodyMiddleware(bodyReq, {}, nextBody);
    expect(nextBody).toHaveBeenCalledWith();
    expect(bodyReq.validatedBody.manual.pm25).toBe(90);

    const queryMiddleware = validate(geocodeQuerySchema, 'query');
    const queryReq = { query: { q: 'Mathura' } };
    const nextQuery = jest.fn();
    queryMiddleware(queryReq, {}, nextQuery);
    expect(nextQuery).toHaveBeenCalledWith();
    expect(queryReq.validatedQuery).toEqual({ q: 'Mathura' });
  });

  test('validate() forwards structured 400 AppError with field details on invalid input', () => {
    const middleware = validate(geocodeQuerySchema, 'query');
    const req = { query: { q: 'x' } };
    const next = jest.fn();

    middleware(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(err.statusCode).toBe(400);
    expect(Array.isArray(err.details)).toBe(true);
    expect(err.details[0].path).toBe('q');
  });
});
