import { escapeHTML, formatJson } from './dom.js';

export function renderNodeInspectorToHTML(node) {
  if (!node) {
    return '<div class="flow-empty">Select a node to inspect its configuration.</div>';
  }

  return [
    '<div class="flow-inspector">',
    '<div class="flow-panel-title">Node inspector</div>',
    renderField('ID', node.id),
    renderField('Label', node.label),
    renderField('Type', node.type),
    renderField('Capability', node.capability || '-'),
    renderField('Risk', node.risk || 'low'),
    renderField('Confirm', node.requiresConfirmation ? 'yes' : 'no'),
    '<div class="flow-inspector__block">',
    '<span>Params</span>',
    `<pre>${escapeHTML(formatJson(node.params ?? {}))}</pre>`,
    '</div>',
    '</div>'
  ].join('');
}

function renderField(label, value) {
  return [
    '<div class="flow-inspector__field">',
    `<span>${escapeHTML(label)}</span>`,
    `<strong>${escapeHTML(value)}</strong>`,
    '</div>'
  ].join('');
}
