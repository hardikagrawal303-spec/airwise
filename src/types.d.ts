export type LanguageCode = 'en' | 'hi';

export type AqiCategory = 'Good' | 'Satisfactory' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe';

export type AqiBand = 'good' | 'satisfactory' | 'moderate' | 'poor' | 'very-poor' | 'severe';

export type VulnerabilityLevel = 'standard' | 'elevated' | 'high';

export type ActionCategory =
  'daily_routine' | 'indoor_air' | 'sustainable_alternative' | 'community';

export type Daypart = 'early_morning' | 'school_work_run' | 'midday' | 'evening' | 'night' | 'any';

export type ActionCost = 'free' | 'low' | 'medium' | 'high';

export type ActionEffort = 'easy' | 'moderate' | 'hard';

export type CommuteMode =
  'walk' | 'cycle' | 'two_wheeler' | 'car' | 'bus' | 'metro' | 'auto' | 'work_from_home';

export type CookingFuel = 'lpg' | 'induction' | 'wood_or_biomass' | 'kerosene' | 'piped_gas';

export type BudgetLevel = 'low' | 'medium' | 'high';

export type HomeType = 'apartment' | 'independent_house';

export interface AqiBreakpoint {
  readonly bpLo: number;
  readonly bpHi: number;
  readonly iLo: number;
  readonly iHi: number;
  readonly category: AqiCategory;
}

export interface AqiCategoryInfo {
  readonly name: AqiCategory;
  readonly slug: AqiBand;
  readonly min: number;
  readonly max: number;
  readonly rank: number;
}

export interface AqiResult {
  aqi: number;
  category: AqiCategory;
  band: AqiBand;
  dominantPollutant: 'PM2.5' | 'PM10';
  subIndices: {
    pm25: number;
    pm10: number | null;
  };
}

export interface HouseholdMembers {
  adults: number;
  children: number;
  elderly: number;
}

export interface HouseholdProfile {
  members: HouseholdMembers;
  hasRespiratoryOrHeartCondition: boolean;
  commute: CommuteMode;
  commuteKmPerDay: number;
  cookingFuel: CookingFuel;
  hasPurifier: boolean;
  budget: BudgetLevel;
  homeType: HomeType;
  language?: LanguageCode;
}

export interface RiskProfile {
  vulnerabilityLevel: VulnerabilityLevel;
  reasons: string[];
  isSensitiveGroup: boolean;
}

export interface ActionEligibilityRules {
  sensitiveOnly?: boolean;
  needsChildren?: boolean;
  needsPurifier?: boolean;
  needsNoPurifier?: boolean;
  commute?: readonly CommuteMode[];
  cookingFuel?: readonly CookingFuel[];
  homeType?: readonly HomeType[];
}

export interface ActionItem {
  readonly id: string;
  readonly category: ActionCategory;
  readonly daypart: Daypart;
  readonly minCategory: AqiCategory;
  readonly maxCategory?: AqiCategory;
  readonly appliesTo: ActionEligibilityRules;
  readonly cost: ActionCost;
  readonly effort: ActionEffort;
  readonly mandatoryIfSensitivePoorPlus?: boolean;
  readonly impactNoteKey: string;
  readonly textKey: string;
  priorityScore?: number;
}

export interface ExposureImpact {
  exposureEffectKey: string;
  summaryKey: string;
  formulaKey: string;
  assumptionKeys: string[];
  confidence: 'low' | 'medium' | 'high';
  isEstimate: boolean;
}

export interface PlanItem {
  id: string;
  category: ActionCategory;
  daypart: Daypart;
  cost: ActionCost;
  effort: ActionEffort;
  text: string;
  whyItMatters: string;
  impact: ExposureImpact;
}

export interface TimelineStop {
  daypart: Exclude<Daypart, 'any'>;
  timeWindow: string;
  guidance?: string;
  guidanceKey: string;
  isPattern: boolean;
  noteKey?: string;
  actionIds: string[];
}

export interface BestHoursResult {
  windowSource: 'hourly_model' | 'pattern';
  isForecast: boolean;
  isPattern: boolean;
  windowLabel: string;
  hours: Array<{ time: string; pm25: number }>;
  averagePm25: number | null;
  noteKey: string;
}

