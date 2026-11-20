# AirWise Design & Architecture Decisions

This log records key technical and design trade-offs made while building AirWise.

## 1. Hybrid Rule Engine + Constrained Gemini (Instead of Pure LLM Generation)

- **Decision**: Select all guidance actions deterministically from a 34-item curated knowledge base (`src/knowledge/actions.js` + `src/engine/actionSelector.js`), and restrict Gemini (`src/services/geminiService.js` + `src/services/geminiSchema.js`) to personalizing wording for those exact `actionId`s under a strict JSON schema.
- **Why**: Air-quality guidance touches respiratory health for children and older adults. Pure LLM generation risks medical overclaiming, hallucinated remedies, or broken layouts if an API key is missing or rate-limited. With the hybrid pattern, AirWise works 100% deterministically even with `GEMINI_API_KEY=""`, never invents actions, and degrades silently (`copySource: "rules"`) on timeouts, invalid keys, or schema mismatches.

## 2. Plain Node.js ESM + Vanilla HTML/CSS/JS (Zero Bundler, 6 Runtime Dependencies)

- **Decision**: Serve static vanilla HTML/CSS/ES modules directly from Express with no React, no bundler, and only 6 runtime packages (`express`, `helmet`, `express-rate-limit`, `zod`, `@google/genai`, `dotenv`).
- **Why**: Keeps attack surface tiny (`0` runtime vulnerabilities in `npm audit --omit=dev`), eliminates build-step complexity for reviewers, and keeps the entire client payload under 40 KB of JS and 30 KB of CSS so families on congested North Indian mobile connections load the page quickly.

## 3. India CPCB National AQI Breakpoints (Instead of US EPA AQI)

- **Decision**: Implement India's Central Pollution Control Board (CPCB) 6-band National AQI scale (`Good`, `Satisfactory`, `Moderate`, `Poor`, `Very Poor`, `Severe`) using linear sub-indices for PM2.5 and PM10 (`src/config/aqiBreakpoints.js`, `src/engine/aqi.js`).
- **Why**: North Indian families see CPCB categories on local news, school circulars, and the Sameer app. Reporting US EPA numbers would mismatch local advisories and GRAP thresholds. Because live feeds report hourly rather than 24-hour averages, we state this approximation honestly in the UI and documentation.

## 4. Keyless Open-Meteo + Manual PM2.5/PM10 Entry Fallback

- **Decision**: Use Open-Meteo Air Quality and Geocoding APIs (no API key required) paired with bounded in-memory LRU+TTL caching (10 min default for AQI rounded to 0.01° ≈ 1.1 km; 30 min / 3× TTL for geocoding) and a first-class manual PM2.5/PM10 input panel.
- **Why**: Reviewers and families can run AirWise immediately without registering third-party air-quality keys. If Open-Meteo is unreachable, or a family prefers a nearby ground CPCB/home monitor reading, manual entry runs the identical engine and UI without interruption.

## 5. Strict CSP with Self-Hosted Subsetted Fonts

- **Decision**: Enforce `default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'` via Helmet and self-host subsetted `Bricolage Grotesque` (Latin) and `Hind` (Latin + Devanagari) woff2 files (~127 KB total, under the 150 KB budget) with OFL-1.1 licences.
- **Why**: Eliminates third-party CDN tracking, prevents XSS via inline scripts/styles, and guarantees consistent Devanagari rendering offline or behind strict corporate/school networks.

## 6. Atmospheric Haze Skyline Controlled Solely by `data-band`

- **Decision**: Build a single inline 5-layer SVG of a North Indian riverfront skyline (ghats, shikhara spires, flat rooftops with water tanks, dusk sun) whose visibility shifts purely via CSS custom properties keyed on `.hero[data-band="..."]`, settling once over 1.2 seconds (disabled under `prefers-reduced-motion`).
- **Why**: Communicates air severity viscerally at a glance without charts, inline styles, or continuous animations—while leaving the guidance sections below calm, flat, and high-contrast.

## 7. In-Memory Bounded LRU Cache (Instead of Redis)

- **Decision**: Use a small custom TTL+LRU cache (`src/utils/cache.js`) capped at 200 air-quality entries and 200 geocode entries.
- **Why**: Sufficient for single-instance or hackathon deployment, prevents unbounded memory growth, avoids extra infrastructure dependencies, and slashes duplicate upstream Open-Meteo calls during morning smog peaks.
