# AirWise Design Plan

## 1. Visual Concept: The Page Shows the Air

The single bold visual gesture on the page is the full-width hero skyline of a North Indian riverfront town at dusk: stepped ghats descending to a river, three temple spires (_shikhara_), flat residential rooftops with overhead water tanks and TV antennas, neem-like silhouettes, and a low sun disc.

The skyline is built as a lightweight (< 12 KB), hand-authored inline SVG with 5 depth layers (`far` to `near`) and `aria-hidden="true"`. A single `data-band` attribute on the hero (`good | satisfactory | moderate | poor | very-poor | severe`) drives CSS custom properties and layer opacities only — zero inline styles, zero JS style mutation:

- **Good**: crisp dusk blue-grey sky, sharp sun disc, all 5 layers legible.
- **Moderate** (default initial state before data loads): faint warmth along the horizon, distant ridge softened.
- **Poor**: sodium-amber haze veils the far skyline and softens the sun.
- **Very Poor / Severe**: thick ochre-brown inversion haze obscures far and mid silhouettes; at Severe even the nearest temple spire fades into low-contrast dusk.

When a plan arrives, the hero transitions once over 1.2s (`prefers-reduced-motion` switches instantaneously). Every other section stays calm, quiet, and readable.

## 2. Colour Palette (CSS Custom Properties)

### Light Theme ("Haze Paper")

| Token           | Hex       | Role & Contrast Notes                                                    |
| --------------- | --------- | ------------------------------------------------------------------------ |
| `--bg-page`     | `#E6E8E3` | Cool grey-green haze paper canvas (60% of viewport; never warm cream)    |
| `--bg-surface`  | `#EEF0EB` | Subtle elevated band / input surface (delta < 7%)                        |
| `--bg-panel`    | `#F5F6F2` | One soft form/summary panel (`14px` radius)                              |
| `--ink`         | `#1E2A32` | Smoke ink primary text (`> 11.5:1` on `#E6E8E3`)                         |
| `--ink-muted`   | `#55636C` | Secondary explanations & metadata (`5.1:1` on `#E6E8E3`)                 |
| `--accent`      | `#D98B1F` | Sodium amber primary action fill (paired with `#1E2A32` ink: `6.2:1`)    |
| `--accent-text` | `#8A5300` | Dark amber text/links on light backgrounds (`5.6:1` on `#E6E8E3`)        |
| `--positive`    | `#2E6B57` | River green for low-emission switches & Good band (`5.2:1` on `#E6E8E3`) |
| `--danger`      | `#A63A2B` | Ember red reserved strictly for Severe warnings & errors (`5.5:1`)       |
| `--dusk`        | `#3C5566` | Dusk blue secondary surfaces and mid skyline layers                      |
| `--border`      | `#C7CEC6` | Quiet 1px structural dividers                                            |

### Dark Theme ("Night Smog")

| Token           | Hex       | Role & Contrast Notes                                            |
| --------------- | --------- | ---------------------------------------------------------------- |
| `--bg-page`     | `#121B21` | Deep blue-black night smog canvas                                |
| `--bg-surface`  | `#19252D` | Quiet elevated band / input surface                              |
| `--bg-panel`    | `#1E2C35` | Soft panel container                                             |
| `--ink`         | `#E8ECEA` | Off-white high-legibility ink (`13.8:1` on `#121B21`)            |
| `--ink-muted`   | `#A7B6BF` | Muted metadata (`8.3:1` on `#121B21`)                            |
| `--accent`      | `#C9821E` | Warmer, dimmer sodium amber primary CTA (`#121B21` ink: `6.8:1`) |
| `--accent-text` | `#E5A94E` | Warm amber link/text on dark (`8.2:1`)                           |
| `--positive`    | `#63B398` | Luminous river green (`7.5:1`)                                   |
| `--danger`      | `#E37C6E` | Soft ember warning red (`6.3:1`)                                 |
| `--border`      | `#2D3F4B` | Hairline dark divider                                            |

All six CPCB AQI bands pair colour with a distinct geometric shape icon (circle, diamond, triangle, hexagon, octagon, square-cross) and explicit band text.

## 3. Typography (Self-Hosted, CSP-Safe)

