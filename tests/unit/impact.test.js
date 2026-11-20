import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCommuteComparison,
  estimateCommuteSwitch,
  estimateExposureReduction,
} from '../../src/engine/impact.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const enLocale = JSON.parse(fs.readFileSync(path.join(rootDir, 'public/locales/en.json'), 'utf8'));
const hiLocale = JSON.parse(fs.readFileSync(path.join(rootDir, 'public/locales/hi.json'), 'utf8'));

function interpolate(dict, key, params = {}) {
  let out = dict[key];
  expect(typeof out).toBe('string');
  for (const [k, v] of Object.entries(params)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

describe('Transparent impact estimation engine', () => {
  describe('estimateCommuteSwitch', () => {
    test('calculates daily and monthly CO2e savings for car -> metro with localized formula and assumption keys', () => {
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
      expect(res.currentLabelKey).toBe('impact.mode.car_petrol');
      expect(res.newLabelKey).toBe('impact.mode.metro');
      expect(res.formulaKey).toBe('impact.commute.formula');
      expect(res.formulaParams).toEqual({
        currentFactor: 0.17,
        newFactor: 0.03,
        kmPerDay: 20,
        dailyKgCO2Saved: 2.8,
        commuteDays: 22,
        monthlyKgCO2Saved: 61.6,
      });
      expect(res.assumptionKeys.length).toBeGreaterThanOrEqual(3);

      const enFormula = interpolate(enLocale, res.formulaKey, res.formulaParams);
      expect(enFormula).toContain('0.17');
      expect(enFormula).toContain('0.03');

      const hiFormula = interpolate(hiLocale, res.formulaKey, res.formulaParams);
      expect(hiFormula).toContain('किग्रा');

      const enSummary = interpolate(enLocale, res.summaryKey, {
        ...res.summaryParams,
        currentMode: enLocale[res.summaryParams.currentModeKey],
        newMode: enLocale[res.summaryParams.newModeKey],
      });
      expect(enSummary.toLowerCase()).toContain('can help reduce');
      expect(enSummary.toLowerCase()).not.toContain('will prevent');

      for (const entry of res.assumptionKeys) {
        expect(enLocale[entry.key]).toBeTruthy();
        expect(hiLocale[entry.key]).toBeTruthy();
      }
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
      expect(zeroKm.summaryKey).toBe('impact.commute.summaryNone');

      const sameMode = estimateCommuteSwitch({
        currentMode: 'bus',
        newMode: 'bus',
        kmPerDay: 12,
      });
      expect(sameMode.dailyKgCO2Saved).toBe(0);
      expect(sameMode.monthlyKgCO2Saved).toBe(0);
      expect(sameMode.summaryKey).toBe('impact.commute.summaryNone');
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
    test('returns honest indicative lab rating keys for N95 mask without medical claims', () => {
      const mask = estimateExposureReduction('wear_n95_outdoors');
      expect(mask.isEstimate).toBe(true);
      expect(enLocale[mask.summaryKey]).toContain('95%');
      expect(enLocale[mask.summaryKey].toLowerCase()).toContain('can help reduce');
      expect(enLocale[mask.summaryKey].toLowerCase()).not.toContain('prevent');
      expect(enLocale[mask.formulaKey]).toBeTruthy();
      expect(hiLocale[mask.summaryKey]).toBeTruthy();
      expect(hiLocale[mask.formulaKey]).toBeTruthy();
      expect(mask.assumptionKeys.length).toBeGreaterThan(0);
      for (const k of mask.assumptionKeys) {
        expect(enLocale[k]).toBeTruthy();
        expect(hiLocale[k]).toBeTruthy();
      }
    });

    test('returns HEPA purifier and DIY box-fan stopgap keys with caveats in en and hi', () => {
      const hepa = estimateExposureReduction('run_hepa_purifier');
      expect(hepa.isEstimate).toBe(true);
      expect(enLocale[hepa.summaryKey]).toContain('99.97%');
      expect(hiLocale[hepa.summaryKey]).toContain('99.97%');

      const diy = estimateExposureReduction('diy_box_fan_filter');
      expect(diy.isEstimate).toBe(true);
      expect(enLocale[diy.summaryKey].toLowerCase()).toContain('supervised');
      expect(hiLocale[diy.summaryKey]).toContain('निगरानी');
      expect(diy.confidence).toBe('low');
    });

    test('explicitly notes indoor plants are not a meaningful purifier in en and hi', () => {
      const plants = estimateExposureReduction('indoor_plants_realistic_note');
      expect(enLocale[plants.summaryKey].toLowerCase()).toContain('not meaningfully');
      expect(hiLocale[plants.summaryKey]).toContain('कम नहीं करते');
      expect(plants.isEstimate).toBe(true);
    });
  });
});
