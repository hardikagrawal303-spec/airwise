# Contributing to AirWise

Thank you for contributing to AirWise. This guide covers local setup, code style, testing, and the architectural rules that keep AirWise safe, fast, and accessible.

## Local Setup

1. Install **Node.js 22+**.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
   Leave `GEMINI_API_KEY` empty to run in deterministic rule-based mode without external AI calls.
4. Start the server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

## npm Scripts

| Script                  | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `npm start`             | Start the HTTP server (`node src/server.js`)                                    |
| `npm run dev`           | Start the HTTP server with file watching (`node --watch`)                       |
| `npm run build`         | Syntax-check all JavaScript files in `src/`, `public/js/`, `tests/`, `scripts/` |
| `npm run typecheck`     | Static JSDoc type check via `tsc --noEmit -p jsconfig.json`                     |
| `npm test`              | Run unit, integration, accessibility, and hygiene tests via Jest                |
| `npm run test:coverage` | Run tests and generate coverage metrics                                         |
| `npm run lint`          | Run ESLint and Prettier check across the repository                             |
| `npm run format`        | Auto-format supported files with Prettier                                       |

## Architecture Rule: Rule Engine vs. AI Layer

- **Deterministic engine (`src/engine/*`, `src/knowledge/actions.js`)** chooses all recommendations, AQI bands, risk levels, dayparts, and commute CO₂e estimates. Never move decision logic into the LLM prompt.
- **Constrained Gemini layer (`src/services/geminiService.js`, `src/services/geminiSchema.js`)** only personalizes wording for the exact `actionId`s selected by the engine, under strict Zod validation and silent rule-based fallback (`copySource: "rules"`).
- **Privacy boundary**: Never send free-text city names, GPS coordinates, or `hasRespiratoryOrHeartCondition` to Gemini, and never log PII (use `src/utils/logger.js` instead of `console.*` inside `src/`).

## Code Style & JSDoc

- Use native ES modules (`type: "module"`), `const`/`let` (no `var`), strict equality (`===`), and Prettier formatting (`2` spaces, single quotes, trailing commas in ES5 positions, `100`-char print width).
- Every exported function, class, and exported arrow function in `src/` and `public/js/` must have JSDoc documenting parameters (`@param`) and return values (`@returns`), enforced by `eslint.config.js`.
- Keep runtime dependencies minimal (currently 6) and keep frontend assets strictly within budgets (`public/css/styles.css` < 30 KB, `public/js/*.js` < 60 KB, `public/fonts/*.woff2` < 150 KB).

## Accessibility & Localization Rules

- **Strict CSP & safe DOM**: Never add inline `<script>`, inline `style="..."`, external CDNs, or `.innerHTML` / `.outerHTML` / `.insertAdjacentHTML`. Build DOM nodes with `document.createElement` and `textContent`.
- **WCAG 2.1 AA**: Preserve semantic landmarks, heading order, keyboard navigation (combobox Arrow/Enter/Escape, disclosures with `aria-expanded` / `aria-controls`), focus management, `prefers-reduced-motion`, and non-colour AQI band indicators.
- **Bilingual parity**: Every user-visible string must be a locale key added to **both** `public/locales/en.json` and `public/locales/hi.json` with identical keys (enforced by automated tests).

## Pull Request Checklist

- [ ] `npm run lint` passes with zero errors or formatting diffs
- [ ] `npm run build` passes cleanly
- [ ] `npm run typecheck` passes with zero errors and no `@ts-ignore`
- [ ] `npm test` passes with zero failures (including `axe-core` accessibility checks)
- [ ] New user-visible copy exists in both `public/locales/en.json` and `public/locales/hi.json`
- [ ] No secrets, `.env`, `bun.lock`, or `.aistudio/` files are staged
- [ ] Documentation (`README.md`, `docs/`) updated if behaviour, scripts, or structure changed
