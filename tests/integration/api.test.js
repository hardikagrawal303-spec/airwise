import { jest } from '@jest/globals';
import request from 'supertest';
import { createGeminiService } from '../../src/services/geminiService.js';
import { AppError, ERROR_CODES } from '../../src/utils/errors.js';
import { createTestApp, validProfile } from './testApp.js';

describe('AirWise API routes integration', () => {
  test('GET /api/health returns status ok and aiEnabled flag', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', aiEnabled: false });
  });

  test('GET /api/geocode validates query and returns results', async () => {
    const { app } = createTestApp();

    const okRes = await request(app).get('/api/geocode?q=Mathura');
    expect(okRes.status).toBe(200);
    expect(okRes.body.results[0].label).toContain('Mathura');

    const badRes = await request(app).get('/api/geocode?q=a');
    expect(badRes.status).toBe(400);
    expect(badRes.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(badRes.body.error.requestId).toBeTruthy();
    expect(JSON.stringify(badRes.body)).not.toContain('Error:');
  });

  test('GET /api/air works with coordinates and with manual PM2.5 override', async () => {
    const { app } = createTestApp();

    const coordRes = await request(app).get('/api/air?lat=27.49&lon=77.67');
    expect(coordRes.status).toBe(200);
    expect(coordRes.body.aqi.category).toBe('Very Poor');
    expect(coordRes.body.bestHours.windowLabel).toBe('13:00 - 15:00');

    const manualRes = await request(app).get('/api/air?manualPm25=20&manualPm10=40');
    expect(manualRes.status).toBe(200);
    expect(manualRes.body.aqi.category).toBe('Good');
    expect(manualRes.body.dataSource).toBe('manual');
  });

  test('POST /api/plan returns full structured plan with coarse risk and no health flag echo', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/plan')
      .send({
        location: { lat: 27.4924, lon: 77.6737, label: 'Mathura, Uttar Pradesh' },
        profile: validProfile,
      });

    expect(res.status).toBe(200);
    expect(res.body.aqi.category).toBe('Very Poor');
    expect(res.body.risk).toEqual({
      vulnerabilityLevel: 'high',
      isSensitiveGroup: true,
    });
    expect(res.body.risk.hasRespiratoryOrHeartCondition).toBeUndefined();
    expect(res.body.plan.copySource).toBe('rules');
    expect(res.body.plan.timeline).toHaveLength(5);
    expect(res.body.plan.items.length).toBeGreaterThanOrEqual(8);
    expect(res.body.plan.items.length).toBeLessThanOrEqual(12);
    expect(res.body.plan.commuteImpact.isEstimate).toBe(true);
    expect(res.body.disclaimer).toBeTruthy();
  });

  test('POST /api/plan falls back gracefully to rules when Gemini returns 403', async () => {
    const failingGemini = createGeminiService({
      apiKey: 'fake-key-for-403-test',
      clientFactory: () => ({
        models: {
          generateContent: jest.fn(async () => {
            const err = new Error('PERMISSION_DENIED');
            err.status = 403;
            throw err;
          }),
        },
      }),
    });

    const { app } = createTestApp({ geminiService: failingGemini });
    const res = await request(app)
      .post('/api/plan')
      .send({
        manual: { pm25: 150, label: 'Delhi' },
        profile: validProfile,
      });

    expect(res.status).toBe(200);
    expect(res.body.plan.copySource).toBe('rules');
    expect(res.body.plan.items.length).toBeGreaterThan(0);
  });

  test('handles AQI upstream failure cleanly while manual override still succeeds', async () => {
    const { app } = createTestApp({
      airOverrides: {
        getAirQuality: jest.fn(async () => {
          throw new AppError(
            ERROR_CODES.AIR_UPSTREAM_FAILED,
            'We could not reach the air-quality service.',
            502
          );
        }),
      },
    });

    const failRes = await request(app)
      .post('/api/plan')
      .send({
        location: { lat: 28.61, lon: 77.21, label: 'Delhi' },
        profile: validProfile,
      });
    expect(failRes.status).toBe(502);
    expect(failRes.body.error.code).toBe(ERROR_CODES.AIR_UPSTREAM_FAILED);
    expect(failRes.body.error.stack).toBeUndefined();

    const manualRes = await request(app)
      .post('/api/plan')
      .send({
        manual: { pm25: 300, label: 'Delhi' },
        profile: validProfile,
      });
    expect(manualRes.status).toBe(200);
    expect(manualRes.body.aqi.category).toBe('Severe');
  });

  test('rejects unknown keys and invalid values with 400 VALIDATION_FAILED', async () => {
    const { app } = createTestApp();

    const unknownKeyRes = await request(app)
      .post('/api/plan')
      .send({
        manual: { pm25: 100 },
        profile: { ...validProfile, extraMaliciousField: 'boom' },
      });
    expect(unknownKeyRes.status).toBe(400);
    expect(unknownKeyRes.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);

    const outOfRangeRes = await request(app)
      .post('/api/plan')
      .send({
        manual: { pm25: -50 },
        profile: validProfile,
      });
    expect(outOfRangeRes.status).toBe(400);
    expect(outOfRangeRes.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });

  test('accepts Devanagari combining marks and Latin place names, and rejects scripts, control chars, and overlong input', async () => {
    const { app } = createTestApp();

    const validPlaces = ['मथुरा', 'देहरादून', 'नई दिल्ली', 'Dehradun, Uttarakhand'];
    for (const place of validPlaces) {
      const geoRes = await request(app).get(`/api/geocode?q=${encodeURIComponent(place)}`);
      expect(geoRes.status).toBe(200);

      const planRes = await request(app)
        .post('/api/plan')
        .send({
          manual: { pm25: 180, label: place },
          profile: { ...validProfile, language: 'hi' },
        });
      expect(planRes.status).toBe(200);
      expect(planRes.body.aqi.placeLabel).toBe(place);
    }

    const invalidGeocodeQueries = [
      '<script>',
      'Mathura\u0000',
      'Mathura\nInject',
      'Mathura\u001b[31m',
      '"Delhi"',
      'अ'.repeat(81),
    ];
    for (const bad of invalidGeocodeQueries) {
      const res = await request(app).get(`/api/geocode?q=${encodeURIComponent(bad)}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    }

    const invalidPlanLabels = [
      '<script>',
      'मथुरा\u0000',
      'मथुरा\r\nदिल्ली',
      '"Mathura"',
      'म'.repeat(101),
    ];
    for (const badLabel of invalidPlanLabels) {
      const res = await request(app)
        .post('/api/plan')
        .send({
          manual: { pm25: 180, label: badLabel },
          profile: validProfile,
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    }
  });
});
