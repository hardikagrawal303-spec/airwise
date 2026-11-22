/**
 * Minimal structured logger.
 * Never logs personal data (household profiles, health flags, precise coordinates, or API keys).
 */

const REDACTED_KEYS = new Set([
  'apiKey',
  'GEMINI_API_KEY',
  'hasRespiratoryOrHeartCondition',
  'profile',
  'authorization',
  'cookie',
]);

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return undefined;
  }
  const clean = {};
  for (const [key, value] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(key)) {
      clean[key] = '[REDACTED]';
    } else if (key === 'lat' || key === 'lon') {
      clean[key] = typeof value === 'number' ? Number(value.toFixed(2)) : '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 200) {
      clean[key] = `${value.slice(0, 200)}...`;
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function emit(level, message, meta) {
  if (process.env.NODE_ENV === 'test' && level !== 'error') {
    return;
  }
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: String(message),
  };
  const safeMeta = sanitizeMeta(meta);
  if (safeMeta && Object.keys(safeMeta).length > 0) {
    entry.meta = safeMeta;
  }
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** @type {Readonly<{ info: (msg: string, meta?: Record<string, unknown>) => void, warn: (msg: string, meta?: Record<string, unknown>) => void, error: (msg: string, meta?: Record<string, unknown>) => void }>} */
export const logger = Object.freeze({
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
});
