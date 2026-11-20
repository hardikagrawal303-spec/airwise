import { CATEGORY_RANK } from '../config/aqiBreakpoints.js';

/**
 * Time-of-day guidance for winter smog in North India.
 *
 * When hourly PM2.5 readings from Open-Meteo are available, identifies the
 * cleanest 2-3 hour window in the next 24 hours. Otherwise returns the
 * well-documented North Indian winter inversion pattern (worst early morning
 * and late evening/night; relatively better mid-afternoon), clearly flagged
 * as a general pattern rather than a forecast.
 */

export const DAYPART_ORDER = Object.freeze([
  'early_morning',
  'school_work_run',
  'midday',
  'evening',
  'night',
]);

const DEFAULT_TIME_WINDOWS = Object.freeze({
  early_morning: '05:30 - 07:30',
  school_work_run: '07:30 - 10:00',
  midday: '12:00 - 16:00',
  evening: '17:30 - 20:30',
  night: '20:30 - 05:30',
});

function formatHourRange(startIso, endIso) {
  const extractHHMM = (iso) => {
    const match = /T(\d{2}:\d{2})/.exec(String(iso));
    return match ? match[1] : String(iso);
  };
  return `${extractHHMM(startIso)} - ${extractHHMM(endIso)}`;
}

function buildPatternFallback() {
  return {
    windowSource: 'pattern',
    isForecast: false,
    isPattern: true,
    windowLabel: '13:00 - 16:00',
    hours: [],
    averagePm25: null,
    noteKey: 'timeslots.pattern_disclaimer',
  };
}

function findLowestPm25Window(points) {
  // Prefer the cleanest 3-hour contiguous window if at least 3 points exist
  if (points.length >= 3) {
    let bestStart = 0;
    let bestAvg = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= points.length - 3; i += 1) {
      const avg = (points[i].pm25 + points[i + 1].pm25 + points[i + 2].pm25) / 3;
      if (avg < bestAvg) {
        bestAvg = avg;
        bestStart = i;
      }
    }
    const slice = points.slice(bestStart, bestStart + 3);
    return {
      windowSource: 'hourly_model',
      isForecast: true,
      isPattern: false,
      windowLabel: formatHourRange(slice[0].time, slice[slice.length - 1].time),
      hours: slice.map((p) => ({ time: p.time, pm25: Math.round(p.pm25 * 10) / 10 })),
      averagePm25: Math.round(bestAvg * 10) / 10,
      noteKey: 'timeslots.hourly_note',
    };
  }

  const cleanest = [...points].sort((a, b) => a.pm25 - b.pm25)[0];
  return {
    windowSource: 'hourly_model',
    isForecast: true,
    isPattern: false,
    windowLabel: formatHourRange(cleanest.time, cleanest.time),
    hours: [{ time: cleanest.time, pm25: Math.round(cleanest.pm25 * 10) / 10 }],
    averagePm25: Math.round(cleanest.pm25 * 10) / 10,
    noteKey: 'timeslots.hourly_note',
  };
}

/**
 * Find the lowest-PM2.5 hours in the next 24h from Open-Meteo hourly data.
 *
 * @param {{ time: string[], pm2_5: Array<number|null> }|null} hourlyData - Optional Open-Meteo hourly series.
 * @returns {object} Cleanest window metadata or North Indian winter pattern fallback.
 */
export function findBestHours(hourlyData) {
  if (
    !hourlyData ||
    !Array.isArray(hourlyData.time) ||
    !Array.isArray(hourlyData.pm2_5) ||
    hourlyData.time.length === 0
  ) {
    return buildPatternFallback();
  }

  const limit = Math.min(24, hourlyData.time.length, hourlyData.pm2_5.length);
  const points = [];
  for (let i = 0; i < limit; i += 1) {
    const value = hourlyData.pm2_5[i];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      points.push({ index: i, time: hourlyData.time[i], pm25: value });
    }
  }

  return points.length === 0 ? buildPatternFallback() : findLowestPm25Window(points);
}

/**
 * Build the 5-stop day timeline with guidance text keys and assigned action IDs.
 *
 * @param {object} [input] - Timeline inputs.
 * @param {object} input.aqiResult - Computed CPCB AQI result.
 * @param {Array<object>} [input.actions=[]] - Selected household actions.
 * @param {object|null} [input.hourlyData=null] - Optional Open-Meteo hourly PM2.5 series.
 * @returns {{ timeline: Array<object>, bestHours: object }} Daypart timeline and cleanest-hours window.
 */
export function buildTimeSlots({ aqiResult, actions = [], hourlyData = null } = {}) {
  if (!aqiResult || !(aqiResult.category in CATEGORY_RANK)) {
    throw new TypeError('buildTimeSlots requires a valid aqiResult');
  }

  const aqiRank = CATEGORY_RANK[aqiResult.category];
  const severityTier = aqiRank >= CATEGORY_RANK['Poor'] ? 'high' : 'moderate';
  const bestHours = findBestHours(hourlyData);

  const timeline = DAYPART_ORDER.map((daypart) => ({
    daypart,
    timeWindow:
      daypart === 'midday' && bestHours.windowSource === 'hourly_model'
        ? bestHours.windowLabel
        : DEFAULT_TIME_WINDOWS[daypart],
    guidanceKey: `timeslots.${daypart}.${severityTier}`,
    isPattern: bestHours.isPattern,
    noteKey: bestHours.noteKey,
    actionIds: actions.filter((a) => a.daypart === daypart).map((a) => a.id),
  }));

  return { timeline, bestHours };
}
