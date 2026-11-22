/* Safe DOM rendering module — uses createElement and textContent only (never innerHTML). */
import { bindDisclosure, byId } from './a11y.js';
import { bandFromCategory } from './haze.js';
import { createDaypartIcon, el, renderAqiScale } from './renderIcons.js';

const SPECIAL_ACTION_IDS = Object.freeze({
  urgentMedicalCare: 'seek_medical_care_if_symptoms',
  timelineVentilation: Object.freeze(['timed_window_ventilation', 'close_windows_evening_night']),
});

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
  const urgent = item.id === SPECIAL_ACTION_IDS.urgentMedicalCare;
  li.appendChild(
    el(doc, 'p', urgent ? 'action-text action-text-urgent' : 'action-text', item.text)
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
    const impactSummary = item.impact?.summaryKey ? t(item.impact.summaryKey) : '';
    if (impactSummary && impactSummary !== item.whyItMatters) {
      panel.appendChild(el(doc, 'p', 'why-effect', impactSummary));
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

function buildCommuteTable(doc, impact, t) {
  const table = el(doc, 'table', 'impact-table');
  table.appendChild(el(doc, 'caption', '', t('impact.table.caption')));
  const thead = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  for (const k of ['colChoice', 'colDistance', 'colDaily', 'colMonthly']) {
    const th = el(doc, 'th', '', t(`impact.table.${k}`));
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

  const currentLabel = t(impact.currentLabelKey);
  const newLabel = t(impact.newLabelKey);
  const km = t('impact.unit.km', { value: impact.kmPerDay });
  const saved = impact.dailyKgCO2Saved > 0;
  addRow(
    t('impact.table.currentRow', { mode: currentLabel }),
    km,
    t('impact.table.baseline'),
    t('impact.table.baseline')
  );
  addRow(
    saved ? t('impact.table.cleanerRow', { mode: newLabel }) : t('impact.table.alreadyLow'),
    km,
    t('impact.unit.kg', { value: impact.dailyKgCO2Saved }),
    t('impact.unit.kg', { value: impact.monthlyKgCO2Saved }),
    saved
  );
  table.appendChild(tbody);
  return table;
}

function renderCommuteImpact(doc, container, commuteImpact, t) {
  container.textContent = '';
  if (!commuteImpact) return;

  const scrollWrap = el(doc, 'div', 'impact-table-scroll');
  scrollWrap.appendChild(buildCommuteTable(doc, commuteImpact, t));
  container.append(scrollWrap, el(doc, 'p', 'impact-note', t('impact.estimateNote')));

  const toggleBtn = el(doc, 'button', 'text-action-btn no-print', t('impact.disclosure.open'));
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.setAttribute('aria-controls', 'impact-formula-panel');

  const panel = el(doc, 'div', 'disclosure-panel');
  panel.id = 'impact-formula-panel';
  panel.hidden = true;
  const formulaText = t(commuteImpact.formulaKey, commuteImpact.formulaParams || {});
  panel.appendChild(el(doc, 'p', 'formula-code', formulaText));

  const ul = el(doc, 'ul', 'formula-list');
  const assumptions = (commuteImpact.assumptionKeys || []).map((entry) =>
    typeof entry === 'string' ? t(entry) : t(entry.key, entry.params || {})
  );
  for (const a of assumptions) ul.appendChild(el(doc, 'li', '', a));
  panel.appendChild(ul);

  bindDisclosure(toggleBtn, panel, {
    getClosedLabel: () => t('impact.disclosure.open'),
    getOpenLabel: () => t('impact.disclosure.close'),
  });
  container.append(toggleBtn, panel);
}

function renderPlanHeader(doc, getEl, { aqi, risk, plan, t, lang }) {
  const bandSlug = bandFromCategory(aqi.band || aqi.category);
  const place = aqi.placeLabel || t('result.defaultPlace');
  getEl('plan-heading').textContent = plan.headline;

  const copyLabel = t(plan.copySource === 'ai' ? 'source.ai' : 'source.rules');
  const dataLabel = t(
    aqi.dataSource === 'manual' ? 'aqi.meta.sourceManual' : 'aqi.meta.sourceOpenMeteo'
  );
  const timeStr = formatObservedTime(aqi.observedAt, lang);
  const pm10Part = typeof aqi.pm10 === 'number' ? ` · ${t('aqi.meta.pm10')} ${aqi.pm10} µg/m³` : '';
  getEl('plan-meta-line').textContent =
    `${copyLabel} · ${dataLabel} · ${t('aqi.meta.updatedAt')} ${timeStr} · ${t('aqi.meta.dominant')}: ${aqi.dominantPollutant}${pm10Part}`;

  getEl('plan-opening').textContent = t(
    `result.opening.${risk?.vulnerabilityLevel || 'standard'}`,
    {
      place,
      pm25: aqi.pm25,
      band: t(`aqi.band.${bandSlug}`),
      aqi: aqi.aqi,
    }
  );

  renderAqiScale(doc, getEl('aqi-scale-container'), bandSlug, t);
  getEl('plan-summary').textContent = plan.summary;
  getEl('plan-family-tip').textContent = plan.familyTip;
}

function renderTimeline(doc, getEl, plan, t) {
  getEl('day-pattern-note').textContent =
    plan.bestHours && !plan.bestHours.isPattern && plan.bestHours.windowLabel
      ? t('section.day.hourlyNote', { window: plan.bestHours.windowLabel })
      : t('section.day.patternNote');

  const itemsById = new Map((plan.items || []).map((item) => [item.id, item]));
  const list = getEl('timeline-list');
  list.textContent = '';

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
            SPECIAL_ACTION_IDS.timelineVentilation.includes(item.id))
      );

    if (slotActions.length > 0) {
      const ul = el(doc, 'ul', 'timeline-actions');
      for (const action of slotActions)
        ul.appendChild(createActionListItem(doc, action, t, `tl-${slot.daypart}`));
      stopLi.appendChild(ul);
    }
    list.appendChild(stopLi);
  }

  const anyDaily = (plan.sections?.daily_routine || []).filter((a) => a.daypart === 'any');
  if (anyDaily.length > 0 && list.firstElementChild) {
    const stop = list.firstElementChild;
    let ul = stop.querySelector('.timeline-actions');
    if (!ul) {
      ul = el(doc, 'ul', 'timeline-actions');
      stop.appendChild(ul);
    }
    for (const item of anyDaily) ul.prepend(createActionListItem(doc, item, t, 'tl-urgent'));
  }
}

