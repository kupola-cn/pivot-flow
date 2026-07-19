import { escapeHTML } from './dom.js';

export function renderIntentPatternEditorToHTML(flow) {
  const intent = flow?.intent ?? {};
  return [
    '<div class="flow-intent-editor">',
    '<div class="flow-panel-title">Intent patterns</div>',
    renderList('Examples', intent.examples),
    renderList('Keywords', intent.keywords),
    renderList('Patterns', intent.patterns),
    '</div>'
  ].join('');
}

function renderList(label, values = []) {
  const entries = Array.isArray(values) ? values : [];
  if (entries.length === 0) {
    return `<div class="flow-empty flow-empty--compact">${escapeHTML(label)} not configured.</div>`;
  }

  return [
    `<div class="flow-intent-editor__label">${escapeHTML(label)}</div>`,
    '<ol class="flow-token-list">',
    ...entries.map((value) => `<li>${escapeHTML(value)}</li>`),
    '</ol>'
  ].join('');
}