- **Display face**: `Bricolage Grotesque` (self-hosted woff2, Latin subset) for the `AirWise` wordmark, hero `h1`, and section headings (`h2`).
- **Body & Devanagari face**: `Hind` (weights 400 and 600, self-hosted woff2, Latin + Devanagari subsets; falls back cleanly to `'Noto Sans Devanagari', system-ui, sans-serif` if any glyph is outside subset). Total self-hosted font payload kept strictly under 150 KB with OFL-1.1 licences in `public/fonts/`.
- **Type scale**: Hero `h1` `clamp(1.85rem, 4vw, 2.75rem)` tight leading `1.12`; `h2` `1.45rem`; body `1rem` (`16px`), measure `<= 70ch`, line-height `1.6` (`1.72` when `html[lang="hi"]`).
- **Discipline**: Sentence case everywhere, zero ALL-CAPS labels, zero eyebrow kickers, zero monospace micro-labels, zero arrows on buttons, no highlighted accent word in headlines.

## 4. Layout Sketch (Single Flowing Page, 740px Reading Measure)

```
+----------------------------------------------------------------------+
| Skip to main | AirWise                      [हिन्दी] [Night smog]    |
+----------------------------------------------------------------------+
|==================== FULL-WIDTH HAZE SKYLINE HERO ====================|
|  (5-layer North Indian ghat + shikhara + rooftops + sun inline SVG)  |
|                                                                      |
|  What can your family do about the air today?                        |
|  Tell us who is at home and how you get around...                    |
|                                                                      |
|  +----------------------------------------------------------------+  |
|  | We live in [City search____] with [2] adults, [1] children,    |  |
|  | and [0] elderly. Most days we travel by [car v] for [15] km.   |  |
|  | At home we live in [apartment v] and cook with [LPG v]. We     |  |
|  | [no purifier v] and prefer a [tight v] budget.                 |  |
|  | [x] Someone at home has a breathing or heart condition         |  |
|  |     (Not stored or logged; used only to make this plan.)       |  |
|  | [Use my location]   Enter PM2.5 reading yourself               |  |
|  | [ Make our plan ]                                              |  |
|  +----------------------------------------------------------------+  |
+======================================================================+
|  (Reading column: max-width 740px, 8px vertical grid)                |
|                                                                      |
|  Mathura right now: PM2.5 is 168 ug/m3, which is Very Poor...        |
|  Standard guidance · Open-Meteo model · Updated 08:00                |
|  [Good] [Satis.] [Mod.] [Poor] [*Very Poor*] [Severe] (shape+text)   |
|  ------------------------------------------------------------------  |
|  Your day (5-stop vertical timeline: Early morning -> Night)         |
|    o Early morning (05:30 - 07:30) — guidance + actions + [Show why] |
|    o School and work run ...                                         |
|    o Midday ...                                                      |
|    o Evening ...                                                     |
|    o Night ...                                                       |
|  ------------------------------------------------------------------  |
|  Inside your home (calm list with hairline dividers, plain cost/time)|
|  ------------------------------------------------------------------  |
|  Switches that add up (one plain commute table + disclosure)         |
|  ------------------------------------------------------------------  |
|  For your neighbourhood (list + [Print one page for notice board])   |
+----------------------------------------------------------------------+
| Footer: Open-Meteo & Google Gemini credits + not medical advice      |
+----------------------------------------------------------------------+
```

## 5. Five Design Principles

1. **Atmosphere once, quietness everywhere else**: Spend visual expression on the haze skyline; keep guidance calm, flat, and scannable for a worried parent.
2. **Real language over form grids**: Collect household details as two readable sentences (with native Hindi grammar in `hi.json`) rather than a bureaucratic spreadsheet.
3. **Never colour alone**: Every AQI severity band and status combines a distinct geometric shape, plain text label, and high-contrast token.
4. **Honest hierarchy, no card clutter**: Use whitespace, 1px dividers, and subtle surface shifts instead of boxed card grids, pills, or drop shadows (at most two radii: `6px` for controls, `14px` for the single onboarding panel).
5. **Respectful defaults**: Zero external network assets, strict CSP, `prefers-reduced-motion`, `prefers-color-scheme`, 44px touch targets, and instant printable notice-board mode.
