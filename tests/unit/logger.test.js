import { jest } from '@jest/globals';
import { logger } from '../../src/utils/logger.js';

describe('logger PII redaction and log levels', () => {
  const prevEnv = process.env.NODE_ENV;
  let logSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('redacts apiKey, authorization, cookie, health flags, and rounds/redacts lat and lon', () => {
    process.env.NODE_ENV = 'production';

    logger.info('Audit check', {
      apiKey: 'secret-key-123',
      GEMINI_API_KEY: 'secret-gemini-key',
      authorization: 'Bearer tok_abc',
      cookie: 'session=xyz',
      hasRespiratoryOrHeartCondition: true,
      profile: { adults: 2 },
      lat: 27.492412,
      lon: 77.673789,
      longNote: 'x'.repeat(250),
      safeCode: 'OK',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(logSpy.mock.calls[0][0]);
    expect(entry.level).toBe('info');
    expect(entry.meta).toEqual({
      apiKey: '[REDACTED]',
      GEMINI_API_KEY: '[REDACTED]',
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      hasRespiratoryOrHeartCondition: '[REDACTED]',
      profile: '[REDACTED]',
      lat: 27.49,
      lon: 77.67,
      longNote: `${'x'.repeat(200)}...`,
      safeCode: 'OK',
    });
  });

  test('redacts non-numeric lat/lon and emits warn/error appropriately across environments', () => {
    process.env.NODE_ENV = 'development';
    logger.warn('Non-numeric coords', { lat: '27.49', lon: null });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warnSpy.mock.calls[0][0]).meta).toEqual({
      lat: '[REDACTED]',
      lon: '[REDACTED]',
    });

    process.env.NODE_ENV = 'test';
    logger.info('suppressed info');
    logger.warn('suppressed warn');
    logger.error('visible error', { cookie: 'sid=1' });

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const errEntry = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(errEntry.level).toBe('error');
    expect(errEntry.meta.cookie).toBe('[REDACTED]');
  });
});