export interface CommuteImpact {
  currentMode: string;
  newMode: string;
  currentLabelKey: string;
  newLabelKey: string;
  kmPerDay: number;
  dailyKgCO2Saved: number;
  monthlyKgCO2Saved: number;
  summaryKey: string;
  summaryParams: Record<string, string | number>;
  formulaKey: string;
  formulaParams: Record<string, string | number>;
  assumptionKeys: Array<{ key: string; params: Record<string, string | number> }>;
  confidence: 'low' | 'medium' | 'high';
  isEstimate: boolean;
}

export interface HourlyPm25Series {
  time: string[];
  pm2_5: Array<number | null>;
}

export interface AirReading {
  pm25: number;
  pm10: number | null;
  observedAt: string;
  timezone?: string;
  hourly: HourlyPm25Series | null;
  dataSource: 'open-meteo' | 'manual';
  cached: boolean;
}

export interface GeocodeResult {
  name: string;
  admin1: string;
  country: string;
  countryCode: string;
  label: string;
  lat: number;
  lon: number;
}

export interface PersonalizedActionCopy {
  actionId: string;
  personalizedText: string;
  whyItMatters: string;
}

export interface PersonalizedPlanContent {
  headline: string;
  summary: string;
  items: PersonalizedActionCopy[];
  familyTip: string;
  copySource: 'ai' | 'rules';
}

export interface PlanResponse {
  aqi: AqiResult & {
    pm25: number;
    pm10: number | null;
    observedAt: string;
    dataSource: 'open-meteo' | 'manual';
    placeLabel: string;
  };
  risk: {
    vulnerabilityLevel: VulnerabilityLevel;
    isSensitiveGroup: boolean;
  };
  plan: {
    headline: string;
    summary: string;
    sections: Record<ActionCategory, PlanItem[]>;
    timeline: TimelineStop[];
    items: PlanItem[];
    commuteImpact: CommuteImpact;
    bestHours: BestHoursResult;
    familyTip: string;
    copySource: 'ai' | 'rules';
  };
  disclaimer: string;
  generatedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    fields?: Array<{ path: string; message: string }>;
  };
}

export interface AirQualityService {
  geocode: (query: string) => Promise<GeocodeResult[]>;
  getAirQuality: (lat: number, lon: number) => Promise<AirReading>;
}

export interface GeminiService {
  isEnabled: () => boolean;
  personalizePlan: (input: {
    aqiResult: AqiResult;
    risk: RiskProfile;
    selectedActions: ActionItem[];
    language?: LanguageCode;
  }) => Promise<PersonalizedPlanContent>;
}

export interface PlanRequestInput {
  location?: { lat: number; lon: number; label?: string };
  manual?: { pm25: number; pm10?: number | null; label?: string };
  profile: HouseholdProfile;
}

export interface PlanBuilder {
  buildPlan: (input: PlanRequestInput) => Promise<PlanResponse>;
}

export interface AppConfig {
  readonly geminiApiKey: string | null;
  readonly aiEnabled: boolean;
  readonly geminiModel: string;
  readonly port: number;
  readonly nodeEnv: 'development' | 'production' | 'test';
  readonly rateLimitWindowMs: number;
  readonly rateLimitMax: number;
  readonly geocodeRateLimitMax: number;
  readonly planRateLimitMax: number;
  readonly serverHeadersTimeoutMs: number;
  readonly serverRequestTimeoutMs: number;
  readonly serverKeepAliveTimeoutMs: number;
  readonly serverShutdownTimeoutMs: number;
  readonly aqiCacheTtlMs: number;
  readonly geocodeCacheTtlMultiplier: number;
  readonly cacheMaxEntries: number;
  readonly geocodeResultCount: number;
  readonly geocodeCoordPrecision: number;
  readonly aqiCacheCoordPrecision: number;
  readonly trustProxy: boolean | number | string;
  readonly allowedOrigins: readonly string[];
  readonly jsonBodyLimit: string;
  readonly upstreamTimeoutMs: number;
  readonly upstreamMaxAttempts: number;
  readonly upstreamRetryDelayMs: number;
  readonly geminiTimeoutMs: number;
  readonly geminiMaxAttempts: number;
  readonly geminiMaxOutputTokens: number;
  readonly geminiLegacyMaxOutputTokens: number;
  readonly geminiLegacyTemperature: number;
}

export interface SelectedLocation {
  lat: number;
  lon: number;
  label: string;
}

export interface FrontendAppState {
  selectedLocation: SelectedLocation | null;
  useManual: boolean;
  lastPlanData: PlanResponse | null;
  lastRequestPayload: PlanRequestInput | null;
  isSubmitting: boolean;
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: Record<string, any>;
      validatedBody?: any;
    }
  }
}
