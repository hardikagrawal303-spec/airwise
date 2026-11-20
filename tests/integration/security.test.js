import { jest } from '@jest/globals';
import request from 'supertest';
import { loadConfig } from '../../src/config/index.js';
import { ERROR_CODES } from '../../src/utils/errors.js';
import { createTestApp } from './testApp.js';

describe('AirWise API security middleware', () => {
  test('applies strict CSP and security headers and hides x-powered-by', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).toContain("style-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
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

      const noOriginRes = await request(app).get('/api/health').set('Host', 'airwise.run.app');
      expect(noOriginRes.status).toBe(200);

      const sameHostRes = await request(app)
        .get('/api/health')
        .set('Host', 'ais-dev-sample.asia-northeast1.run.app')
        .set('Origin', 'https://ais-dev-sample.asia-northeast1.run.app');
      expect(sameHostRes.status).toBe(200);

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

    const secondHopRejected = await request(trustedApp)
      .get('/api/health')
      .set('Host', '127.0.0.1:3000')
      .set('X-Forwarded-Host', 'ais-pre-sample.asia-northeast1.run.app, evil.example.com')
      .set('Origin', 'https://evil.example.com');
    expect(secondHopRejected.status).toBe(403);
    expect(secondHopRejected.body.error.code).toBe(ERROR_CODES.ORIGIN_NOT_ALLOWED);

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

    const prodLocalhostBlocked = await request(app)
      .get('/api/health')
      .set('Host', 'airwise.run.app')
      .set('Origin', 'http://localhost:5173');
    expect(prodLocalhostBlocked.status).toBe(403);
    expect(prodLocalhostBlocked.body.error.code).toBe(ERROR_CODES.ORIGIN_NOT_ALLOWED);
  });

  test('TRUST_PROXY defaults to 1 on Cloud Run / AI Studio preview, accepts false/integers/CIDR, and rejects true or invalid values', () => {
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

    const explicitZero = loadConfig({ NODE_ENV: 'test', TRUST_PROXY: '0' });
    expect(explicitZero.trustProxy).toBe(0);

    const explicitOverrideHops = loadConfig({ NODE_ENV: 'test', TRUST_PROXY: '2' });
    expect(explicitOverrideHops.trustProxy).toBe(2);

    const ipv4Cidr = loadConfig({
      NODE_ENV: 'test',
      TRUST_PROXY: '10.0.0.0/8, 172.16.0.0/12',
    });
    expect(ipv4Cidr.trustProxy).toBe('10.0.0.0/8, 172.16.0.0/12');

    const ipv6Cidr = loadConfig({ NODE_ENV: 'test', TRUST_PROXY: '::1/128' });
    expect(ipv6Cidr.trustProxy).toBe('::1/128');

    expect(() => loadConfig({ NODE_ENV: 'test', TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(() => loadConfig({ NODE_ENV: 'test', TRUST_PROXY: 'TRUE' })).toThrow(/TRUST_PROXY/);
    expect(() => loadConfig({ NODE_ENV: 'test', TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
    expect(() => loadConfig({ NODE_ENV: 'test', TRUST_PROXY: '10.0.0.0/33' })).toThrow(
      /TRUST_PROXY/
    );
    expect(() => loadConfig({ NODE_ENV: 'test', TRUST_PROXY: 'loopback' })).toThrow(/TRUST_PROXY/);
  });

  test('enforces rate limiting and routes 429 RATE_LIMITED through errorHandler with requestId', async () => {
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
    expect(typeof r3.body.error.requestId).toBe('string');
    expect(r3.body.error.requestId.length).toBeGreaterThan(10);
    expect(r3.body.error.message).toBeTruthy();
  });
});
