/**
 * Approximate per passenger-km CO2e emission factors (kg CO2e / passenger-km).
 *
 * IMPORTANT: These are approximate indicative averages for urban Indian transport
 * and should be replaced by authoritative local lifecycle / fleet factors when
 * available. Always label outputs derived from these numbers as estimates.
 */

export const COMMUTE_DAYS_PER_MONTH = 22;

export const EMISSION_FACTORS = Object.freeze({
  car_petrol: Object.freeze({
    kgCO2ePerKm: 0.17,
    labelKey: 'impact.mode.car_petrol',
    noteKey: 'impact.modeNote.car_petrol',
  }),
  two_wheeler: Object.freeze({
    kgCO2ePerKm: 0.05,
    labelKey: 'impact.mode.two_wheeler',
    noteKey: 'impact.modeNote.two_wheeler',
  }),
  auto_cng: Object.freeze({
    kgCO2ePerKm: 0.08,
    labelKey: 'impact.mode.auto_cng',
    noteKey: 'impact.modeNote.auto_cng',
  }),
  bus: Object.freeze({
    kgCO2ePerKm: 0.04,
    labelKey: 'impact.mode.bus',
    noteKey: 'impact.modeNote.bus',
  }),
  metro: Object.freeze({
    kgCO2ePerKm: 0.03,
    labelKey: 'impact.mode.metro',
    noteKey: 'impact.modeNote.metro',
  }),
  cycle: Object.freeze({
    kgCO2ePerKm: 0,
    labelKey: 'impact.mode.cycle',
    noteKey: 'impact.modeNote.cycle',
  }),
  walk: Object.freeze({
    kgCO2ePerKm: 0,
    labelKey: 'impact.mode.walk',
    noteKey: 'impact.modeNote.walk',
  }),
  work_from_home: Object.freeze({
    kgCO2ePerKm: 0,
    labelKey: 'impact.mode.work_from_home',
    noteKey: 'impact.modeNote.work_from_home',
  }),
});

/**
 * Maps household profile commute keys to emission factor keys.
 */
export const COMMUTE_MODE_ALIASES = Object.freeze({
  car: 'car_petrol',
  car_petrol: 'car_petrol',
  two_wheeler: 'two_wheeler',
  auto: 'auto_cng',
  auto_cng: 'auto_cng',
  bus: 'bus',
  metro: 'metro',
  cycle: 'cycle',
  walk: 'walk',
  work_from_home: 'work_from_home',
});
