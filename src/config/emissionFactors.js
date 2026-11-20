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
    label: 'Petrol car',
    note: 'Approximate average for a single-occupant petrol passenger car in urban traffic (~0.17 kg CO2e/pkm).',
  }),
  two_wheeler: Object.freeze({
    kgCO2ePerKm: 0.05,
    label: 'Two-wheeler',
    note: 'Approximate average for a petrol scooter or motorcycle (~0.05 kg CO2e/pkm).',
  }),
  auto_cng: Object.freeze({
    kgCO2ePerKm: 0.08,
    label: 'CNG auto-rickshaw',
    note: 'Approximate average for a CNG auto-rickshaw carrying 1-2 passengers (~0.08 kg CO2e/pkm).',
  }),
  bus: Object.freeze({
    kgCO2ePerKm: 0.04,
    label: 'City bus',
    note: 'Approximate average per passenger on an urban CNG/diesel bus at typical occupancy (~0.04 kg CO2e/pkm).',
  }),
  metro: Object.freeze({
    kgCO2ePerKm: 0.03,
    label: 'Metro rail',
    note: 'Approximate average per passenger on urban electric metro rail using Indian grid electricity (~0.03 kg CO2e/pkm).',
  }),
  cycle: Object.freeze({
    kgCO2ePerKm: 0,
    label: 'Bicycle',
    note: 'Zero tailpipe emissions during travel (0 kg CO2e/pkm).',
  }),
  walk: Object.freeze({
    kgCO2ePerKm: 0,
    label: 'Walking',
    note: 'Zero tailpipe emissions during travel (0 kg CO2e/pkm).',
  }),
  work_from_home: Object.freeze({
    kgCO2ePerKm: 0,
    label: 'Work from home',
    note: 'Zero daily commute tailpipe emissions (0 kg CO2e/pkm).',
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
