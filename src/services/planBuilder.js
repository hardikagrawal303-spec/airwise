import { calculateAqi } from '../engine/aqi.js';
import { selectActions } from '../engine/actionSelector.js';
import { buildCommuteComparison, estimateExposureReduction } from '../engine/impact.js';
import { evaluateRiskProfile } from '../engine/riskProfile.js';
import { buildTimeSlots } from '../engine/timeSlots.js';
import { VALID_CATEGORIES } from '../knowledge/actions.js';
import { getLocale } from '../knowledge/localeLoader.js';
import { airQualityService as defaultAirService } from './airQualityService.js';
import { geminiService as defaultGeminiService } from './geminiService.js';

/**
 * Orchestrate the full AirWise decision pipeline:
 * 1. Obtain PM2.5 / PM10 (Open-Meteo or manual override)
 * 2. Compute transparent CPCB AQI
 * 3. Evaluate household risk profile (in-request only)
 * 4. Run deterministic rule engine to select <=12 actions
 * 5. Build 5-daypart timeline + cleanest hours
 * 6. Calculate transparent commute CO2e savings & exposure notes
 * 7. Personalize wording with Gemini (or fall back seamlessly to locale rules)
 */
export function createPlanBuilder({
  airQualityService = defaultAirService,
  geminiService = defaultGeminiService,
} = {}) {
  async function buildPlan({ location, manual, profile }) {
    let airReading;
    let placeLabel;

    if (manual && typeof manual.pm25 === 'number') {
      airReading = {
        pm25: manual.pm25,
        pm10: typeof manual.pm10 === 'number' ? manual.pm10 : null,
        observedAt: new Date().toISOString(),
        hourly: null,
        source: 'manual',
        cached: false,
      };
      placeLabel = manual.label ? String(manual.label).trim() : '';
    } else {
      airReading = await airQualityService.getAirQuality(location.lat, location.lon);
      placeLabel = location.label ? String(location.label).trim() : '';
    }

    const aqiResult = calculateAqi({
      pm25: airReading.pm25,
      pm10: airReading.pm10,
    });

    const risk = evaluateRiskProfile(profile, aqiResult);
    const selectedActions = selectActions({ aqiResult, profile, risk });
    const { timeline, bestHours } = buildTimeSlots({
      aqiResult,
      actions: selectedActions,
      hourlyData: airReading.hourly,
    });

    const commuteImpact = buildCommuteComparison(profile);
    const language = profile.language === 'hi' ? 'hi' : 'en';
    const locale = getLocale(language);

    const personalized = await geminiService.personalizePlan({
      aqiResult,
      risk,
      selectedActions,
      language,
    });

    const personalizedMap = new Map(personalized.items.map((item) => [item.actionId, item]));

    const items = selectedActions.map((action) => {
      const p = personalizedMap.get(action.id);
      return {
        id: action.id,
        category: action.category,
        daypart: action.daypart,
        cost: action.cost,
        effort: action.effort,
        text: p?.personalizedText || locale[action.textKey] || action.id,
        whyItMatters: p?.whyItMatters || locale[action.impactNoteKey] || '',
        impact: estimateExposureReduction(action.id),
      };
    });

    const sections = Object.fromEntries(
      VALID_CATEGORIES.map((category) => [
        category,
        items.filter((item) => item.category === category),
      ])
    );

    const timelineWithText = timeline.map((slot) => ({
      daypart: slot.daypart,
      timeWindow: slot.timeWindow,
      guidance: locale[slot.guidanceKey] || '',
      guidanceKey: slot.guidanceKey,
      isPattern: slot.isPattern,
      actionIds: slot.actionIds,
    }));

    return {
      aqi: {
        ...aqiResult,
        pm25: airReading.pm25,
        pm10: airReading.pm10,
        observedAt: airReading.observedAt,
        dataSource: airReading.source,
        placeLabel,
      },
      // Coarse risk summary only — never echoes back health condition boolean
      risk: {
        vulnerabilityLevel: risk.vulnerabilityLevel,
        isSensitiveGroup: risk.isSensitiveGroup,
      },
      plan: {
        headline: personalized.headline,
        summary: personalized.summary,
        sections,
        timeline: timelineWithText,
        items,
        commuteImpact,
        bestHours,
        familyTip: personalized.familyTip,
        source: personalized.source,
      },
      disclaimer: locale['footer.disclaimer'],
      generatedAt: new Date().toISOString(),
    };
  }

  return { buildPlan };
}

export const planBuilder = createPlanBuilder();
