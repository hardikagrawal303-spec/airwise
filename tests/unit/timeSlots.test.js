import { buildTimeSlots, DAYPART_ORDER, findBestHours } from '../../src/engine/timeSlots.js';

describe('Time-of-day guidance engine', () => {
  test('returns general winter smog pattern when hourly data is absent', () => {
    const best = findBestHours(null);
    expect(best.windowSource).toBe('pattern');
    expect(best.isPattern).toBe(true);
    expect(best.isForecast).toBe(false);
    expect(best.windowLabel).toBe('13:00 - 16:00');
    expect(best.noteKey).toBe('timeslots.pattern_disclaimer');
  });

  test('picks the lowest-PM2.5 3-hour window when hourly data is provided', () => {
    const hourly = {
      time: [
        '2026-11-19T06:00',
        '2026-11-19T07:00',
        '2026-11-19T08:00',
        '2026-11-19T13:00',
        '2026-11-19T14:00',
        '2026-11-19T15:00',
        '2026-11-19T20:00',
      ],
      pm2_5: [210, 195, 180, 95, 85, 90, 240],
    };

    const best = findBestHours(hourly);
    expect(best.windowSource).toBe('hourly_model');
    expect(best.isPattern).toBe(false);
    expect(best.isForecast).toBe(true);
    expect(best.windowLabel).toBe('13:00 - 15:00');
    expect(best.averagePm25).toBe(90);
    expect(best.hours).toHaveLength(3);
  });

  test('builds all five dayparts with guidance keys and maps actionIds to their dayparts', () => {
    const actions = [
      { id: 'move_exercise_indoors', daypart: 'early_morning' },
      { id: 'wear_n95_outdoors', daypart: 'school_work_run' },
      { id: 'timed_window_ventilation', daypart: 'midday' },
      { id: 'close_windows_evening_night', daypart: 'evening' },
      { id: 'seal_door_window_gaps', daypart: 'night' },
      { id: 'report_open_burning', daypart: 'any' },
    ];

    const { timeline, bestHours } = buildTimeSlots({
      aqiResult: { aqi: 260, category: 'Poor' },
      actions,
      hourlyData: null,
    });

    expect(timeline.map((t) => t.daypart)).toEqual(DAYPART_ORDER);
    expect(bestHours.isPattern).toBe(true);
    expect(timeline[0].guidanceKey).toBe('timeslots.early_morning.high');
    expect(timeline[0].actionIds).toEqual(['move_exercise_indoors']);
    expect(timeline[1].actionIds).toEqual(['wear_n95_outdoors']);
    expect(timeline[2].actionIds).toEqual(['timed_window_ventilation']);
    expect(timeline[3].actionIds).toEqual(['close_windows_evening_night']);
    expect(timeline[4].actionIds).toEqual(['seal_door_window_gaps']);
  });

  test('uses moderate guidance keys for Good through Moderate AQI', () => {
    const { timeline } = buildTimeSlots({
      aqiResult: { aqi: 80, category: 'Satisfactory' },
      actions: [],
    });
    expect(timeline[0].guidanceKey).toBe('timeslots.early_morning.moderate');
  });

  test('picks single cleanest hour when fewer than 3 valid hourly samples exist', () => {
    const twoSamples = findBestHours({
      time: ['2026-11-19T08:00', '2026-11-19T14:00'],
      pm2_5: [190, 92.46],
    });
    expect(twoSamples.windowSource).toBe('hourly_model');
    expect(twoSamples.isForecast).toBe(true);
    expect(twoSamples.isPattern).toBe(false);
    expect(twoSamples.windowLabel).toBe('14:00 - 14:00');
    expect(twoSamples.averagePm25).toBe(92.5);
    expect(twoSamples.hours).toEqual([{ time: '2026-11-19T14:00', pm25: 92.5 }]);

    const oneValid = findBestHours({
      time: ['2026-11-19T08:00', '2026-11-19T09:00'],
      pm2_5: [null, 64],
    });
    expect(oneValid.windowSource).toBe('hourly_model');
    expect(oneValid.windowLabel).toBe('09:00 - 09:00');
    expect(oneValid.averagePm25).toBe(64);

    const allNull = findBestHours({
      time: ['2026-11-19T08:00', '2026-11-19T09:00'],
      pm2_5: [null, null],
    });
    expect(allNull.windowSource).toBe('pattern');
  });

  test('throws TypeError when buildTimeSlots receives an invalid aqiResult', () => {
    expect(() => buildTimeSlots({ aqiResult: null })).toThrow(TypeError);
    expect(() => buildTimeSlots({ aqiResult: { category: 'Unknown' } })).toThrow(TypeError);
  });
});
