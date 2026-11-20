import { Router } from 'express';
import { calculateAqi } from '../engine/aqi.js';
import { findBestHours } from '../engine/timeSlots.js';
import { airQuerySchema, geocodeQuerySchema, validate } from '../middleware/validate.js';
import { createManualAirReading } from '../services/airQualityService.js';

/**
 * Create Express router serving /api/geocode and /api/air endpoints.
 *
 * @param {object} deps - Route dependencies.
 * @param {object} deps.airQualityService - Air quality and geocoding service.
 * @returns {import('express').Router} Configured Express router.
 */
export function createAirRouter({ airQualityService }) {
  const router = Router();

  router.get('/geocode', validate(geocodeQuerySchema, 'query'), async (req, res, next) => {
    try {
      const results = await airQualityService.geocode(req.validatedQuery.q);
      res.json({ results });
    } catch (err) {
      next(err);
    }
  });

  router.get('/air', validate(airQuerySchema, 'query'), async (req, res, next) => {
    try {
      const { lat, lon, manualPm25, manualPm10 } = req.validatedQuery;

      const reading =
        manualPm25 !== undefined
          ? createManualAirReading({ pm25: manualPm25, pm10: manualPm10 })
          : await airQualityService.getAirQuality(lat, lon);

      const aqi = calculateAqi({ pm25: reading.pm25, pm10: reading.pm10 });
      const bestHours = findBestHours(reading.hourly);

      res.json({
        pm25: reading.pm25,
        pm10: reading.pm10,
        aqi,
        bestHours,
        observedAt: reading.observedAt,
        dataSource: reading.dataSource,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
