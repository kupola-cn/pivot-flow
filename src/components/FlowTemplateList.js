import { escapeAttr, escapeHTML } from './dom.js';

export function renderFlowTemplateListToHTML(templates = [], options = {}) {
  const entries = Array.isArray(templates) ? templates : [];

  if (entries.length === 0) {
    return `<div class="flow-empty flow-empty--compact">${escapeHTML(options.emptyText ?? 'No templates available.')}</div>`;
  }

  const content = options.groupBy === 'group'
    ? renderGroupedFlowTemplates(entries)
    : [
      '<ol class="flow-template-list">',
      ...entries.map(renderFlowTemplateItem),
      '</ol>'
    ].join('');

  return [
    '<section class="flow-template-panel">',
    '<div class="flow-panel-title">Templates</div>',
    content,
    '</section>'
  ].join('');
}

export function groupFlowTemplates(templates = []) {
  const groups = new Map();
  for (const template of Array.isArray(templates) ? templates : []) {
    const key = String(template?.group || 'flow');
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(template);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, items]) => ({
      key,
      label: key,
      templates: items
    }));
}

function renderGroupedFlowTemplates(templates) {
  return [
    '<div class="flow-template-groups">',
    ...groupFlowTemplates(templates).map((group) => [
      '<section class="flow-template-group">',
      '<div class="flow-list-group__title">',
      `<span>${escapeHTML(group.label)}</span>`,
      `<small>${escapeHTML(group.templates.length)}</small>`,
      '</div>',
      '<ol class="flow-template-list">',
      ...group.templates.map(renderFlowTemplateItem),
      '</ol>',
      '</section>'
    ].join('')),
    '</div>'
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
