import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { createGeminiService } from '../../src/services/geminiService.js';
import { AppError, ERROR_CODES } from '../../src/utils/errors.js';

const validProfile = {
  members: { children: 1, elderly: 1, adults: 2 },
  hasRespiratoryOrHeartCondition: true,
  commute: 'car',
  commuteKmPerDay: 18,
  cookingFuel: 'lpg',
  hasPurifier: false,
  budget: 'low',
  homeType: 'apartment',
  language: 'en',
};

function createTestApp({
  airOverrides = {},
  geminiService = createGeminiService({ apiKey: null }),
  configOverrides = {},
} = {}) {
  const baseConfig = loadConfig({
    NODE_ENV: 'test',
    PORT: '3000',
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_MAX: '50',
    ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    ...configOverrides,
  });

  const airQualityService = {
    geocode: jest.fn(async (q) => [
      {
        name: q,
        admin1: 'Uttar Pradesh',
        country: 'India',
        countryCode: 'IN',
        label: `${q}, Uttar Pradesh, India`,
        lat: 27.4924,
        lon: 77.6737,
      },
    ]),
    getAirQuality: jest.fn(async () => ({
      pm25: 168,
      pm10: 230,
      observedAt: '2026-11-19T08:00',
      timezone: 'Asia/Kolkata',
      hourly: {
        time: ['2026-11-19T13:00', '2026-11-19T14:00', '2026-11-19T15:00'],
        pm2_5: [120, 108, 114],
      },
      source: 'open-meteo',
      cached: false,
    })),
    ...airOverrides,
  };

  return {
    app: createApp({ config: baseConfig, airQualityService, geminiService }),
    airQualityService,
  };
}

