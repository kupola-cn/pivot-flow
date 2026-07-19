import { escapeAttr, escapeHTML } from './dom.js';

export function renderFlowTemplateListToHTML(templates = [], options = {}) {
  const entries = Array.isArray(templates) ? templates : [];

  if (entries.length === 0) {
    return `<div class="flow-empty flow-empty--compact">${escapeHTML(options.emptyText ?? 'No templates available.')}</div>`;
  }

  return [
    '<section class="flow-template-panel">',
    '<div class="flow-panel-title">Templates</div>',
    '<ol class="flow-template-list">',
    ...entries.map(renderFlowTemplateItem),
    '</ol>',
    '</section>'
  ].join('');
}

function renderFlowTemplateItem(template) {
  return [
    '<li class="flow-template-list__item">',
    `<button type="button" class="flow-template-card" data-flow-action="create-from-template" data-template-id="${escapeAttr(template.id)}">`,
    '<span class="flow-template-card__main">',
    `<strong>${escapeHTML(template.name || template.id)}</strong>`,
    `<small>${escapeHTML(template.description || template.id)}</small>`,
    '</span>',
    `<span class="flow-badge">${escapeHTML(template.group || 'flow')}</span>`,
    '</button>',
    '</li>'
  ].join('');
}
