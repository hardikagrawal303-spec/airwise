import {
  buildCommuteComparison,
  estimateCommuteSwitch,
  estimateExposureReduction,
} from '../../src/engine/impact.js';

describe('Transparent impact estimation engine', () => {
  describe('estimateCommuteSwitch', () => {
    test('calculates daily and monthly CO2e savings for car -> metro with formula and assumptions', () => {
      const res = estimateCommuteSwitch({
        currentMode: 'car_petrol',
        newMode: 'metro',
        kmPerDay: 20,
      });

      // (0.17 - 0.03) * 20 = 2.8 kg/day; * 22 = 61.6 kg/month
      expect(res.dailyKgCO2Saved).toBe(2.8);
      expect(res.monthlyKgCO2Saved).toBe(61.6);
      expect(res.isEstimate).toBe(true);
      expect(res.confidence).toBe('medium');
      expect(res.formula).toContain('0.17');
      expect(res.formula).toContain('0.03');
      expect(res.assumptions.length).toBeGreaterThanOrEqual(3);
      expect(res.summary.toLowerCase()).toContain('can help reduce');
      expect(res.summary.toLowerCase()).not.toContain('will prevent');
    });

    test('accepts household profile aliases car and auto', () => {
      const carToBus = estimateCommuteSwitch({
        currentMode: 'car',
        newMode: 'bus',
        kmPerDay: 10,
      });
      // (0.17 - 0.04) * 10 = 1.3 kg/day
      expect(carToBus.dailyKgCO2Saved).toBe(1.3);
      expect(carToBus.monthlyKgCO2Saved).toBe(28.6);

      const autoToMetro = estimateCommuteSwitch({
        currentMode: 'auto',
        newMode: 'metro',
        kmPerDay: 15,
      });
      // (0.08 - 0.03) * 15 = 0.75 kg/day
      expect(autoToMetro.dailyKgCO2Saved).toBe(0.75);
      expect(autoToMetro.monthlyKgCO2Saved).toBe(16.5);
    });

    test('handles zero distance and same mode cleanly', () => {
      const zeroKm = estimateCommuteSwitch({
        currentMode: 'car',
        newMode: 'metro',
        kmPerDay: 0,
      });
      expect(zeroKm.dailyKgCO2Saved).toBe(0);
      expect(zeroKm.monthlyKgCO2Saved).toBe(0);

      const sameMode = estimateCommuteSwitch({
        currentMode: 'bus',
        newMode: 'bus',
        kmPerDay: 12,
      });
      expect(sameMode.dailyKgCO2Saved).toBe(0);
      expect(sameMode.monthlyKgCO2Saved).toBe(0);
    });

    test('handles rounding to 2 decimal places', () => {
      const res = estimateCommuteSwitch({
        currentMode: 'two_wheeler',
        newMode: 'metro',
        kmPerDay: 7.33,
      });
      // (0.05 - 0.03) * 7.33 = 0.1466 -> 0.15; 0.15 * 22 = 3.3
      expect(res.dailyKgCO2Saved).toBe(0.15);
      expect(res.monthlyKgCO2Saved).toBe(3.3);
    });

    test('clamps savings to 0 if switching to a higher-emission mode', () => {
      const res = estimateCommuteSwitch({
        currentMode: 'metro',
        newMode: 'car',
        kmPerDay: 10,
      });
      expect(res.dailyKgCO2Saved).toBe(0);
      expect(res.monthlyKgCO2Saved).toBe(0);
    });

    test('rejects invalid modes and invalid distances', () => {
      expect(() =>
        estimateCommuteSwitch({ currentMode: 'helicopter', newMode: 'metro', kmPerDay: 10 })
      ).toThrow(TypeError);
      expect(() =>
        estimateCommuteSwitch({ currentMode: 'car', newMode: 'jetpack', kmPerDay: 10 })
      ).toThrow(TypeError);
      expect(() =>
        estimateCommuteSwitch({ currentMode: 'car', newMode: 'metro', kmPerDay: -5 })
      ).toThrow(RangeError);
      expect(() =>
        estimateCommuteSwitch({ currentMode: 'car', newMode: 'metro', kmPerDay: Number.NaN })
      ).toThrow(RangeError);
    });

    test('buildCommuteComparison picks metro for car/two_wheeler/auto', () => {
      const comp = buildCommuteComparison({ commute: 'car', commuteKmPerDay: 10 });
      expect(comp.currentMode).toBe('car_petrol');
      expect(comp.newMode).toBe('metro');
      expect(comp.dailyKgCO2Saved).toBe(1.4);
    });
  });

  describe('estimateExposureReduction', () => {
    test('returns honest indicative lab rating for N95 mask without medical claims', () => {
      const mask = estimateExposureReduction('wear_n95_outdoors');
      expect(mask.isEstimate).toBe(true);
      expect(mask.summary).toContain('95%');
      expect(mask.summary.toLowerCase()).toContain('can help reduce');
      expect(mask.summary.toLowerCase()).not.toContain('prevent');
      expect(mask.formula).toBeTruthy();
      expect(mask.assumptions.length).toBeGreaterThan(0);
    });

    test('returns HEPA purifier and DIY box-fan stopgap estimates with caveats', () => {
      const hepa = estimateExposureReduction('run_hepa_purifier');
      expect(hepa.isEstimate).toBe(true);
      expect(hepa.summary).toContain('99.97%');

      const diy = estimateExposureReduction('diy_box_fan_filter');
      expect(diy.isEstimate).toBe(true);
      expect(diy.summary.toLowerCase()).toContain('supervised');
      expect(diy.confidence).toBe('low');
    });

    test('explicitly notes indoor plants are not a meaningful purifier', () => {
      const plants = estimateExposureReduction('indoor_plants_realistic_note');
      expect(plants.summary.toLowerCase()).toContain('not meaningfully');
      expect(plants.isEstimate).toBe(true);
    });
  });
});
