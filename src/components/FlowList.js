import { escapeHTML, escapeAttr } from './dom.js';

export function renderFlowListToHTML(flows = [], options = {}) {
  const entries = Array.isArray(flows) ? flows : [];

  if (entries.length === 0) {
    return `<div class="flow-empty">${escapeHTML(options.emptyText ?? 'No flows available.')}</div>`;
  }

  return [
    '<ol class="flow-list">',
    ...entries.map((flow) => renderFlowListItem(flow, options)),
    '</ol>'
  ].join('');
}

function renderFlowListItem(flow, options) {
  const active = options.activeId === flow.id;
  return [
    `<li class="flow-list__item${active ? ' is-active' : ''}">`,
    `<button type="button" class="flow-list__button" data-flow-id="${escapeAttr(flow.id)}" data-flow-action="select">`,
    '<span class="flow-list__main">',
    `<strong>${escapeHTML(flow.name || flow.id)}</strong>`,
    `<small>${escapeHTML(flow.description || flow.id)}</small>`,
    '</span>',
    `<span class="flow-badge flow-badge--${escapeAttr(flow.status)}">${escapeHTML(flow.status)}</span>`,
    '</button>',
    '</li>'
  ].join('');
}
