import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  buildCompactPromptPayload,
  buildRuleBasedContent,
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  validateAndSanitizeModelOutput,
} from './geminiSchema.js';

export { buildCompactPromptPayload };

function isNonRetryableError(err) {
  const status = err?.status || err?.statusCode || err?.code;
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return true;
  }
  const msg = String(err?.message || '');
  return /\b(400|401|403|404|PERMISSION_DENIED|API_KEY_INVALID|NOT_FOUND)\b/i.test(msg);
}

async function callWithTimeout(promiseFn, timeoutMs) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('Gemini request timed out');
      err.code = 'TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFn(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

function buildGeminiRequestConfig(model) {
  const isGemini4 = String(model).startsWith('gemini-4-');
  const requestConfig = {
    systemInstruction: SYSTEM_INSTRUCTION,
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
    maxOutputTokens: isGemini4 ? config.geminiMaxOutputTokens : config.geminiLegacyMaxOutputTokens,
  };

  // Gemini 4 models reject legacy sampling parameters like temperature and
  // include reasoning tokens inside maxOutputTokens; use MINIMAL thinking for speed.
  if (isGemini4) {
    requestConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
  } else {
    requestConfig.temperature = config.geminiLegacyTemperature;
  }
  return requestConfig;
}

async function callGeminiWithRetry({
  aiClient,
  model,
  payload,
  requestConfig,
  allowedActionIds,
  timeoutMs,
  fallback,
}) {
  const maxAttempts = config.geminiMaxAttempts;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await callWithTimeout(
        () =>
          aiClient.models.generateContent({
            model,
            contents: JSON.stringify(payload),
            config: requestConfig,
          }),
        timeoutMs
      );

      const checked = validateAndSanitizeModelOutput(response?.text, allowedActionIds);
      if (checked.ok) return checked.value;

      logger.warn('Gemini response failed validation; falling back to rule-based plan', {
        reason: checked.reason,
        attempt,
      });
      return fallback;
    } catch (err) {
      const nonRetryable = isNonRetryableError(err);
      logger.warn('Gemini personalization call failed', {
        attempt,
        code: err?.code || err?.status || 'UNKNOWN',
        nonRetryable,
      });
      if (nonRetryable || attempt >= maxAttempts) return fallback;
    }
  }
  return fallback;
}

/**
 * Create a constrained Gemini personalization service with silent rule-based fallback.
 *
 * @param {object} [options] - Service configuration and test overrides.
 * @param {string|null} [options.apiKey] - Gemini API key (null disables AI calls).
 * @param {string} [options.model] - Target Gemini model identifier.
 * @param {number} [options.timeoutMs] - Per-call timeout in milliseconds.
 * @param {Function|null} [options.clientFactory=null] - Optional SDK factory for tests.
 * @returns {{ isEnabled: () => boolean, personalizePlan: Function }} Gemini personalization service.
 */
export function createGeminiService({
  apiKey = config.geminiApiKey,
  model = config.geminiModel,
  timeoutMs = config.geminiTimeoutMs,
  clientFactory = null,
} = {}) {
  const aiEnabled = Boolean(apiKey && String(apiKey).trim().length > 0);
  let client = null;

  function getClient() {
    if (!aiEnabled) return null;
    if (!client) {
      client =
        typeof clientFactory === 'function'
          ? clientFactory({ apiKey })
          : new GoogleGenAI({
              apiKey,
              httpOptions: { headers: { 'User-Agent': 'airwise/1.0.0' } },
            });
    }
    return client;
  }

  async function personalizePlan({ aqiResult, risk, selectedActions, language = 'en' }) {
    const fallback = buildRuleBasedContent({ aqiResult, risk, selectedActions, language });
    const aiClient = getClient();
    if (!aiClient || !Array.isArray(selectedActions) || selectedActions.length === 0) {
      return fallback;
    }

    return callGeminiWithRetry({
      aiClient,
      model,
      payload: buildCompactPromptPayload({ aqiResult, risk, selectedActions, language }),
      requestConfig: buildGeminiRequestConfig(model),
      allowedActionIds: selectedActions.map((a) => a.id),
      timeoutMs,
      fallback,
    });
  }

  return { isEnabled: () => aiEnabled, personalizePlan };
}

export const geminiService = createGeminiService();
