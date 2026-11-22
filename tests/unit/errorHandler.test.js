import { jest } from '@jest/globals';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler.js';
import { AppError, ERROR_CODES } from '../../src/utils/errors.js';

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('Centralized error handler middleware (src/middleware/errorHandler.js)', () => {
  test('notFoundHandler forwards a 404 NOT_FOUND AppError', () => {
    const next = jest.fn();
    notFoundHandler({}, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(err.statusCode).toBe(404);
  });

  test('normalizes entity.too.large and status 413 errors to PAYLOAD_TOO_LARGE with requestId', () => {
    const res = createMockRes();
    const err = Object.assign(new Error('request entity too large'), { type: 'entity.too.large' });

    errorHandler(err, { path: '/api/plan' }, res, () => {});

    expect(res.statusCode).toBe(413);
    expect(res.body.error.code).toBe(ERROR_CODES.PAYLOAD_TOO_LARGE);
    expect(typeof res.body.error.requestId).toBe('string');
    expect(res.body.error.requestId.length).toBeGreaterThan(10);
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });

  test('normalizes malformed JSON body errors (entity.parse.failed) to 400 VALIDATION_FAILED', () => {
    const res = createMockRes();
    const err = Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed' });

    errorHandler(err, { path: '/api/plan' }, res, () => {});

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(res.body.error.requestId).toBeTruthy();
  });

  test('formats AppError responses with and without field details and never leaks stacks', () => {
    const resWithFields = createMockRes();
    const appErr = new AppError(ERROR_CODES.VALIDATION_FAILED, 'Invalid input.', 400, [
      { path: 'q', message: 'Too short' },
    ]);
    errorHandler(appErr, { path: '/api/geocode' }, resWithFields, () => {});

    expect(resWithFields.statusCode).toBe(400);
    expect(resWithFields.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(resWithFields.body.error.fields).toEqual([{ path: 'q', message: 'Too short' }]);
    expect(resWithFields.body.error.requestId).toBeTruthy();

    const resSimple = createMockRes();
    errorHandler(
      new AppError(ERROR_CODES.RATE_LIMITED, 'Slow down.', 429),
      { path: '/api/plan' },
      resSimple,
      () => {}
    );
    expect(resSimple.statusCode).toBe(429);
    expect(resSimple.body.error.fields).toBeUndefined();
  });

  test('masks unexpected internal errors as 500 INTERNAL_ERROR with requestId and zero stack traces', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = createMockRes();
    const unexpected = new Error('SECRET_INTERNAL_DETAIL_123');

    try {
      errorHandler(unexpected, { path: '/api/plan' }, res, () => {});
    } finally {
      errorSpy.mockRestore();
    }

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(res.body.error.requestId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('SECRET_INTERNAL_DETAIL_123');
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });
});