function renderActionSection(doc, target, items, t, prefix) {
  target.textContent = '';
  for (const item of items || []) target.appendChild(createActionListItem(doc, item, t, prefix));
}

/**
 * Render a plan response using textContent only.
 * @param {import('../../src/types.d.ts').PlanResponse} data
 * @param {{ doc?: Document, t: import('../../src/types.d.ts').TranslateFn, lang?: import('../../src/types.d.ts').LanguageCode }} opts
 * @returns {void}
 */
export function renderPlanResult(data, { doc = document, t, lang = 'en' }) {
  const getEl = (id) => byId(id, doc);
  const planOutput = getEl('plan-output');
  if (!planOutput || !data?.aqi || !data?.plan) return;

  const { aqi, risk, plan } = data;
  renderPlanHeader(doc, getEl, { aqi, risk, plan, t, lang });
  renderTimeline(doc, getEl, plan, t);
  renderActionSection(doc, getEl('indoor-list'), plan.sections?.indoor_air, t, 'indoor');
  renderActionSection(
    doc,
    getEl('sustainable-list'),
    plan.sections?.sustainable_alternative,
    t,
    'sustain'
  );
  renderCommuteImpact(doc, getEl('commute-impact-wrap'), plan.commuteImpact, t);
  renderActionSection(doc, getEl('community-list'), plan.sections?.community, t, 'comm');
  planOutput.hidden = false;
}