describe('AirWise API integration & security', () => {
  test('GET /api/health returns status ok, aiEnabled flag, and strict security headers', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', aiEnabled: false });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).toContain("style-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
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
    expect(res.body.plan.source).toBe('rules');
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
    expect(res.body.plan.source).toBe('rules');
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

  test('rejects oversized JSON body (>10kb) with 413 PAYLOAD_TOO_LARGE', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/plan')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(15000) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe(ERROR_CODES.PAYLOAD_TOO_LARGE);
    expect(res.body.error.stack).toBeUndefined();
  });

  test('origin guard: allows missing Origin, matching Host, non-prod localhost any port, and rejects foreign Origin with ORIGIN_NOT_ALLOWED', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const { app } = createTestApp({
        configOverrides: { NODE_ENV: 'development', TRUST_PROXY: 'false', ALLOWED_ORIGINS: '' },
      });

      // 1. No Origin header
      const noOriginRes = await request(app).get('/api/health').set('Host', 'airwise.run.app');
      expect(noOriginRes.status).toBe(200);

      // 2. Same Host header
      const sameHostRes = await request(app)
        .get('/api/health')
        .set('Host', 'ais-dev-sample.asia-northeast1.run.app')
        .set('Origin', 'https://ais-dev-sample.asia-northeast1.run.app');
      expect(sameHostRes.status).toBe(200);

      // 3. Non-production localhost & 127.0.0.1 on any port
      const devLocalhostRes = await request(app)
        .get('/api/health')
        .set('Host', 'localhost:3000')
        .set('Origin', 'http://localhost:5173');
      expect(devLocalhostRes.status).toBe(200);

      const devLoopbackRes = await request(app)
        .get('/api/health')
        .set('Host', 'localhost:3000')
        .set('Origin', 'http://127.0.0.1:4173');
      expect(devLoopbackRes.status).toBe(200);

      // 4. Foreign Origin rejected with 403 ORIGIN_NOT_ALLOWED and single warning log
      warnSpy.mockClear();
      const foreignRes = await request(app)
        .get('/api/health')
        .set('Host', 'localhost:3000')
        .set('X-Forwarded-Host', 'proxy.internal')
        .set('Origin', 'https://untrusted.example.com');
      expect(foreignRes.status).toBe(403);
      expect(foreignRes.body.error.code).toBe(ERROR_CODES.ORIGIN_NOT_ALLOWED);

      const originWarnLogs = warnSpy.mock.calls
        .map((args) => JSON.parse(args[0]))
        .filter((entry) => entry.msg === 'Rejected request origin');
      expect(originWarnLogs).toHaveLength(1);
      expect(originWarnLogs[0].meta).toEqual({
        origin: 'https://untrusted.example.com',
        host: 'localhost:3000',
        xForwardedHost: 'proxy.internal',
      });
    } finally {
      process.env.NODE_ENV = prevEnv;
      warnSpy.mockRestore();
    }
  });

  test('origin guard: trusts first X-Forwarded-Host only when TRUST_PROXY is enabled', async () => {
    const { app: trustedApp } = createTestApp({
      configOverrides: { NODE_ENV: 'production', TRUST_PROXY: '1', ALLOWED_ORIGINS: '' },
    });

    const forwardedAllowed = await request(trustedApp)
      .get('/api/health')
      .set('Host', '127.0.0.1:3000')
      .set('X-Forwarded-Host', 'ais-pre-sample.asia-northeast1.run.app, internal-hop.local')
      .set('Origin', 'https://ais-pre-sample.asia-northeast1.run.app');
    expect(forwardedAllowed.status).toBe(200);

    // Second hop in X-Forwarded-Host must NOT be trusted
    const secondHopRejected = await request(trustedApp)
      .get('/api/health')
      .set('Host', '127.0.0.1:3000')
      .set('X-Forwarded-Host', 'ais-pre-sample.asia-northeast1.run.app, evil.example.com')
      .set('Origin', 'https://evil.example.com');
    expect(secondHopRejected.status).toBe(403);
    expect(secondHopRejected.body.error.code).toBe(ERROR_CODES.ORIGIN_NOT_ALLOWED);

    // When TRUST_PROXY is false, X-Forwarded-Host must NOT be trusted
    const { app: untrustedApp } = createTestApp({
      configOverrides: { NODE_ENV: 'production', TRUST_PROXY: 'false', ALLOWED_ORIGINS: '' },
    });
    const forwardedBlocked = await request(untrustedApp)
      .get('/api/health')
      .set('Host', '127.0.0.1:3000')
      .set('X-Forwarded-Host', 'ais-pre-sample.asia-northeast1.run.app')
      .set('Origin', 'https://ais-pre-sample.asia-northeast1.run.app');
    expect(forwardedBlocked.status).toBe(403);
    expect(forwardedBlocked.body.error.code).toBe(ERROR_CODES.ORIGIN_NOT_ALLOWED);
  });

  test('origin guard: allows extra ALLOWED_ORIGINS with trimming and trailing slashes removed, and blocks non-matching localhost in production', async () => {
    const { app } = createTestApp({
      configOverrides: {
        NODE_ENV: 'production',
        TRUST_PROXY: 'false',
        ALLOWED_ORIGINS: ' https://community.airwise.in/ , https://rwa.example.org/// ',
      },
    });

    const allowedExtra = await request(app)
      .get('/api/health')
      .set('Host', 'internal:3000')
      .set('Origin', 'https://community.airwise.in');
    expect(allowedExtra.status).toBe(200);

    const allowedSecond = await request(app)
      .get('/api/health')
      .set('Host', 'internal:3000')
      .set('Origin', 'https://rwa.example.org/');
    expect(allowedSecond.status).toBe(200);

    // In production, arbitrary localhost ports are not allowed unless in ALLOWED_ORIGINS or Host
    const prodLocalhostBlocked = await request(app)
      .get('/api/health')
      .set('Host', 'airwise.run.app')
      .set('Origin', 'http://localhost:5173');
    expect(prodLocalhostBlocked.status).toBe(403);
    expect(prodLocalhostBlocked.body.error.code).toBe(ERROR_CODES.ORIGIN_NOT_ALLOWED);
  });

  test('TRUST_PROXY defaults to 1 on Cloud Run / AI Studio preview, false locally, and remains configurable', () => {
    const cloudRunCfg = loadConfig({ NODE_ENV: 'test', K_SERVICE: 'airwise-svc' });
    expect(cloudRunCfg.trustProxy).toBe(1);

    const aiStudioCfg = loadConfig({
      NODE_ENV: 'test',
      APP_URL: 'https://ais-dev-example.run.app',
    });
    expect(aiStudioCfg.trustProxy).toBe(1);

    const localCfg = loadConfig({ NODE_ENV: 'test' });
    expect(localCfg.trustProxy).toBe(false);

    const explicitOverrideOff = loadConfig({
      NODE_ENV: 'test',
      K_SERVICE: 'airwise-svc',
      TRUST_PROXY: 'false',
    });
    expect(explicitOverrideOff.trustProxy).toBe(false);

    const explicitOverrideHops = loadConfig({
      NODE_ENV: 'test',
      TRUST_PROXY: '2',
    });
    expect(explicitOverrideHops.trustProxy).toBe(2);
  });

  test('enforces rate limiting and returns 429 RATE_LIMITED', async () => {
    const { app } = createTestApp({
      configOverrides: { RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '60000' },
    });

    const r1 = await request(app).get('/api/health');
    const r2 = await request(app).get('/api/health');
    const r3 = await request(app).get('/api/health');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.body.error.code).toBe(ERROR_CODES.RATE_LIMITED);
  });
});
