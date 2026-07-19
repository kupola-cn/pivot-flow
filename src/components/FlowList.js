import { escapeHTML, escapeAttr } from './dom.js';

export function renderFlowListToHTML(flows = [], options = {}) {
  const entries = filterFlows(flows, options);

  if (entries.length === 0) {
    return `<div class="flow-empty">${escapeHTML(options.emptyText ?? 'No flows available.')}</div>`;
  }

  if (options.groupBy === 'status' || options.groupBy === 'risk') {
    return renderGroupedFlowList(entries, options);
  }

  return [
    '<ol class="flow-list">',
    ...entries.map((flow) => renderFlowListItem(flow, options)),
    '</ol>'
  ].join('');
}

export function filterFlows(flows = [], options = {}) {
  const entries = Array.isArray(flows) ? flows : [];
  const keyword = String(options.keyword ?? '').trim().toLowerCase();
  const status = String(options.status ?? '').trim();
  const risk = String(options.risk ?? '').trim();

  return entries.filter((flow) => {
    if (status && flow.status !== status) {
      return false;
    }
    if (risk && getFlowRisk(flow) !== risk) {
      return false;
    }
    if (!keyword) {
      return true;
    }

    const haystack = [
      flow.id,
      flow.name,
      flow.description,
      flow.status,
      ...(flow.intent?.keywords ?? []),
      ...(flow.intent?.examples ?? [])
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(keyword);
  });
}

export function groupFlows(flows = [], options = {}) {
  const entries = Array.isArray(flows) ? flows : [];
  const groupBy = options.groupBy === 'risk' ? 'risk' : options.groupBy === 'status' ? 'status' : '';
  if (!groupBy) {
    return [{ key: '', label: '', flows: entries }];
  }

  const order = groupBy === 'risk'
    ? ['critical', 'high', 'medium', 'low', 'unknown']
    : ['published', 'draft', 'disabled', 'archived', 'unknown'];
  const groups = new Map(order.map((key) => [key, []]));

  for (const flow of entries) {
    const key = groupBy === 'risk'
      ? getFlowRisk(flow)
      : String(flow.status || 'unknown');
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(flow);
  }

  return Array.from(groups.entries())
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => ({
      key,
      label: groupBy === 'risk' ? `${key} risk` : key,
      flows: items
    }));
}

export function getFlowRisk(flow = {}) {
  const ranks = { low: 1, medium: 2, high: 3, critical: 4 };
  let highest = normalizeRisk(flow.risk);
  for (const node of Array.isArray(flow.nodes) ? flow.nodes : []) {
    const risk = normalizeRisk(node?.risk);
    if (risk && (ranks[risk] ?? 0) > (ranks[highest] ?? 0)) {
      highest = risk;
    }
  }

  return highest || 'low';
}

function renderGroupedFlowList(flows, options) {
  return [
    '<div class="flow-list-groups">',
    ...groupFlows(flows, options).map((group) => [
      '<section class="flow-list-group">',
      '<div class="flow-list-group__title">',
      `<span>${escapeHTML(group.label)}</span>`,
      `<small>${escapeHTML(group.flows.length)}</small>`,
      '</div>',
      '<ol class="flow-list">',
      ...group.flows.map((flow) => renderFlowListItem(flow, options)),
      '</ol>',
      '</section>'
    ].join('')),
    '</div>'
  ].join('');
}

function renderFlowListItem(flow, options) {
  const active = options.activeId === flow.id;
  const risk = getFlowRisk(flow);
  return [
    `<li class="flow-list__item${active ? ' is-active' : ''}">`,
    `<button type="button" class="flow-list__button" data-flow-id="${escapeAttr(flow.id)}" data-flow-action="select">`,
    '<span class="flow-list__main">',
    `<strong>${escapeHTML(flow.name || flow.id)}</strong>`,
    `<small>${escapeHTML(flow.description || flow.id)}</small>`,
    '</span>',
    '<span class="flow-list__badges">',
    `<span class="flow-badge flow-badge--${escapeAttr(flow.status)}">${escapeHTML(flow.status)}</span>`,
    `<span class="flow-badge flow-badge--${escapeAttr(risk)}">${escapeHTML(risk)}</span>`,
    '</span>',
    '</button>',
    '</li>'
  ].join('');
}

function normalizeRisk(value) {
  const risk = String(value || '').trim();
  return ['low', 'medium', 'high', 'critical'].includes(risk) ? risk : '';
}
