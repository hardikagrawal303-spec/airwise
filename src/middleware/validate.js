import { z } from 'zod';
import { AppError, ERROR_CODES } from '../utils/errors.js';

const PLACE_QUERY_REGEX = /^[\p{L}\p{N}\s,.'()-]+$/u;

export const geocodeQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(2, 'Enter at least 2 characters.')
      .max(80, 'City query must be 80 characters or fewer.')
      .regex(PLACE_QUERY_REGEX, 'Use letters, spaces, and basic punctuation only.'),
  })
  .strict();

export const airQuerySchema = z
  .object({
    lat: z.coerce.number().finite().min(-90).max(90).optional(),
    lon: z.coerce.number().finite().min(-180).max(180).optional(),
    manualPm25: z.coerce.number().finite().min(0).max(1500).optional(),
    manualPm10: z.coerce.number().finite().min(0).max(2000).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasCoords = data.lat !== undefined || data.lon !== undefined;
    const hasManual = data.manualPm25 !== undefined;

    if (!hasCoords && !hasManual) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either lat/lon coordinates or manualPm25.',
      });
    }
    if (hasCoords && (data.lat === undefined || data.lon === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Both lat and lon are required when using coordinates.',
      });
    }
  });

export const householdProfileSchema = z
  .object({
    members: z
      .object({
        children: z.number().int().min(0).max(10),
        elderly: z.number().int().min(0).max(10),
        adults: z.number().int().min(1).max(10),
      })
      .strict(),
    hasRespiratoryOrHeartCondition: z.boolean(),
    commute: z.enum([
      'walk',
      'cycle',
      'two_wheeler',
      'car',
      'bus',
      'metro',
      'auto',
      'work_from_home',
    ]),
    commuteKmPerDay: z.number().finite().min(0).max(200),
    cookingFuel: z.enum(['lpg', 'induction', 'wood_or_biomass', 'kerosene', 'piped_gas']),
    hasPurifier: z.boolean(),
    budget: z.enum(['low', 'medium', 'high']),
    homeType: z.enum(['apartment', 'independent_house']),
    language: z.enum(['en', 'hi']).default('en'),
  })
  .strict();

const locationInputSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
    label: z
      .string()
      .trim()
      .max(100)
      .regex(/^[\p{L}\p{N}\s,.'()-]*$/u, 'Invalid place label characters.')
      .optional(),
  })
  .strict();

const manualAirInputSchema = z
  .object({
    pm25: z.number().finite().min(0).max(1500),
    pm10: z.number().finite().min(0).max(2000).nullable().optional(),
    label: z
      .string()
      .trim()
      .max(100)
      .regex(/^[\p{L}\p{N}\s,.'()-]*$/u, 'Invalid place label characters.')
      .optional(),
  })
  .strict();

export const planRequestSchema = z
  .object({
    location: locationInputSchema.optional(),
    manual: manualAirInputSchema.optional(),
    profile: householdProfileSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.location && !data.manual) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either location coordinates or manual PM2.5 reading.',
      });
    }
    if (data.location && data.manual) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either location or manual reading, not both.',
      });
    }
  });

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const raw = source === 'query' ? req.query : req.body;
    const result = schema.safeParse(raw);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => ({
        path: issue.path.join('.') || source,
        message: issue.message,
      }));
      return next(
        new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          'Some input fields are invalid or missing.',
          400,
          fields
        )
      );
    }

    if (source === 'query') {
      req.validatedQuery = result.data;
    } else {
      req.validatedBody = result.data;
    }
    return next();
  };
}
