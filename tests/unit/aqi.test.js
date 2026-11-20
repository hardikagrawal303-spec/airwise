import { calculateAqi, calculateSubIndex, getAqiCategory } from '../../src/engine/aqi.js';
import { PM10_BREAKPOINTS, PM25_BREAKPOINTS } from '../../src/config/aqiBreakpoints.js';

describe('CPCB AQI engine', () => {
  describe('PM2.5 band boundaries (both edges)', () => {
    const cases = [
      [0, 0, 'Good'],
      [30, 50, 'Good'],
      [31, 51, 'Satisfactory'],
      [60, 100, 'Satisfactory'],
      [61, 101, 'Moderate'],
      [90, 200, 'Moderate'],
      [91, 201, 'Poor'],
      [120, 300, 'Poor'],
      [121, 301, 'Very Poor'],
      [250, 400, 'Very Poor'],
      [251, 401, 'Severe'],
      [380, 500, 'Severe'],
    ];

    test.each(cases)('PM2.5 = %d -> AQI %d (%s)', (pm25, expectedAqi, expectedCategory) => {
      const result = calculateAqi({ pm25 });
      expect(result.aqi).toBe(expectedAqi);
      expect(result.category).toBe(expectedCategory);
      expect(result.dominantPollutant).toBe('PM2.5');
      expect(result.subIndices).toEqual({ pm25: expectedAqi, pm10: null });
    });
  });

  describe('PM10 band boundaries (both edges)', () => {
    const cases = [
      [0, 0, 'Good'],
      [50, 50, 'Good'],
      [51, 51, 'Satisfactory'],
      [100, 100, 'Satisfactory'],
      [101, 101, 'Moderate'],
      [250, 200, 'Moderate'],
      [251, 201, 'Poor'],
      [350, 300, 'Poor'],
      [351, 301, 'Very Poor'],
      [430, 400, 'Very Poor'],
      [431, 401, 'Severe'],
      [510, 500, 'Severe'],
    ];

    test.each(cases)('PM10 = %d -> sub-index %d (%s)', (pm10, expectedSub, expectedCategory) => {
      const sub = calculateSubIndex(pm10, PM10_BREAKPOINTS, 'pm10');
      expect(sub).toBe(expectedSub);
      expect(getAqiCategory(sub).name).toBe(expectedCategory);
    });
  });

  describe('linear interpolation midpoints and fractional gaps', () => {
    test('interpolates PM2.5 midpoints accurately', () => {
      expect(calculateSubIndex(15, PM25_BREAKPOINTS, 'pm25')).toBe(25);
      expect(calculateSubIndex(45.5, PM25_BREAKPOINTS, 'pm25')).toBe(76);
      expect(calculateSubIndex(75.5, PM25_BREAKPOINTS, 'pm25')).toBe(151);
      expect(calculateSubIndex(105.5, PM25_BREAKPOINTS, 'pm25')).toBe(251);
      expect(calculateSubIndex(185.5, PM25_BREAKPOINTS, 'pm25')).toBe(351);
    });

    test('interpolates PM10 midpoints accurately', () => {
      expect(calculateSubIndex(25, PM10_BREAKPOINTS, 'pm10')).toBe(25);
      expect(calculateSubIndex(175.5, PM10_BREAKPOINTS, 'pm10')).toBe(151);
      expect(calculateSubIndex(300.5, PM10_BREAKPOINTS, 'pm10')).toBe(251);
    });

    test('handles fractional concentration between integer band edges safely', () => {
      const res = calculateAqi({ pm25: 30.4 });
      expect(res.aqi).toBe(51);
      expect(res.category).toBe('Satisfactory');
    });
  });

  describe('values above top band and cap at 500', () => {
    test('caps extreme PM2.5 values at 500 (Severe)', () => {
      const res = calculateAqi({ pm25: 900 });
      expect(res.aqi).toBe(500);
      expect(res.category).toBe('Severe');
      expect(res.band).toBe('severe');
    });

    test('caps extreme PM10 values at 500 (Severe)', () => {
      const res = calculateAqi({ pm25: 20, pm10: 1200 });
      expect(res.aqi).toBe(500);
      expect(res.category).toBe('Severe');
      expect(res.dominantPollutant).toBe('PM10');
    });
  });

  describe('dominant pollutant selection and missing PM10', () => {
    test('uses PM2.5 when PM10 is omitted or null', () => {
      const resUndefined = calculateAqi({ pm25: 75 });
      const resNull = calculateAqi({ pm25: 75, pm10: null });
      expect(resUndefined).toEqual(resNull);
      expect(resUndefined.dominantPollutant).toBe('PM2.5');
      expect(resUndefined.subIndices.pm10).toBeNull();
    });

    test('selects PM10 when PM10 sub-index is strictly greater', () => {
      const res = calculateAqi({ pm25: 25, pm10: 260 });
      expect(res.dominantPollutant).toBe('PM10');
      expect(res.aqi).toBe(res.subIndices.pm10);
      expect(res.category).toBe('Poor');
    });

    test('prefers PM2.5 when sub-indices tie or PM2.5 is higher', () => {
      const tie = calculateAqi({ pm25: 30, pm10: 50 });
      expect(tie.aqi).toBe(50);
      expect(tie.dominantPollutant).toBe('PM2.5');

      const higher = calculateAqi({ pm25: 150, pm10: 120 });
      expect(higher.dominantPollutant).toBe('PM2.5');
      expect(higher.category).toBe('Very Poor');
      expect(higher.band).toBe('very-poor');
    });
  });

  describe('invalid input rejection', () => {
    test.each([-1, -0.01, Number.NaN, Number.POSITIVE_INFINITY, '50', null, undefined, {}])(
      'rejects invalid pm25 value: %p',
      (badValue) => {
        expect(() => calculateAqi({ pm25: badValue })).toThrow();
      }
    );

    test.each([-5, Number.NaN, Number.POSITIVE_INFINITY, '100', {}])(
      'rejects invalid pm10 value when provided: %p',
      (badValue) => {
        expect(() => calculateAqi({ pm25: 20, pm10: badValue })).toThrow();
      }
    );
  });
});
