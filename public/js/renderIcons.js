const SVG_NS = 'http://www.w3.org/2000/svg';
const AQI_BANDS = [
  { slug: 'good', range: '0–50', shape: 'circle' },
  { slug: 'satisfactory', range: '51–100', shape: 'diamond' },
  { slug: 'moderate', range: '101–200', shape: 'triangle' },
  { slug: 'poor', range: '201–300', shape: 'hexagon' },
  { slug: 'very-poor', range: '301–400', shape: 'octagon' },
  { slug: 'severe', range: '401–500', shape: 'cross' },
];
const BAND_POLYGONS = {
  diamond: '10,2 18,10 10,18 2,10',
  triangle: '10,2 18,17 2,17',
  hexagon: '6,2 14,2 18,10 14,18 6,18 2,10',
  octagon: '7,2 13,2 18,7 18,13 13,18 7,18 2,13 2,7',
};
const DAYPART_PATHS = {
  early_morning: 'M3 14 H17 M6 14 A4 4 0 0 1 14 14 M10 5 V8',
  school_work_run: 'M10 6 V10 L13 12',
  midday: 'M10 2 V4 M10 16 V18 M2 10 H4 M16 10 H18',
  evening: 'M3 13 H17 M6 13 A4 4 0 0 1 14 13 M5 16 H15',
};

const SVG_BASE = { viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' };

function svgEl(doc, tag, attrs = {}) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Create a DOM element with optional class and text.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} [cls]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(doc, tag, cls, text) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createBandShapeIcon(doc, shape) {
  const svg = svgEl(doc, 'svg', { class: 'aqi-segment-icon', ...SVG_BASE });
  if (shape === 'circle') {
    svg.appendChild(svgEl(doc, 'circle', { cx: 10, cy: 10, r: 7, fill: 'currentColor' }));
  } else if (BAND_POLYGONS[shape]) {
    svg.appendChild(svgEl(doc, 'polygon', { points: BAND_POLYGONS[shape], fill: 'currentColor' }));
  } else {
    svg.append(
      svgEl(doc, 'rect', {
        x: 3,
        y: 3,
        width: 14,
        height: 14,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2.5,
      }),
      svgEl(doc, 'path', {
        d: 'M6 6 L14 14 M14 6 L6 14',
        stroke: 'currentColor',
        'stroke-width': 2.2,
      })
    );
  }
  return svg;
}

/**
 * Build an inline SVG icon for a timeline daypart.
 * @param {Document} doc
 * @param {string} daypart
 * @returns {SVGElement}
 */
export function createDaypartIcon(doc, daypart) {
  const svg = svgEl(doc, 'svg', { width: 18, height: 18, ...SVG_BASE });
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'round',
  };
  if (daypart === 'school_work_run') {
    svg.append(
      svgEl(doc, 'circle', { cx: 10, cy: 10, r: 7, ...stroke }),
      svgEl(doc, 'path', { d: DAYPART_PATHS.school_work_run, ...stroke })
    );
  } else if (daypart === 'midday') {
    svg.append(
      svgEl(doc, 'circle', { cx: 10, cy: 10, r: 4, fill: 'currentColor' }),
      svgEl(doc, 'path', { d: DAYPART_PATHS.midday, ...stroke })
    );
  } else if (DAYPART_PATHS[daypart]) {
    svg.appendChild(svgEl(doc, 'path', { d: DAYPART_PATHS[daypart], ...stroke }));
  } else {
    svg.appendChild(
      svgEl(doc, 'path', {
        d: 'M13 4 A6.5 6.5 0 1 0 16 13.5 A5.2 5.2 0 1 1 13 4 Z',
        fill: 'currentColor',
      })
    );
  }
  return svg;
}

/**
 * Render the 6-band CPCB AQI visual scale with active marker.
 * @param {Document} doc
 * @param {HTMLElement} container
 * @param {string} activeBand
 * @param {import('../../src/types.d.ts').TranslateFn} t
 * @returns {void}
 */
export function renderAqiScale(doc, container, activeBand, t) {
  container.textContent = '';
  const list = el(doc, 'ul', 'aqi-scale');
  list.setAttribute('aria-label', t('aqi.scaleLabel'));

  for (const band of AQI_BANDS) {
    const li = el(doc, 'li', 'aqi-segment');
    li.setAttribute('data-band', band.slug);
    const isCurrent = band.slug === activeBand;
    if (isCurrent) li.setAttribute('aria-current', 'true');
    li.append(
      createBandShapeIcon(doc, band.shape),
      el(doc, 'span', '', t(`aqi.band.${band.slug}`)),
      el(doc, 'span', 'aqi-segment-range', band.range)
    );
    if (isCurrent) li.appendChild(el(doc, 'span', 'aqi-current-label', t('aqi.currentMarker')));
    list.appendChild(li);
  }
  container.appendChild(list);
}
