import { Router } from 'express';
import { calculateAqi } from '../engine/aqi.js';
import { findBestHours } from '../engine/timeSlots.js';
import { airQuerySchema, geocodeQuerySchema, validate } from '../middleware/validate.js';

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

      let reading;
      if (manualPm25 !== undefined) {
        reading = {
          pm25: manualPm25,
          pm10: manualPm10 !== undefined ? manualPm10 : null,
          observedAt: new Date().toISOString(),
          hourly: null,
          source: 'manual',
          cached: false,
        };
      } else {
        reading = await airQualityService.getAirQuality(lat, lon);
      }

      const aqi = calculateAqi({ pm25: reading.pm25, pm10: reading.pm10 });
      const bestHours = findBestHours(reading.hourly);

      res.json({
        pm25: reading.pm25,
        pm10: reading.pm10,
        aqi,
        bestHours,
        observedAt: reading.observedAt,
        dataSource: reading.source,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
