/* Safe DOM rendering module — uses createElement and textContent only (never innerHTML). */
import { bindDisclosure } from './a11y.js';
import { bandFromCategory } from './haze.js';

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

function svgEl(doc, tag, attrs = {}) {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function el(doc, tag, cls, text) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createBandShapeIcon(doc, shape) {
  const svg = svgEl(doc, 'svg', {
    class: 'aqi-segment-icon',
    viewBox: '0 0 20 20',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  if (shape === 'circle') {
    svg.appendChild(svgEl(doc, 'circle', { cx: 10, cy: 10, r: 7, fill: 'currentColor' }));
  } else if (BAND_POLYGONS[shape]) {
    svg.appendChild(svgEl(doc, 'polygon', { points: BAND_POLYGONS[shape], fill: 'currentColor' }));
  } else {
    svg.appendChild(
      svgEl(doc, 'rect', {
        x: 3,
        y: 3,
        width: 14,
        height: 14,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2.5,
      })
    );
    svg.appendChild(
      svgEl(doc, 'path', {
        d: 'M6 6 L14 14 M14 6 L6 14',
        stroke: 'currentColor',
        'stroke-width': 2.2,
      })
    );
  }
  return svg;
}

function createDaypartIcon(doc, daypart) {
  const svg = svgEl(doc, 'svg', {
    width: 18,
    height: 18,
    viewBox: '0 0 20 20',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'round',
  };
  if (daypart === 'school_work_run') {
    svg.appendChild(
      svgEl(doc, 'circle', {
        cx: 10,
        cy: 10,
        r: 7,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.8,
      })
    );
    svg.appendChild(svgEl(doc, 'path', { d: DAYPART_PATHS.school_work_run, ...stroke }));
  } else if (daypart === 'midday') {
    svg.appendChild(svgEl(doc, 'circle', { cx: 10, cy: 10, r: 4, fill: 'currentColor' }));
    svg.appendChild(svgEl(doc, 'path', { d: DAYPART_PATHS.midday, ...stroke }));
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

function formatObservedTime(isoString, lang) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return String(isoString);
    return date.toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(isoString);
  }
}

function createActionListItem(doc, item, t, idPrefix) {
  const li = el(doc, 'li', 'action-item');
  li.appendChild(
    el(
      doc,
      'p',
      item.id === 'seek_medical_care_if_symptoms'
        ? 'action-text action-text-urgent'
        : 'action-text',
      item.text
    )
  );

  const metaRow = el(doc, 'div', 'action-meta-row');
  metaRow.appendChild(
    el(doc, 'span', '', `${t(`action.cost.${item.cost}`)} · ${t(`action.effort.${item.effort}`)}`)
  );

  if (item.whyItMatters) {
    const whyId = `${idPrefix}-why-${item.id}`;
    const btn = el(doc, 'button', 'why-toggle-btn', t('action.showWhy'));
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', whyId);

    const panel = el(doc, 'div', 'why-panel');
    panel.id = whyId;
    panel.hidden = true;
    panel.appendChild(el(doc, 'p', '', item.whyItMatters));

    if (item.impact?.summary && item.impact.summary !== item.whyItMatters) {
      panel.appendChild(el(doc, 'p', 'why-effect', item.impact.summary));
    }

    bindDisclosure(btn, panel, {
      getClosedLabel: () => t('action.showWhy'),
      getOpenLabel: () => t('action.hideWhy'),
    });

    metaRow.appendChild(btn);
    li.append(metaRow, panel);
  } else {
    li.appendChild(metaRow);
  }
  return li;
}

function renderAqiScale(doc, container, activeBand, t) {
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

function renderCommuteImpact(doc, container, commuteImpact, t) {
  container.textContent = '';
  if (!commuteImpact) return;

  const scrollWrap = el(doc, 'div', 'impact-table-scroll');
  const table = el(doc, 'table', 'impact-table');
  table.appendChild(el(doc, 'caption', '', t('impact.table.caption')));

  const thead = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  for (const colKey of [
    'impact.table.colChoice',
    'impact.table.colDistance',
    'impact.table.colDaily',
    'impact.table.colMonthly',
  ]) {
    const th = el(doc, 'th', '', t(colKey));
    th.scope = 'col';
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = doc.createElement('tbody');
  const addRow = (label, dist, daily, monthly, positive = false) => {
    const tr = doc.createElement('tr');
    const th = el(doc, 'th', '', label);
    th.scope = 'row';
    const cls = positive ? 'impact-positive' : '';
    tr.append(th, el(doc, 'td', '', dist), el(doc, 'td', cls, daily), el(doc, 'td', cls, monthly));
    tbody.appendChild(tr);
  };

  const km = `${commuteImpact.kmPerDay} km`;
  const hasSavings = commuteImpact.dailyKgCO2Saved > 0;
  addRow(
    t('impact.table.currentRow', { mode: commuteImpact.currentLabel }),
    km,
    t('impact.table.baseline'),
    t('impact.table.baseline')
  );
  addRow(
    hasSavings
      ? t('impact.table.cleanerRow', { mode: commuteImpact.newLabel })
      : t('impact.table.alreadyLow'),
    km,
    `${commuteImpact.dailyKgCO2Saved} kg`,
    `${commuteImpact.monthlyKgCO2Saved} kg`,
    hasSavings
  );

  table.appendChild(tbody);
  scrollWrap.appendChild(table);
  container.append(scrollWrap, el(doc, 'p', 'impact-note', t('impact.estimateNote')));

  const toggleBtn = el(doc, 'button', 'text-action-btn no-print', t('impact.disclosure.open'));
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.setAttribute('aria-controls', 'impact-formula-panel');

  const formulaPanel = el(doc, 'div', 'disclosure-panel');
  formulaPanel.id = 'impact-formula-panel';
  formulaPanel.hidden = true;
  formulaPanel.appendChild(el(doc, 'p', 'formula-code', commuteImpact.formula));

  const ul = el(doc, 'ul', 'formula-list');
  for (const assumption of commuteImpact.assumptions || [])
    ul.appendChild(el(doc, 'li', '', assumption));
  formulaPanel.appendChild(ul);

  bindDisclosure(toggleBtn, formulaPanel, {
    getClosedLabel: () => t('impact.disclosure.open'),
    getOpenLabel: () => t('impact.disclosure.close'),
  });

  container.append(toggleBtn, formulaPanel);
}

/**
 * Render a plan response using textContent only.
 * @param {object} data
 * @param {object} opts
 * @returns {void}
 */
export function renderPlanResult(data, { doc = document, t, lang = 'en' }) {
  const byId = (id) => doc.getElementById(id);
  const planOutput = byId('plan-output');
  if (!planOutput || !data?.aqi || !data?.plan) return;

  const { aqi, risk, plan } = data;
  const bandSlug = bandFromCategory(aqi.band || aqi.category);
  const bandLabel = t(`aqi.band.${bandSlug}`);
  const place = aqi.placeLabel || t('result.defaultPlace');

  byId('plan-heading').textContent = plan.headline;

  const sourceLabel = plan.copySource === 'ai' ? t('source.ai') : t('source.rules');
  const dataSourceLabel =
    aqi.dataSource === 'manual' ? t('aqi.meta.sourceManual') : t('aqi.meta.sourceOpenMeteo');
  const timeStr = formatObservedTime(aqi.observedAt, lang);
  const pm10Part = typeof aqi.pm10 === 'number' ? ` · ${t('aqi.meta.pm10')} ${aqi.pm10} µg/m³` : '';
  byId('plan-meta-line').textContent =
    `${sourceLabel} · ${dataSourceLabel} · ${t('aqi.meta.updatedAt')} ${timeStr} · ${t('aqi.meta.dominant')}: ${aqi.dominantPollutant}${pm10Part}`;

  byId('plan-opening').textContent = t(`result.opening.${risk?.vulnerabilityLevel || 'standard'}`, {
    place,
    pm25: aqi.pm25,
    band: bandLabel,
    aqi: aqi.aqi,
  });

  renderAqiScale(doc, byId('aqi-scale-container'), bandSlug, t);
  byId('plan-summary').textContent = plan.summary;
  byId('plan-family-tip').textContent = plan.familyTip;

  byId('day-pattern-note').textContent =
    plan.bestHours && !plan.bestHours.isPattern && plan.bestHours.windowLabel
      ? t('section.day.hourlyNote', { window: plan.bestHours.windowLabel })
      : t('section.day.patternNote');

  const itemsById = new Map((plan.items || []).map((item) => [item.id, item]));
  const timelineList = byId('timeline-list');
  timelineList.textContent = '';

  for (const slot of plan.timeline || []) {
    const stopLi = el(doc, 'li', 'timeline-stop');
    const marker = el(doc, 'span', 'timeline-marker');
    marker.appendChild(createDaypartIcon(doc, slot.daypart));

    const header = el(doc, 'div', 'timeline-header');
    header.append(
      el(doc, 'h3', 'timeline-title', t(`daypart.${slot.daypart}`)),
      el(doc, 'span', 'timeline-window', slot.timeWindow)
    );
    stopLi.append(
      marker,
      header,
      el(doc, 'p', 'timeline-guidance', slot.guidanceKey ? t(slot.guidanceKey) : slot.guidance)
    );

    const slotActions = (slot.actionIds || [])
      .map((id) => itemsById.get(id))
      .filter(
        (item) =>
          item &&
          (item.category === 'daily_routine' ||
            item.id === 'timed_window_ventilation' ||
            item.id === 'close_windows_evening_night')
      );

    if (slotActions.length > 0) {
      const ul = el(doc, 'ul', 'timeline-actions');
      for (const action of slotActions)
        ul.appendChild(createActionListItem(doc, action, t, `tl-${slot.daypart}`));
      stopLi.appendChild(ul);
    }
    timelineList.appendChild(stopLi);
  }

  const anyDaily = (plan.sections?.daily_routine || []).filter((a) => a.daypart === 'any');
  if (anyDaily.length > 0 && timelineList.firstElementChild) {
    const urgentStop = timelineList.firstElementChild;
    let ul = urgentStop.querySelector('.timeline-actions');
    if (!ul) {
      ul = el(doc, 'ul', 'timeline-actions');
      urgentStop.appendChild(ul);
    }
    for (const urgentItem of anyDaily)
      ul.prepend(createActionListItem(doc, urgentItem, t, 'tl-urgent'));
  }

  const fillList = (id, items, prefix) => {
    const target = byId(id);
    target.textContent = '';
    for (const item of items || []) target.appendChild(createActionListItem(doc, item, t, prefix));
  };

  fillList('indoor-list', plan.sections?.indoor_air, 'indoor');
  fillList('sustainable-list', plan.sections?.sustainable_alternative, 'sustain');
  renderCommuteImpact(doc, byId('commute-impact-wrap'), plan.commuteImpact, t);
  fillList('community-list', plan.sections?.community, 'comm');

  planOutput.hidden = false;
}
